// Bytes van het verplichte leespad per scenario (V2 meten): `pnpm leespad [--json] [--ref <git-ref>]`.
// Zonder --ref uit de werkmap, met --ref via `git show <ref>:<pad>`. Een bestand dat er niet is telt 0 en staat in `ontbreekt`.
// Van docs/framework.md telt alleen de tekst vóór de eerste `## `-kop plus hoofdstuk 8 met 8a, 8b… (`hoofdstukTekst`, zoals
// `feiten.mjs hoofdstuk 8`); zonder §8 het hele bestand. Per scenario staan streefdoel en waarschuwingsdrempel (ADR 0064
// punt 1), daarna de meldingen vanaf 85 % van een harde grens en de metingen tegenover hun streefwaarde (ADR 0065): "let op"
// erboven, nooit een overtreding of andere exitcode.
// Getest in test/rails/meting-kerncijfers-leespad.test.ts en test/rails/leesbudget.test.ts.
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aantalRegels, grensMeldingen, KB } from './leesbudget.mjs';

const REGELBOEK = 'docs/framework.md';

export const SCENARIOS = {
  'nieuwe-feature': [
    'AGENTS.md',
    'CLAUDE.md',
    '.claude/agents/architect.md',
    '.claude/skills/spec/SKILL.md',
    'docs/framework.md',
    'docs/gouden-pad.md',
    'docs/dod.md',
  ],
  'lichte-fix': ['AGENTS.md', 'CLAUDE.md', '.claude/agents/developer.md'],
  review: ['.claude/agents/reviewer.md', 'docs/dod.md', 'docs/framework.md'],
};

/** Waarschuwingsdrempel en streefdoel per scenario, in bytes (ADR 0064 punt 1). @type {Record<string, { drempel: number, streefdoel?: number }>} */
export const DOELEN = {
  'nieuwe-feature': { drempel: 56 * KB, streefdoel: 25 * KB },
  'lichte-fix': { drempel: 28 * KB },
  review: { drempel: 16 * KB },
};

