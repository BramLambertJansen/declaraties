// Overzicht van de meethook (ADR 0029 punt 12): `pnpm meting [--json] [--sessie <id>] [--branch <naam>]`.
// Leest `<opslagmap>/*.jsonl` (.claude/hooks/lib/meting.mjs: METING_DIR of `<git common dir>/agent-meting`) en telt per
// sessie en per branch: prompts (permissievragen) per pad of commandoprefix en per modus (`m`, ontbrekend → onbekend), weigeringen, beurten, eigenaarberichten na de
// opdracht (een bovengrens), pushes (geslaagde `git push`) en CI-rondes via `gh run list` (METING_GH, METING_GH_TIMEOUT_MS):
// runs met `createdAt` van de eerste `t` van de sessie op die branch tot de laatste `t` + 60 minuten; een fout, timeout of
// ongeldige uitvoer geeft "onbekend". Kapotte regels slaat hij over. Sleutels zijn vrije tekst: alles in Maps en
// prototypeloze objecten.
// Getest in test/rails/meting-overzicht.test.ts.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { opslagmap } from '../../.claude/hooks/lib/meting.mjs';

/** @typedef {{ e: string, s: string, b: string, k: string, m: string, id: string | undefined, t: number | undefined, opdracht?: boolean }} Regel */
/** @typedef {{ prompts: number, promptsPerSleutel: Map<string, number>, promptsPerModus: Map<string, number>, weigeringen: number, weigeringenPerSleutel: Map<string, number>, beurten: number, eigenaarberichten: number, pushes: number }} Telling */
/** @typedef {number | 'onbekend'} Ci */
/** @typedef {{ van: number, tot: number } | null} Venster */
/** @typedef {(branch: string, venster: Venster) => Ci} CiVoor */

const UUR = 60 * 60 * 1000;

/** @param {unknown} value @param {string} fallback */
function tekst(value, fallback) {
  return typeof value === 'string' ? value : fallback;
}

/** Tijd in ms, of undefined. @param {unknown} value */
function tijd(value) {
  const ms = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isNaN(ms) ? undefined : ms;
}

/** @param {string} lijn @param {string} sessie */
function parse(lijn, sessie) {
  try {
    /** @type {unknown} */
    const waarde = JSON.parse(lijn);
    if (typeof waarde !== 'object' || waarde === null || Array.isArray(waarde)) return null;
    const r = new Map(Object.entries(waarde));
    const e = r.get('e');
    if (typeof e !== 'string') return null;
    const id = r.get('id');
    const m = r.get('m');
    /** @type {Regel} */
    const uit = {
      e,
      s: tekst(r.get('s'), sessie),
      b: tekst(r.get('b'), 'onbekend'),
      k: tekst(r.get('k'), ''),
      m: typeof m === 'string' && /^[a-zA-Z]+$/.test(m) ? m : 'onbekend',
      id: typeof id === 'string' ? id : undefined,
      t: tijd(r.get('t')),
    };
    return uit;
  } catch {
    return null;
  }
}

/** De meetbestanden in `dir`, gesorteerd; een ontbrekende map is leeg. @param {string} dir */
function bestanden(dir) {
  try {
    return readdirSync(dir)
      .filter((naam) => naam.endsWith('.jsonl'))
      .sort();
  } catch {
    return [];
  }
}

/** Alle regels per sessie, in bestandsvolgorde; zonder map geen. @param {string | null} dir */
function lees(dir) {
  /** @type {Map<string, Regel[]>} */
  const perSessie = new Map();
  if (dir === null) return perSessie;
  for (const naam of bestanden(dir)) {
    const regels = readFileSync(path.join(dir, naam), 'utf8')
      .split('\n')
      .map((lijn) => parse(lijn, naam.slice(0, -'.jsonl'.length)))
      .filter((r) => r !== null);
    for (const r of regels) perSessie.set(r.s, [...(perSessie.get(r.s) ?? []), r]);
  }
  return perSessie;
}

/** @returns {Telling} */
function leeg() {
  return {
    prompts: 0,
    promptsPerSleutel: new Map(),
    promptsPerModus: new Map(),
    weigeringen: 0,
    weigeringenPerSleutel: new Map(),
    beurten: 0,
    eigenaarberichten: 0,
    pushes: 0,
  };
}

/** @param {Map<string, number>} teller @param {string} k */
function plus(teller, k) {
  teller.set(k, (teller.get(k) ?? 0) + 1);
}

/**
 * Een weigering: een PermissionDenied, of een PreToolUse zonder Post(Failure) met hetzelfde id (rolhek, de eigenaar zei nee).
 * Een id met beide telt één keer.
 * @param {readonly Regel[]} regels
 */
