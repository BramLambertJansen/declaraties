// Bytes van het verplichte leespad per scenario (V2 meten): `pnpm leespad [--json] [--ref <git-ref>] [--basis <git-ref>]`.
// Zonder --ref uit de werkmap, met --ref via `git show <ref>:<pad>`. Een bestand dat er niet is telt 0 en staat in `ontbreekt`.
// Van docs/framework.md telt alleen de tekst vóór de eerste `## `-kop plus hoofdstuk 8 met 8a, 8b… (`hoofdstukTekst`, zoals
// `feiten.mjs hoofdstuk 8`); zonder §8 het hele bestand. Per scenario tellen ook de feiten-uitvoer die de scenariobestanden
// voorschrijven (leespad-feiten.mjs) en, bij `nieuwe-feature`, de padregels van een app-feature (meting-stuurt/AC-4).
// "Let op" komt alleen uit het verschil met de basis (ADR 0070 punt 1, meting-stuurt/AC-1): standaard
// `git merge-base origin/main <ref|HEAD>`, gemeten met deze code op de bestanden van de basis. Een scenario meldt bij minstens
// 1 KB groei; een soort als een eenheid nieuw boven de streefwaarde komt of erboven minstens 1 KB (5 regels) groeit.
// Streefdoel en drempel staan erbij zonder "let op". Nooit een overtreding; exit 1 alleen bij een ongeldige --ref of --basis.
// Met $GITHUB_STEP_SUMMARY schrijft het de uitvoer ook naar de samenvatting van de CI-job (meting-stuurt/AC-3).
// Getest in test/rails/meting-kerncijfers-leespad.test.ts, test/rails/leesbudget.test.ts en test/rails/meting-stuurt-leespad.test.ts.
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aantalRegels, grensMeldingen, KB } from './leesbudget.mjs';
import { naarSamenvatting } from './samenvatting.mjs';

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

/** Padregels die Claude Code laadt zodra een agent in dat pad leest; voor een app-feature (meting-stuurt/AC-4). */
export const PADREGELS = {
  'nieuwe-feature': ['.claude/rules/api.md', '.claude/rules/web.md', '.claude/rules/database.md'],
};

/**
 * Waarschuwingsdrempel en streefdoel per scenario, in bytes (ADR 0064 punt 1), herijkt op de eerlijke meting met feiten-uitvoer
 * en padregels (ADR 0070 punt 4; op 3 november 2026: 72, 18 en 27 KB). Drempel: de meting plus ongeveer 20 %, zoals in 0064;
 * streefdoel: de 25 KB van 0064 plus wat nu meetelt (~25 KB feiten-uitvoer en padregels).
 * @type {Record<string, { drempel: number, streefdoel?: number }>}
 */