/** De tekst vóór de eerste `## `-kop en de stukken van elke `## `-kop tot de volgende. @param {string} tekst */
function stukken(tekst) {
  const koppen = [...tekst.matchAll(/^## /gm)].map((m) => m.index);
  return {
    voor: tekst.slice(0, koppen[0] ?? tekst.length),
    delen: koppen.map((start, i) => tekst.slice(start, koppen[i + 1] ?? tekst.length)),
  };
}

/** Het nummer van een hoofdstukkop (`## 8a. …` → `8a`), of undefined. @param {string} deel */
function nummer(deel) {
  return /^## (\d+[a-z]?)\./.exec(deel)?.[1];
}

/**
 * De tekst vóór de eerste `## `-kop plus hoofdstuk `n`, van zijn kop tot de volgende `## `-kop; bij een nummer zonder
 * letter (`8`) ook de letter-subhoofdstukken (`8a`, `8b`). Onbekend: null.
 * @param {string} framework @param {string} n
 */
export function hoofdstukTekst(framework, n) {
  if (!/^\d+[a-z]?$/.test(n)) return null;
  const { voor, delen } = stukken(framework);
  const gekozen = delen.filter((deel) => {
    const nr = nummer(deel);
    return nr === n || (/^\d+$/.test(n) && nr !== undefined && nr.replace(/[a-z]$/, '') === n);
  });
  return gekozen.length === 0 ? null : voor + gekozen.join('');
}

/** Wat van een bestand in het leespad telt. @param {string} pad @param {string | Buffer} inhoud */
function telbaar(pad, inhoud) {
  if (pad !== REGELBOEK) return inhoud;
  const tekst = inhoud.toString();
  return hoofdstukTekst(tekst, '8') ?? tekst;
}

/**
 * @param {(pad: string) => string | Buffer | null} lees null: het bestand bestaat niet
 * @param {Record<string, readonly string[]>} scenarios
 */
export function leespad(lees, scenarios) {
  /** @type {Record<string, { bytes: number, ontbreekt: string[] }>} */
  const uit = {};
  for (const [naam, paden] of Object.entries(scenarios)) {
    const telling = { bytes: 0, ontbreekt: /** @type {string[]} */ ([]) };
    for (const pad of paden) {
      const inhoud = lees(pad);
      if (inhoud === null) telling.ontbreekt.push(pad);
      else telling.bytes += Buffer.byteLength(telbaar(pad, inhoud));
    }
    uit[naam] = telling;
  }
  return uit;
}

/** @typedef {{ naam: string, waarde: number }} Eenheid */
/** @typedef {{ streefwaarde: number | null, eenheid: 'bytes' | 'regels', aantal: number, boven: number, grootste: Eenheid[] }} Meting */

/** Streefwaarde, eenheid en welke paden per soort tellen (ADR 0065 punt 2); operations zonder streefwaarde. */
const SOORTEN = /** @type {const} */ ({
  hoofdstukken: { streefwaarde: 12 * KB, eenheid: 'bytes', pad: null },
  regelboek: { streefwaarde: 40 * KB, eenheid: 'bytes', pad: /^docs\/framework\.md$/ },
  specs: { streefwaarde: 10 * KB, eenheid: 'bytes', pad: /^docs\/(?:template\/)?specs\/[^_/][^/]*\.md$/ },
  adrs: { streefwaarde: 6 * KB, eenheid: 'bytes', pad: /^docs\/adr\/\d{4}-[^/]+\.md$/ },
  rules: { streefwaarde: 60, eenheid: 'regels', pad: /^\.claude\/rules\/.+\.md$/ },
  skills: { streefwaarde: 200, eenheid: 'regels', pad: /^\.claude\/skills\/[^/]+\/SKILL\.md$/ },
  operations: { streefwaarde: null, eenheid: 'bytes', pad: /^docs\/operations\/.+\.md$/ },
});

/**
 * De eenheden van een soort. Hoofdstukken komen uit het regelboek: elke `## <n>.`-kop (ook §13 en §8a) is een eenheid.
 * @param {keyof typeof SOORTEN} soort @param {readonly string[]} paden @param {(pad: string) => string | Buffer | null} lees
 * @returns {Eenheid[]}
 */
function eenheden(soort, paden, lees) {
  const { eenheid, pad } = SOORTEN[soort];
  if (pad === null) {
    const boek = paden.includes(REGELBOEK) ? lees(REGELBOEK) : null;
    if (boek === null) return [];
    return stukken(boek.toString()).delen.flatMap((deel) => {
      const nr = nummer(deel);
      return nr === undefined ? [] : [{ naam: `${REGELBOEK} §${nr}`, waarde: Buffer.byteLength(deel) }];
    });
  }
  return paden
    .filter((p) => pad.test(p))
    .flatMap((p) => {
      const inhoud = lees(p);
      if (inhoud === null) return [];
      return [{ naam: p, waarde: eenheid === 'bytes' ? Buffer.byteLength(inhoud) : aantalRegels(inhoud.toString()) }];
    });
}

/**
 * Boven de streefwaarde. Bytes vergelijken in hele KB (afgerond), zoals de uitvoer ze toont: een streefwaarde is een
 * richtgetal, geen grens op de byte.
 * @param {number} waarde @param {number} streefwaarde @param {'bytes' | 'regels'} eenheid
 */
function erboven(waarde, streefwaarde, eenheid) {
  return eenheid === 'bytes' ? Math.round(waarde / KB) > streefwaarde / KB : waarde > streefwaarde;
}

/**
 * Metingen per soort tegenover hun streefwaarde (leesbudget/AC-3): aantal, aantal erboven en de vijf grootste.
 * @param {readonly string[]} paden @param {(pad: string) => string | Buffer | null} lees
 * @returns {Record<keyof typeof SOORTEN, Meting>}
 */
export function metingen(paden, lees) {
  const uit = /** @type {Record<keyof typeof SOORTEN, Meting>} */ ({});
  for (const soort of /** @type {(keyof typeof SOORTEN)[]} */ (Object.keys(SOORTEN))) {
    const { streefwaarde, eenheid } = SOORTEN[soort];
    const lijst = eenheden(soort, paden, lees).sort((a, b) => b.waarde - a.waarde);
    const boven =
      streefwaarde === null ? 0 : lijst.filter(({ waarde }) => erboven(waarde, streefwaarde, eenheid)).length;
    uit[soort] = { streefwaarde, eenheid, aantal: lijst.length, boven, grootste: lijst.slice(0, 5) };
  }
  return uit;
}

/** @param {number} waarde @param {'bytes' | 'regels'} eenheid */
function maat(waarde, eenheid) {
  return eenheid === 'bytes' ? `${String(Math.round(waarde / KB))} KB` : `${String(waarde)} regels`;
}

/** @param {ReturnType<typeof metingen>} m */
function metingTekst(m) {
  const regels = ['Metingen tegenover hun streefwaarde (ADR 0065; een meting, nooit rood):'];
  for (const [soort, { streefwaarde, eenheid, aantal, boven, grootste }] of Object.entries(m)) {
    const streef = streefwaarde === null ? 'geen streefwaarde' : `streefwaarde ${maat(streefwaarde, eenheid)}`;
    const letOp = boven > 0 ? `; let op: ${String(boven)} erboven` : '';
    regels.push(`${soort}: ${String(aantal)}, ${streef}${letOp}`);
    if (grootste.length > 0)
      regels.push(`  grootste: ${grootste.map(({ naam, waarde }) => `${naam} ${maat(waarde, eenheid)}`).join(', ')}`);
  }
  return regels;
}

/** @param {ReturnType<typeof leespad>} scenarios */
function scenarioTekst(scenarios) {
  return Object.entries(scenarios).map(([naam, t]) => {
    const doel = DOELEN[naam];
    const mist = t.ontbreekt.length === 0 ? '' : ` (ontbreekt: ${t.ontbreekt.join(', ')})`;
    if (doel === undefined) return `${naam}: ${String(t.bytes)} bytes${mist}`;
    const streef = doel.streefdoel === undefined ? '' : `streefdoel ${String(doel.streefdoel / KB)} KB, `;
    const letOp = t.bytes > doel.drempel ? '; let op: boven de waarschuwingsdrempel' : '';
    return `${naam}: ${String(t.bytes)} bytes (${streef}drempel ${String(doel.drempel / KB)} KB)${mist}${letOp}`;
  });
}

/** Getrackte paden in de werkmap of in `ref`; zonder git leeg. @param {string} cwd @param {string | undefined} ref */
function paden(cwd, ref) {
  const args = ref === undefined ? ['ls-files', '-z'] : ['ls-tree', '-r', '--name-only', '-z', ref];
  try {
    const uit = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return uit.split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

/** @param {readonly string[]} args */
function refUit(args) {
  const i = args.findIndex((a) => a === '--ref' || a.startsWith('--ref='));
  if (i === -1) return undefined;
  const arg = args[i] ?? '';
  return arg.startsWith('--ref=') ? arg.slice('--ref='.length) : (args[i + 1] ?? '');
}

/** @param {string} ref @param {string} cwd */
function gitLezer(ref, cwd) {
  if (ref === '' || ref.startsWith('-')) throw new Error(`ongeldige ref: ${ref}`);
  /** @type {import('node:child_process').ExecFileSyncOptionsWithStringEncoding} */
  const opties = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
  try {
    execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], opties);
  } catch {
    throw new Error(`onbekende ref: ${ref}`);
  }
  return (/** @type {string} */ pad) => {
    try {
      return execFileSync('git', ['show', `${ref}:${pad}`], { ...opties, maxBuffer: 16 * 1024 * 1024 });
    } catch {
      return null;
    }
  };
}

/** @param {string} cwd @param {string | undefined} ref */
function lezer(cwd, ref) {
  if (ref !== undefined) return gitLezer(ref, cwd);
  return (/** @type {string} */ pad) => {
    try {
      return readFileSync(path.join(cwd, pad));
    } catch {
      return null;
    }
  };
}

/** @param {readonly string[]} argv */
function main(argv) {
  const cwd = process.cwd();
  try {
    const ref = refUit(argv);
    const lees = lezer(cwd, ref);
    const telling = leespad(lees, SCENARIOS);
    const scenarios = Object.fromEntries(Object.entries(telling).map(([naam, t]) => [naam, { ...t, ...DOELEN[naam] }]));
    const meldingen = grensMeldingen((pad) => lees(pad)?.toString() ?? null);
    const m = metingen(paden(cwd, ref), lees);
    if (argv.includes('--json')) {
      process.stdout.write(`${JSON.stringify({ scenarios, meldingen, metingen: m }, null, 2)}\n`);
      return;
    }
    process.stdout.write(`${[...scenarioTekst(telling), ...meldingen, '', ...metingTekst(m)].join('\n')}\n`);
  } catch (fout) {
    process.stderr.write(`leespad: ${fout instanceof Error ? fout.message : String(fout)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2));
