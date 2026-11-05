// Leesbudget (ADR 0065, spec leesbudget): harde grenzen alleen op wat elke sessie volledig laadt, een melding vanaf 85 %
// daarvan, en de krimpcheck op bindende documenten. Gebruikt door check-docs (ratchet) en leespad.
//  - Grens: `AGENTS.md` <= 9 KB en 100 regels, `CLAUDE.md` <= 50 regels. Sleutels `docs:AGENTS.md:budget:<bytes>` en
//    `docs:<bestand>:regels:<n>` (met waarde, zodat de ratchet groei en krimp ziet). Gelijk aan de grens is geen overtreding.
//  - Melding vanaf ceil(0,85 × grens): "let op: … op <n> % van de grens; verplaats naar een lagere laag"; nooit rood.
//  - Krimp: de controle op normen en bytes van spec krimp-op-normen (`normen.mjs`, ADR 0067); hier alleen de git-kant.
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { LIJST, REGELBOEK, bindend, normMeldingen, normViolations } from './normen.mjs';

/** @typedef {{ key: string, message: string }} Violation */
/** @typedef {(file: string) => string | null} Lezer null: het bestand bestaat niet */

export const KB = 1024;

/** @type {readonly { file: string, eenheid: 'bytes' | 'regels', grens: number }[]} */
export const GRENZEN = [
  { file: 'AGENTS.md', eenheid: 'bytes', grens: 9 * KB },
  { file: 'AGENTS.md', eenheid: 'regels', grens: 100 },
  { file: 'CLAUDE.md', eenheid: 'regels', grens: 50 },
];

/** Aantal regels; een afsluitend regeleinde opent geen nieuwe regel. @param {string} tekst */
export function aantalRegels(tekst) {
  return tekst.split('\n').length - (tekst.endsWith('\n') ? 1 : 0);
}

/** De gemeten waarden per grens, alleen voor bestanden die er zijn. @param {Lezer} lees */
function gemeten(lees) {
  return GRENZEN.flatMap((g) => {
    const tekst = lees(g.file);
    if (tekst === null) return [];
    return [{ ...g, waarde: g.eenheid === 'bytes' ? Buffer.byteLength(tekst) : aantalRegels(tekst) }];
  });
}

/**
 * Overtredingen van de harde grenzen (ADR 0065 punt 1).
 * @param {Lezer} lees
 * @returns {Violation[]}
 */
export function grensViolations(lees) {
  return gemeten(lees)
    .filter(({ waarde, grens }) => waarde > grens)
    .map(({ file, eenheid, grens, waarde }) => ({
      key: `docs:${file}:${eenheid === 'bytes' ? 'budget' : 'regels'}:${String(waarde)}`,
      message: `${file}: ${String(waarde)} ${eenheid}, grens ${String(grens)} (ADR 0065)`,
    }));
}

/**
 * Meldingen vanaf ceil(0,85 × grens) (leesbudget/AC-2); geen overtreding.
 * @param {Lezer} lees
 * @returns {string[]}
 */
export function grensMeldingen(lees) {
  return gemeten(lees)
    .filter(({ waarde, grens }) => waarde >= Math.ceil(0.85 * grens))
    .map(
      ({ file, eenheid, grens, waarde }) =>
        `let op: ${file}: ${String(waarde)} van ${String(grens)} ${eenheid}, op ${String(Math.floor((100 * waarde) / grens))} % van de grens; verplaats naar een lagere laag (ADR 0065)`,
    );
}

/** @param {string} root @param {readonly string[]} args */
function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

/** Bytes per bindend document in `ref`. @param {string} root @param {string} ref */
function grootteIn(root, ref) {
  const uit = git(root, ['ls-tree', '-r', '-l', '-z', ref]) ?? '';
  /** @type {Record<string, number>} */
  const grootte = {};
  for (const regel of uit.split('\0')) {
    const [kop = '', file = ''] = regel.split('\t');
    const bytes = Number(kop.trim().split(/\s+/)[3]);
    if (bindend(file) && Number.isFinite(bytes)) grootte[file] = bytes;
  }
  return grootte;
}

/** De merge-base met `origin/main`, of null. @param {string} root */
function basisVan(root) {
  const basis = git(root, ['merge-base', 'origin/main', 'HEAD'])?.trim();
  return basis === undefined || basis === '' ? null : basis;
}

/** @param {string} root @param {string} file */
function nu(root, file) {
  return existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : null;
}

/** @param {string} root @param {string} basis @param {string} file */
const toen = (root, basis, file) => git(root, ['show', `${basis}:${file}`]);

/**
 * Zonder basis (geen `origin/main` of een ondiepe checkout) toetst de krimpcontrole niets: in CI is dat rood, lokaal een
 * melding (krimp-op-normen/AC-5).
 * @param {string} root @param {boolean} inCi
 * @returns {{ meldingen: string[], violations: Violation[] }}
 */
export function zonderBasis(root, inCi) {
  if (basisVan(root) !== null) return { meldingen: [], violations: [] };
  const tekst = 'geen merge-base met origin/main; de krimpcontrole (krimp-op-normen) toetst niets';
  return inCi
    ? { meldingen: [], violations: [{ key: 'docs:normen:geen-basis', message: `${tekst} (ADR 0067)` }] }
    : { meldingen: [`let op: ${tekst}`], violations: [] };
}

/**
 * De krimpcontrole tegenover `git merge-base origin/main HEAD`, met de werkmap als nieuwe stand (krimp-op-normen/AC-1 t/m
 * AC-4); nooit in de baseline.
 * @param {string} root @returns {Violation[]}
 */
export function normenUitGit(root) {
  const basis = basisVan(root);
  // Zonder basis alleen wat geen vergelijking vraagt: de vorm van definities en lijst (AC-1, AC-4).
  if (basis === null) {
    const boek = nu(root, REGELBOEK);
    const bytes = { oud: {}, nieuw: {} };
    return normViolations({ boek: { oud: boek, nieuw: boek }, lijst: { oud: null, nieuw: nu(root, LIJST) }, bytes });
  }
  const getrackt = (git(root, ['ls-files', '-z']) ?? '').split('\0').filter((f) => bindend(f) && nu(root, f) !== null);
  const nieuw = Object.fromEntries(getrackt.map((f) => [f, statSync(path.join(root, f)).size]));
  return normViolations({
    boek: { oud: toen(root, basis, REGELBOEK), nieuw: nu(root, REGELBOEK) },
    lijst: { oud: toen(root, basis, LIJST), nieuw: nu(root, LIJST) },
    bytes: { oud: grootteIn(root, basis), nieuw },
  });
}

/** De meldingen van krimp-op-normen/AC-6. @param {string} root @returns {string[]} */
export function normenMeldingenUitGit(root) {
  const basis = basisVan(root);
  return basis === null ? [] : normMeldingen({ oud: toen(root, basis, REGELBOEK), nieuw: nu(root, REGELBOEK) });
}