function weigeringen(regels) {
  const afgerond = new Set(regels.filter((r) => r.e.startsWith('PostToolUse')).map((r) => r.id));
  const geweigerd = regels.filter((r) => r.e === 'PermissionDenied');
  const ids = new Set(geweigerd.map((r) => r.id).filter((id) => id !== undefined));
  const zonderPost = regels.filter(
    (r) => r.e === 'PreToolUse' && r.id !== undefined && !afgerond.has(r.id) && !ids.has(r.id),
  );
  return new Set([...geweigerd, ...zonderPost]);
}

/** @param {Telling} t @param {Regel} r @param {boolean} geweigerd */
function tel(t, r, geweigerd) {
  if (r.e === 'PermissionRequest') {
    t.prompts += 1;
    plus(t.promptsPerSleutel, r.k);
    plus(t.promptsPerModus, r.m);
  }
  if (geweigerd) {
    t.weigeringen += 1;
    plus(t.weigeringenPerSleutel, r.k);
  }
  if (r.e === 'Stop') t.beurten += 1;
  if (r.e === 'UserPromptSubmit' && r.opdracht !== true) t.eigenaarberichten += 1;
  if (r.e === 'PostToolUse' && r.k === 'git push') t.pushes += 1;
}

/** Het eerste bericht van de sessie is de opdracht, geen correctie. @param {readonly Regel[]} regels */
function markeerOpdracht(regels) {
  const eerste = regels.findIndex((r) => r.e === 'UserPromptSubmit');
  return regels.map((r, i) => (i === eerste ? { ...r, opdracht: true } : r));
}

/** Eerste `t` tot laatste `t` + 60 minuten; zonder tijden null. @param {readonly Regel[]} regels @returns {Venster} */
function venster(regels) {
  const tijden = regels.map((r) => r.t).filter((t) => t !== undefined);
  return tijden.length === 0 ? null : { van: Math.min(...tijden), tot: Math.max(...tijden) + UUR };
}

/** @param {readonly Regel[]} alle @param {string | undefined} filterBranch @param {CiVoor} ciVoor */
function sessieTelling(alle, filterBranch, ciVoor) {
  const gemarkeerd = markeerOpdracht(alle);
  const geweigerd = weigeringen(gemarkeerd);
  const regels = gemarkeerd.filter((r) => filterBranch === undefined || r.b === filterBranch);
  const totaal = leeg();
  /** @type {Map<string, Regel[]>} */
  const perBranch = new Map();
  for (const r of regels) {
    tel(totaal, r, geweigerd.has(r));
    perBranch.set(r.b, [...(perBranch.get(r.b) ?? []), r]);
  }
  /** @type {Map<string, Telling & { ciRondes: Ci }>} */
  const branches = new Map();
  for (const [naam, lijst] of perBranch) {
    const t = leeg();
    for (const r of lijst) tel(t, r, geweigerd.has(r));
    branches.set(naam, { ...t, ciRondes: ciVoor(naam, venster(lijst)) });
  }
  return { ...totaal, ciRondes: som([...branches.values()].map((t) => t.ciRondes)), branches };
}

/** De som, of "onbekend" zodra één branch onbekend is. @param {readonly Ci[]} waarden @returns {Ci} */
function som(waarden) {
  let totaal = 0;
  for (const waarde of waarden) {
    if (waarde === 'onbekend') return 'onbekend';
    totaal += waarde;
  }
  return totaal;
}

/**
 * Aanmaaktijden van de CI-runs van een branch via `<gh> run list` (zonder shell, met timeout); null bij een fout.
 * @param {string} gh
 * @param {string} branch
 * @param {number} timeout
 */
function runTijden(gh, branch, timeout) {
  if (branch === 'onbekend' || branch === 'detached' || branch.startsWith('-')) return null;
  try {
    const args = ['run', 'list', `--branch=${branch}`, '--json', 'databaseId,createdAt', '--limit', '200'];
    const uit = execFileSync(gh, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] });
    /** @type {unknown} */
    const runs = JSON.parse(uit);
    if (!Array.isArray(runs)) return null;
    return runs.map((run) =>
      typeof run === 'object' && run !== null ? tijd(new Map(Object.entries(run)).get('createdAt')) : undefined,
    );
  } catch {
    return null;
  }
}

/**
 * CI-rondes van een branch binnen het sessievenster; één gh-aanroep per branch.
 * @param {Record<string, string | undefined>} env
 * @returns {CiVoor}
 */
export function ghCi(env) {
  const gh = env['METING_GH'] === undefined || env['METING_GH'] === '' ? 'gh' : env['METING_GH'];
  const ms = Number(env['METING_GH_TIMEOUT_MS']);
  const timeout = Number.isFinite(ms) && ms > 0 ? ms : 10_000;
  /** @type {Map<string, (number | undefined)[] | null>} */
  const cache = new Map();
  return (branch, bereik) => {
    const tijden = cache.has(branch) ? (cache.get(branch) ?? null) : runTijden(gh, branch, timeout);
    cache.set(branch, tijden);
    if (tijden === null || bereik === null) return 'onbekend';
    return tijden.filter((t) => t !== undefined && t >= bereik.van && t <= bereik.tot).length;
  };
}