export const DOELEN = {
  'nieuwe-feature': { drempel: 88 * KB, streefdoel: 50 * KB },
  'lichte-fix': { drempel: 22 * KB },
  review: { drempel: 34 * KB },
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
 * @param {{ eenheid: 'bytes' | 'regels', pad: RegExp | null }} soort @param {readonly string[]} paden
 * @param {(pad: string) => string | Buffer | null} lees
 * @returns {Eenheid[]}
 */
function eenheden({ eenheid, pad }, paden, lees) {
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
 * Alle eenheden per soort, aflopend (ook voor de vergelijking met de basis).
 * @param {readonly string[]} paden @param {(pad: string) => string | Buffer | null} lees
 * @returns {Record<string, Eenheid[]>}
 */
export function eenhedenPerSoort(paden, lees) {
  return Object.fromEntries(
    Object.entries(SOORTEN).map(([soort, definitie]) => [
      soort,
      eenheden(definitie, paden, lees).sort((a, b) => b.waarde - a.waarde),
    ]),
  );
}

/**
 * Metingen per soort tegenover hun streefwaarde (leesbudget/AC-3): aantal, aantal erboven en de vijf grootste.
 * @param {readonly string[]} paden @param {(pad: string) => string | Buffer | null} lees
 * @returns {Record<string, Meting>}
 */
export function metingen(paden, lees) {
  return metingenUit(eenhedenPerSoort(paden, lees));
}

/** De metingen uit al berekende eenheden. @param {Record<string, readonly Eenheid[]>} perSoort @returns {Record<string, Meting>} */
function metingenUit(perSoort) {
  return Object.fromEntries(
    Object.entries(SOORTEN).map(([soort, { streefwaarde, eenheid }]) => {
      const lijst = perSoort[soort] ?? [];
      const boven = streefwaarde === null ? 0 : lijst.filter(({ waarde }) => waarde > streefwaarde).length;
      return [soort, { streefwaarde, eenheid, aantal: lijst.length, boven, grootste: lijst.slice(0, 5) }];
    }),
  );
}

/** @param {number} waarde @param {'bytes' | 'regels'} eenheid */
function maat(waarde, eenheid) {
  return eenheid === 'bytes' ? `${String(Math.round(waarde / KB))} KB` : `${String(waarde)} regels`;
}

/** Minimale groei voor "let op" (ADR 0070 punt 1). @param {'bytes' | 'regels'} eenheid */
function stap(eenheid) {
  return eenheid === 'bytes' ? KB : 5;
}

/**
 * "Let op" per eenheid tegenover de basis (meting-stuurt/AC-1): nieuw boven de streefwaarde, of erboven minstens 1 KB (5 regels)
 * gegroeid; vergeleken op naam.
 * @param {Record<string, readonly Eenheid[]>} nu @param {Record<string, readonly Eenheid[]>} basis
 * @returns {string[]}
 */
export function eenheidMeldingen(nu, basis) {
  return Object.entries(SOORTEN).flatMap(([soort, { streefwaarde, eenheid }]) => {
    if (streefwaarde === null) return [];
    const was = new Map((basis[soort] ?? []).map(({ naam, waarde }) => [naam, waarde]));
    return (nu[soort] ?? []).flatMap(({ naam, waarde }) => {
      if (waarde <= streefwaarde) return [];
      const oud = was.get(naam);
      const kop = `let op: ${soort}: ${naam} ${maat(waarde, eenheid)}`;
      if (oud === undefined || oud <= streefwaarde)
        return [`${kop}, nieuw boven de streefwaarde ${maat(streefwaarde, eenheid)}`];
      return waarde - oud >= stap(eenheid)
        ? [`${kop}, boven de streefwaarde gegroeid (was ${maat(oud, eenheid)})`]
        : [];
    });
  });
}

/** @param {ReturnType<typeof metingen>} m */
function metingTekst(m) {
  const regels = ['Metingen tegenover hun streefwaarde (ADR 0065; een meting, nooit rood):'];
  for (const [soort, { streefwaarde, eenheid, aantal, boven, grootste }] of Object.entries(m)) {
    const streef = streefwaarde === null ? 'geen streefwaarde' : `streefwaarde ${maat(streefwaarde, eenheid)}`;
    regels.push(`${soort}: ${String(aantal)}, ${streef}${boven > 0 ? `, ${String(boven)} erboven` : ''}`);
    if (grootste.length > 0)
      regels.push(`  grootste: ${grootste.map(({ naam, waarde }) => `${naam} ${maat(waarde, eenheid)}`).join(', ')}`);
  }
  return regels;
}

/** @typedef {{ bytes: number } | { bytes: null, reden: string }} FeitenUitslag */
/** @typedef {{ bytes: number, ontbreekt: string[], feiten: FeitenUitslag & { secties: string[], alle: boolean }, padregels: { bytes: number, ontbreekt: string[] }, totaal: number | null }} Scenario */
/** @typedef {{ lees: (pad: string) => string | Buffer | null, lezer: import('./feiten-secties.mjs').Lezer }} Lezing */

/**
 * Bestanden, feiten-uitvoer en padregels per scenario; `totaal` is null als de feiten onbekend zijn.
 * @param {Lezing} lezing @param {ReturnType<import('./leespad-feiten.mjs').werkmapCode>} code
 * @returns {Promise<Record<string, Scenario>>}
 */
async function meetScenarios(lezing, code) {
  const { feitenBytes, scenarioFeiten } = await import('./leespad-feiten.mjs');
  const bestanden = leespad(lezing.lees, SCENARIOS);
  const regels = leespad(lezing.lees, PADREGELS);
  /** @type {Record<string, Scenario>} */
  const uit = {};
  for (const [naam, scenarioPaden] of Object.entries(SCENARIOS)) {
    const { zonder, ...aanroep } = scenarioFeiten(scenarioPaden, lezing.lees);
    /** @type {FeitenUitslag} */
    const feiten =
      zonder.length > 0
        ? { bytes: null, reden: `regel zonder herkende feiten-aanroep: ${zonder.join(', ')}` }
        : await feitenBytes(aanroep, lezing.lezer, code);
    const eigen = bestanden[naam] ?? { bytes: 0, ontbreekt: [] };
    const padregels = regels[naam] ?? { bytes: 0, ontbreekt: [] };
    const totaal = feiten.bytes === null ? null : eigen.bytes + feiten.bytes + padregels.bytes;
    uit[naam] = { ...eigen, feiten: { ...aanroep, ...feiten }, padregels, totaal };
  }
  return uit;
}

/**
 * De vergelijking van één scenario met de basis, als staart van de scenarioregel.
 * @param {Scenario} nu @param {Scenario | undefined} basis @param {number} drempel
 */
function vergelijking(nu, basis, drempel) {
  if (basis === undefined) return '';
  if (nu.totaal === null || basis.totaal === null) return '; geen vergelijking: feiten onbekend';
  const groei = nu.totaal - basis.totaal;
  if (groei >= KB) return `; let op: ${String(groei)} bytes gegroeid tegenover de basis (was ${String(basis.totaal)})`;
  const boven = nu.totaal > drempel ? 'boven de drempel, ' : '';
  return groei === 0 ? `; ${boven}gelijk aan de basis` : `; ${boven}was ${String(basis.totaal)}`;
}

/** @param {Record<string, Scenario>} nu @param {Record<string, Scenario> | null} basis */
function scenarioTekst(nu, basis) {
  return Object.entries(nu).map(([naam, t]) => {
    const doel = DOELEN[naam] ?? { drempel: Number.POSITIVE_INFINITY };
    const mist = [...t.ontbreekt, ...t.padregels.ontbreekt];
    const feiten = t.feiten.bytes === null ? `onbekend (${t.feiten.reden})` : String(t.feiten.bytes);
    const totaal = t.totaal === null ? `${String(t.bytes)}+ bytes` : `${String(t.totaal)} bytes`;
    const delen = `bestanden ${String(t.bytes)}, feiten ${feiten}, padregels ${String(t.padregels.bytes)}`;
    const streef = doel.streefdoel === undefined ? '' : `streefdoel ${String(doel.streefdoel / KB)} KB, `;
    const grens = Number.isFinite(doel.drempel) ? `; ${streef}drempel ${String(doel.drempel / KB)} KB` : '';
    const ontbreekt = mist.length === 0 ? '' : ` (ontbreekt: ${mist.join(', ')})`;
    return `${naam}: ${totaal} (${delen}${grens})${ontbreekt}${vergelijking(t, basis?.[naam], doel.drempel)}`;
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

/** De waarde van `--<naam> <waarde>` of `--<naam>=<waarde>`. @param {readonly string[]} args @param {string} naam */
function optie(args, naam) {
  const i = args.findIndex((a) => a === naam || a.startsWith(`${naam}=`));
  if (i === -1) return undefined;
  const arg = args[i] ?? '';
  return arg.startsWith(`${naam}=`) ? arg.slice(naam.length + 1) : (args[i + 1] ?? '');
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

/**
 * Bestandslezer en feiten-lezer voor de werkmap of een ref. De feiten-lezer van de werkmap is die van feiten.mjs zelf, zodat de
 * meting gelijk is aan wat een agent ziet; voor een ref komen de mappen uit `git ls-tree`.
 * @param {string} cwd @param {string | undefined} ref @param {readonly string[]} bestanden
 * @returns {Promise<Lezing>}
 */
async function lezing(cwd, ref, bestanden) {
  if (ref === undefined) {
    const { werkmap } = await import('./feiten-secties.mjs');
    /** @param {string} pad */
    const lees = (pad) => {
      try {
        return readFileSync(path.join(cwd, pad));
      } catch {
        return null;
      }
    };
    return { lees, lezer: werkmap };
  }
  const lees = gitLezer(ref, cwd);
  /** @param {string} map */
  const lijst = (map) =>
    bestanden
      .filter((p) => p.startsWith(`${map}/`))
      .map((p) => p.slice(map.length + 1))
      .filter((naam) => !naam.includes('/'));
  return { lees, lezer: { lees: (pad) => lees(pad)?.toString() ?? null, lijst } };
}

/**
 * De basis: `--basis <ref>`, anders `git merge-base origin/main <ref|HEAD>`; niet te bepalen geeft een reden.
 * @param {readonly string[]} argv @param {string} cwd @param {string | undefined} ref
 * @returns {{ ref: string } | { reden: string }}
 */
function basisVan(argv, cwd, ref) {
  const expliciet = optie(argv, '--basis');
  if (expliciet !== undefined) return { ref: expliciet };
  try {
    /** @type {import('node:child_process').ExecFileSyncOptionsWithStringEncoding} */
    const opties = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };
    return { ref: execFileSync('git', ['merge-base', 'origin/main', ref ?? 'HEAD'], opties).trim() };
  } catch {
    return { reden: 'basis niet te meten (geen origin/main of merge-base); meting zonder vergelijking' };
  }
}

/**
 * Meet een kant: scenario's, metingen en eenheden.
 * @param {string} cwd @param {string | undefined} ref @param {ReturnType<import('./leespad-feiten.mjs').werkmapCode>} code
 */
async function meet(cwd, ref, code) {
  const bestanden = paden(cwd, ref);
  const lees = await lezing(cwd, ref, bestanden);
  const eenheden = eenhedenPerSoort(bestanden, lees.lees);
  return { lees: lees.lees, scenarios: await meetScenarios(lees, code), eenheden, metingen: metingenUit(eenheden) };
}

/** @param {readonly string[]} argv */
async function main(argv) {
  const cwd = process.cwd();
  try {
    const ref = optie(argv, '--ref');
    const { werkmapCode } = await import('./leespad-feiten.mjs');
    const code = werkmapCode();
    const nu = await meet(cwd, ref, code);
    const basisRef = basisVan(argv, cwd, ref);
    const basis = 'ref' in basisRef ? await meet(cwd, basisRef.ref, code) : null;
    const scenarios = Object.fromEntries(
      Object.entries(nu.scenarios).map(([naam, t]) => [naam, { ...t, ...DOELEN[naam] }]),
    );
    const meldingen = grensMeldingen((pad) => nu.lees(pad)?.toString() ?? null);
    const letOp = basis === null ? [] : eenheidMeldingen(nu.eenheden, basis.eenheden);
    if (argv.includes('--json')) {
      const basisJson = 'ref' in basisRef ? { ref: basisRef.ref, scenarios: basis?.scenarios } : basisRef;
      const json = { scenarios, basis: basisJson, meldingen, letOp, metingen: nu.metingen };
      process.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
      return;
    }
    const kop = 'ref' in basisRef ? [`basis: ${basisRef.ref}`] : [basisRef.reden];
    const regels = [...kop, ...scenarioTekst(nu.scenarios, basis?.scenarios ?? null), ...meldingen, ...letOp];
    const tekst = `${[...regels, '', ...metingTekst(nu.metingen)].join('\n')}\n`;
    process.stdout.write(tekst);
    naarSamenvatting('pnpm leespad (tegenover de basis)', regels);
  } catch (fout) {
    process.stderr.write(`leespad: ${fout instanceof Error ? fout.message : String(fout)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main(process.argv.slice(2));
