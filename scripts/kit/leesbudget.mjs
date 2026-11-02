// Leesbudget (ADR 0065, spec leesbudget): harde grenzen alleen op wat elke sessie volledig laadt, een melding vanaf 85 %
// daarvan, en de krimpcheck op bindende documenten. Gebruikt door check-docs (ratchet) en leespad.
//  - Grens: `AGENTS.md` <= 9 KB en 100 regels, `CLAUDE.md` <= 50 regels. Sleutels `docs:AGENTS.md:budget:<bytes>` en
//    `docs:<bestand>:regels:<n>` (met waarde, zodat de ratchet groei en krimp ziet). Gelijk aan de grens is geen overtreding.
//  - Melding vanaf ceil(0,85 × grens): "let op: … op <n> % van de grens; verplaats naar een lagere laag"; nooit rood.
//  - Krimp (AC-6): een bindend document dat meer dan 20 % én minstens 1 KB krimpt tegenover `git merge-base origin/main
//    HEAD` vraagt een Markdown-bestand in de diff met een kop `Normeninventaris` (regels `oud → R-id` of
//    `oud → geschrapt: <reden>`). Zonder `origin/main` alleen een melding (`krimpZonderBasis`). Deze overtreding komt nooit in de baseline.
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

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

/** Een bindend document (ADR 0065 punt 6). @param {string} file */
export function bindend(file) {
  return (
    ['docs/framework.md', 'AGENTS.md', 'CLAUDE.md', 'docs/dod.md'].includes(file) || file.startsWith('.claude/rules/')
  );
}

const R_ID_REGEL = /^(R-[A-Z]+-\d+)\b[.,;:]?$/;

/**
 * Problemen in één inventarisregel, of [] als hij geldig is.
 * @param {string} regel @param {ReadonlySet<string>} rIds
 */
function regelProblemen(regel, rIds) {
  const pijl = regel.indexOf('→');
  if (pijl === -1) return [`"${regel}" heeft geen "→"`];
  const doel = regel.slice(pijl + 1).trim();
  const rId = R_ID_REGEL.exec(doel)?.[1];
  if (rId !== undefined) return rIds.has(rId) ? [] : [`${rId} staat niet in het regelboek`];
  if (/^geschrapt:\s*\S/.test(doel)) return [];
  return [`"${regel}" noemt geen R-id en geen "geschrapt: <reden>"`];
}

/**
 * De Normeninventarissen in de Markdown-bestanden: per bestand de lijstregels onder de kop.
 * @param {Record<string, string>} markdown
 */
function inventarissen(markdown) {
  return Object.entries(markdown).flatMap(([file, tekst]) => {
    const kop = /^(#{1,6})\s+Normeninventaris\s*$/m.exec(tekst);
    if (kop === null) return [];
    const rest = tekst.slice(kop.index + kop[0].length);
    const einde = /^#{1,6}\s/m.exec(rest);
    const sectie = einde === null ? rest : rest.slice(0, einde.index);
    const regels = [...sectie.matchAll(/^\s*[-*]\s+(.+?)\s*$/gm)].map(([, r = '']) => r);
    return [{ file, regels }];
  });
}

/**
 * Waarom de inventaris niet volstaat, of [] als hij geldig is.
 * @param {Record<string, string>} markdown @param {ReadonlySet<string>} rIds
 */
function inventarisProblemen(markdown, rIds) {
  const lijsten = inventarissen(markdown);
  if (lijsten.length === 0) return ['geen Markdown-bestand in de diff heeft een kop "Normeninventaris"'];
  const problemen = lijsten.flatMap(({ file, regels }) => [
    ...(regels.length === 0 ? [`${file}: de Normeninventaris heeft geen regels "oud → R-id"`] : []),
    ...regels.flatMap((r) => regelProblemen(r, rIds).map((p) => `${file}: ${p}`)),
  ]);
  return problemen;
}

/**
 * Krimp van bindende documenten (leesbudget/AC-6), puur: `oud` en `nieuw` zijn bytes per pad; een pad dat in `nieuw`
 * ontbreekt is verwijderd (100 % krimp, ook bij een rename); een nieuw document telt niet.
 * @param {{ oud: Record<string, number>, nieuw: Record<string, number>, markdown: Record<string, string>, rIds: readonly string[] }} invoer
 * @returns {Violation[]}
 */
export function krimpViolations({ oud, nieuw, markdown, rIds }) {
  const gekrompen = Object.entries(oud).filter(([file, voor]) => {
    const weg = voor - (nieuw[file] ?? 0);
    return bindend(file) && weg * 5 > voor && weg >= KB;
  });
  if (gekrompen.length === 0) return [];
  const problemen = inventarisProblemen(markdown, new Set(rIds));
  if (problemen.length === 0) return [];
  return gekrompen.map(([file, voor]) => ({
    key: `docs:krimp:${file}`,
    message: `${file}: krimpt van ${String(voor)} naar ${String(nieuw[file] ?? 0)} bytes (meer dan 20 % en 1 KB) zonder geldige Normeninventaris: ${problemen.join('; ')} (ADR 0065 punt 6)`,
  }));
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

/**
 * De regels die `file` sinds `basis` toevoegt (`git diff -U0`), zonder het `+`-teken.
 * @param {string} root @param {string} basis @param {string} file
 */
function toegevoegd(root, basis, file) {
  const diff = git(root, ['diff', '-U0', '--no-color', basis, '--', file]) ?? '';
  return diff
    .split('\n')
    .filter((regel) => regel.startsWith('+') && !regel.startsWith('+++'))
    .map((regel) => regel.slice(1))
    .join('\n');
}

/**
 * Melding als de krimpcheck geen basis heeft (geen `origin/main`): dan toetst hij niets (leesbudget/AC-6).
 * @param {string} root
 */
export function krimpZonderBasis(root) {
  const basis = git(root, ['merge-base', 'origin/main', 'HEAD'])?.trim();
  return basis === undefined || basis === ''
    ? ['let op: geen origin/main; de krimpcheck (leesbudget/AC-6) toetst niets']
    : [];
}

/**
 * Krimp tegenover `git merge-base origin/main HEAD`, met de werkmap als nieuwe stand; zonder `origin/main` niets.
 * @param {string} root @param {readonly string[]} rIds
 * @returns {Violation[]}
 */
export function krimpUitGit(root, rIds) {
  const basis = git(root, ['merge-base', 'origin/main', 'HEAD'])?.trim();
  if (basis === undefined || basis === '') return [];
  const bestaat = (/** @type {string} */ file) => existsSync(path.join(root, file));
  const getrackt = (git(root, ['ls-files', '-z']) ?? '').split('\0').filter((f) => bindend(f) && bestaat(f));
  const nieuw = Object.fromEntries(getrackt.map((f) => [f, statSync(path.join(root, f)).size]));
  const gewijzigd = (git(root, ['diff', '--name-only', '-z', basis]) ?? '').split('\0');
  // Alleen de toegevoegde regels tellen: een inventaris uit een eerdere PR dekt geen nieuwe krimp.
  const markdown = Object.fromEntries(
    gewijzigd.filter((f) => f.endsWith('.md') && bestaat(f)).map((f) => [f, toegevoegd(root, basis, f)]),
  );
  return krimpViolations({ oud: grootteIn(root, basis), nieuw, markdown, rIds });
}