/** @param {string | null} dir @param {{ sessie?: string, branch?: string }} filter @param {CiVoor} ciVoor */
export function overzicht(dir, filter, ciVoor) {
  const perSessie = lees(dir);
  /** @type {Map<string, ReturnType<typeof sessieTelling>>} */
  const sessies = new Map();
  for (const sessie of [...perSessie.keys()].sort()) {
    if (filter.sessie !== undefined && sessie !== filter.sessie) continue;
    const regels = perSessie.get(sessie) ?? [];
    if (filter.branch !== undefined && !regels.some((r) => r.b === filter.branch)) continue;
    sessies.set(sessie, sessieTelling(regels, filter.branch, ciVoor));
  }
  return sessies;
}

/**
 * Een Map als JSON-object zonder prototype: een sleutel als `__proto__` blijft een gewone sleutel.
 * @template T, U
 * @param {Map<string, T>} map
 * @param {(waarde: T) => U} [omzetten]
 * @returns {Record<string, T | U>}
 */
function object(map, omzetten) {
  /** @type {Record<string, T | U>} */
  const uit = Object.create(null);
  for (const [k, v] of map) uit[k] = omzetten === undefined ? v : omzetten(v);
  return uit;
}

/** @param {Telling & { ciRondes: Ci }} t */
function tellingJson(t) {
  return {
    ...t,
    promptsPerSleutel: object(t.promptsPerSleutel),
    promptsPerModus: object(t.promptsPerModus),
    weigeringenPerSleutel: object(t.weigeringenPerSleutel),
  };
}

/** @param {ReturnType<typeof overzicht>} sessies */
export function alsJson(sessies) {
  const uit = object(sessies, (s) => ({ ...tellingJson(s), branches: object(s.branches, tellingJson) }));
  return `${JSON.stringify({ sessies: uit }, null, 2)}\n`;
}

/** @param {Map<string, number>} teller */
function perSleutel(teller) {
  const delen = [...teller].sort(([, a], [, b]) => b - a).map(([k, n]) => `${k === '' ? '(geen)' : k} ${String(n)}`);
  return delen.length === 0 ? '' : ` (${delen.join(', ')})`;
}

/** @param {Telling & { ciRondes: Ci }} t */
function regelTekst(t) {
  const ci = `pushes ${String(t.pushes)} · ci-rondes ${String(t.ciRondes)}`;
  return `beurten ${String(t.beurten)} · eigenaarberichten ${String(t.eigenaarberichten)} · ${ci}`;
}

/** @param {string} naam @param {Telling & { ciRondes: Ci }} b */
function branchTekst(naam, b) {
  return [
    `  branch ${naam}: prompts ${String(b.prompts)}${perSleutel(b.promptsPerSleutel)}`,
    `    prompts per modus${perSleutel(b.promptsPerModus)}`,
    `    weigeringen ${String(b.weigeringen)}${perSleutel(b.weigeringenPerSleutel)} · ${regelTekst(b)}`,
  ];
}

/** @param {ReturnType<typeof overzicht>} sessies @param {string | null} dir */
export function alsTekst(sessies, dir) {
  if (sessies.size === 0) return `Geen metingen in ${dir ?? '(geen git-repo en geen METING_DIR)'}.\n`;
  const regels = [];
  for (const [sessie, t] of sessies) {
    regels.push(`sessie ${sessie}`, `  prompts ${String(t.prompts)}${perSleutel(t.promptsPerSleutel)}`);
    regels.push(`  prompts per modus${perSleutel(t.promptsPerModus)}`);
    regels.push(`  weigeringen ${String(t.weigeringen)}${perSleutel(t.weigeringenPerSleutel)}`, `  ${regelTekst(t)}`);
    for (const [naam, b] of t.branches) regels.push(...branchTekst(naam, b));
  }
  return `${regels.join('\n')}\n`;
}

/** @param {readonly string[]} args */
function opties(args) {
  /** @type {(naam: string) => string | undefined} */
  const waarde = (naam) => {
    const i = args.indexOf(naam);
    return i === -1 ? undefined : args[i + 1];
  };
  return { json: args.includes('--json'), sessie: waarde('--sessie'), branch: waarde('--branch') };
}

const args = opties(process.argv.slice(2));
const dir = opslagmap(process.cwd(), process.env);
const filter = {
  ...(args.sessie === undefined ? {} : { sessie: args.sessie }),
  ...(args.branch === undefined ? {} : { branch: args.branch }),
};
const data = overzicht(dir, filter, ghCi(process.env));
process.stdout.write(args.json ? alsJson(data) : alsTekst(data, dir));
