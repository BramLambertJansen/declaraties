// Een status is afgeleid. Alleen de inhoud buiten die ene regel krijgt een digest (ADR 0046).
import { createHash } from 'node:crypto';

const SPEC_STATES = new Set(['voorstel', 'goedgekeurd', 'gebouwd', 'vervallen']);
const ADR_STATES = new Set(['voorgesteld', 'geaccepteerd', 'vervallen']);

/** @param {string} file */
export function documentKind(file) {
  if (/^docs\/specs\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file)) return 'spec';
  if (/^docs\/adr\/\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file)) return 'adr';
  return null;
}

/** @param {string} kind @param {string} status */
export function validStatus(kind, status) {
  return kind === 'spec' ? SPEC_STATES.has(status) :
    kind === 'adr' && (ADR_STATES.has(status) || /^vervangen door \d{4}$/.test(status));
}

/** @param {string} kind @param {string} line */
function statusValue(kind, line) {
  const value = (kind === 'spec'
    ? /^status: (voorstel|goedgekeurd|gebouwd|vervallen)(?:\s+#.*)?$/
    : /^Status: (voorgesteld|geaccepteerd|vervallen|vervangen door \d{4})(?:\s+(?:#|—|\().*)?$/).exec(line)?.[1];
  return value ?? null;
}

/** @param {string[]} lines @param {number} statusIndex */
function validFrontmatter(lines, statusIndex) {
  const end = lines.indexOf('---', 1);
  if (lines[0] !== '---' || statusIndex === 0 || statusIndex >= end) return false;
  const fields = lines.slice(1, end).filter((line) => line !== '' && !line.startsWith('#'));
  if (fields.some((line) => !/^[a-z][a-z0-9-]*: .+$/.test(line))) return false;
  const names = fields.map((line) => line.split(':')[0]);
  return new Set(names).size === names.length;
}

/** @param {string} file @param {string} text */
export function documentInfo(file, text) {
  const kind = documentKind(file);
  if (kind === null) return null;
  const normalized = text.replaceAll('\r\n', '\n');
  const label = kind === 'spec' ? 'status:' : 'Status:';
  const lines = normalized.split('\n');
  const positions = lines.flatMap((line, index) => line.startsWith(label) ? [index] : []);
  const index = positions[0];
  if (positions.length !== 1 || index === undefined) return null;
  if (kind === 'spec' && !validFrontmatter(lines, index)) return null;
  if (kind === 'adr' && (!/^# \d{4} — /.test(lines[0] ?? '') || index > 5 || lines.slice(1, index).some((line) => line !== ''))) return null;
  const status = statusValue(kind, lines[index] ?? '');
  if (status === null) return null;
  lines.splice(index, 1);
  const canonical = lines.join('\n');
  const digest = createHash('sha256').update(canonical).digest('hex');
  return { kind, status, digest, canonical };
}

/**
 * @param {string} file
 * @param {string} text
 * @param {{ status: string, pr?: number, validatedSha?: string }} target
 */
export function changeStatus(file, text, target) {
  const info = documentInfo(file, text);
  if (info === null || !validStatus(info.kind, target.status)) throw new Error('Ongeldig document of status voor dit documenttype');
  const label = info.kind === 'spec' ? 'status:' : 'Status:';
  let line = `${label} ${target.status}`;
  if (target.status === 'gebouwd') {
    if (!Number.isSafeInteger(target.pr) || (target.pr ?? 0) <= 0 || !/^[0-9a-f]{40}$/.test(target.validatedSha ?? ''))
      throw new Error('Gebouwd vereist een PR-nummer en een gevalideerde commit-SHA');
    line += ` # #${String(target.pr)}; gevalideerd: ${target.validatedSha ?? ''}`;
  }
  const pattern = info.kind === 'spec' ? /^status:[^\r\n]*$/m : /^Status:[^\r\n]*$/m;
  return text.replace(pattern, () => line);
}

/**
 * ADR 0045 punt 22: achter een nieuwe of gewijzigde ADR-statuswaarde alleen `(JJJJ-MM-DD)`, `#<nr>` en `[NNNN](NNNN-<slug>.md)`
 * naar een bestaand ADR, gescheiden door `, ` of ` — `. Een regel gelijk aan main en een spec-regel vallen erbuiten.
 * @param {string} nieuweRegel @param {string | null} oudeRegel
 * @param {readonly string[]} bestaandeAdrBestanden bestandsnamen in `docs/adr/` op HEAD, zoals `0017-diff-guard.md`
 * @returns {string | null} null of de reden
 */
export function statusregelOvertreding(nieuweRegel, oudeRegel, bestaandeAdrBestanden) {
  if (!nieuweRegel.startsWith('Status:') || nieuweRegel === oudeRegel) return null;
  const rest = /^Status: (?:voorgesteld|geaccepteerd|vervallen|vervangen door \d{4})(.*)$/.exec(nieuweRegel)?.[1];
  if (rest === undefined) return 'statusregel heeft geen geldige statuswaarde';
  if (rest === '') return null;
  const delen = /^ (?:— )?(.+)$/.exec(rest)?.[1]?.split(/, | — /) ?? [rest];
  const fout = delen.find((deel) => !toegestaanDeel(deel, bestaandeAdrBestanden));
  return fout === undefined
    ? null
    : `statusregel: "${fout}" mag niet achter de statuswaarde; alleen (JJJJ-MM-DD), #<nr> en [NNNN](NNNN-<slug>.md) naar een bestaand ADR (ADR 0045 punt 22)`;
}

/** @param {string} deel @param {readonly string[]} bestaandeAdrBestanden */
function toegestaanDeel(deel, bestaandeAdrBestanden) {
  if (/^#\d+$/.test(deel) || bestaandeDatum(deel)) return true;
  const link = /^\[(\d{4})\]\(((\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md)\)$/.exec(deel);
  return link !== null && link[1] === link[3] && bestaandeAdrBestanden.includes(link[2] ?? '');
}

/** `(JJJJ-MM-DD)` met een datum die in de kalender bestaat. @param {string} deel */
function bestaandeDatum(deel) {
  const datum = /^\((\d{4})-(\d{2})-(\d{2})\)$/.exec(deel);
  if (datum === null) return false;
  const [jaar, maand, dag] = [datum[1], datum[2], datum[3]].map(Number);
  const tijd = new Date(Date.UTC(jaar ?? 0, (maand ?? 0) - 1, dag ?? 0));
  return tijd.getUTCFullYear() === jaar && tijd.getUTCMonth() + 1 === maand && tijd.getUTCDate() === dag;
}

const VOORSTEL = new Set(['voorstel', 'voorgesteld']);

/** De melding bij A4 (ADR 0046 punt 2), gedeeld door guard en rolhek. */
export const A4_MELDING =
  'een geaccepteerd ADR herschrijven of een ADR met een eigenaarstatus verwijderen mag alleen in een besluit-PR, door architect of hoofdsessie, en een herschreven ADR krijgt een herzieningsregel (`Herzien: JJJJ-MM-DD (#NNN): wat`); een vervallen of vervangen ADR wijzigt niet en een ADR gaat nooit terug naar voorgesteld; buiten een besluit-PR schrijf je een nieuw ADR dat het vervangt (`vervangen door NNNN`) (A4, ADR 0046 punt 2)';

const HERZIEN = /^Herzien: (\d{4}-\d{2}-\d{2}) \(#[1-9]\d*\): \S.*$/;

/** Geldige herzieningsregels (`Herzien: JJJJ-MM-DD (#NNN): wat`, bestaande datum). @param {string} text */
function herzieningen(text) {
  const regels = text.replaceAll('\r\n', '\n').split('\n');
  return new Set(regels.filter((line) => bestaandeDatum(`(${HERZIEN.exec(line)?.[1] ?? ''})`)));
}

/**
 * Een geaccepteerd ADR dat geaccepteerd blijft met andere inhoud: de herschrijving die alleen in een besluit-PR mag (A4).
 * @param {string} file @param {string | null} voor @param {string | null} na
 */
export function isHerschrijving(file, voor, na) {
  const oud = voor === null ? null : documentInfo(file, voor);
  const nieuw = na === null ? null : documentInfo(file, na);
  return oud?.kind === 'adr' && oud.status === 'geaccepteerd' && nieuw?.status === 'geaccepteerd' && oud.digest !== nieuw.digest;
}

/** Elke oude geldige herzieningsregel staat er nog, en er is er minstens één bij. @param {string} voor @param {string} na */
function nieuweHerzieningsregel(voor, na) {
  const oud = herzieningen(voor);
  const nieuw = herzieningen(na);
  return [...oud].every((regel) => nieuw.has(regel)) && nieuw.size > oud.size;
}

/**
 * Hoe een document zonder record mag veranderen (ADR 0046 punt 1, 2 en 5). Puur; `voor`/`na` zijn de volledige teksten.
 * - `vrij`: geen eigenaarbesluit (voorstel, of niets wezenlijks gewijzigd);
 * - `a4`: een ADR met een eigenaarstatus wijzigt van inhoud of gaat terug naar voorgesteld;
 * - `herzien`: een geaccepteerd ADR blijft geaccepteerd met andere inhoud en een nieuwe herzieningsregel (alleen in een besluit-PR);
 * - `gebouwd`: alleen met bouwbewijs;
 * - `besluit`: een eigenaarstatus die de merge van de eigenaar beslist (`nieuw`: een nieuw document of vanuit een voorstel);
 * - `geweigerd`: een andere overgang (bijv. vervallen terug naar goedgekeurd); alleen met een record.
 * @param {string} file @param {string | null} voor @param {string} na
 * @returns {{ uitslag: 'vrij' | 'a4' | 'herzien' | 'gebouwd' | 'besluit' | 'geweigerd', nieuw: boolean }}
 */
export function beslisOvergang(file, voor, na) {
  const oud = voor === null ? null : documentInfo(file, voor);
  const nieuwInfo = documentInfo(file, na);
  const uit = (/** @type {'vrij' | 'a4' | 'herzien' | 'gebouwd' | 'besluit' | 'geweigerd'} */ uitslag, nieuw = false) => ({ uitslag, nieuw });
  if (voor !== null && isHerschrijving(file, voor, na)) return uit(nieuweHerzieningsregel(voor, na) ? 'herzien' : 'a4');
  if (oud?.kind === 'adr' && oud.status !== 'voorgesteld' &&
    (nieuwInfo === null || oud.digest !== nieuwInfo.digest || nieuwInfo.status === 'voorgesteld'))
    return uit('a4');
  if (nieuwInfo === null || (voor !== null && oud === null)) return uit('geweigerd');
  if (VOORSTEL.has(nieuwInfo.status) || (oud?.status === nieuwInfo.status && oud.digest === nieuwInfo.digest)) return uit('vrij');
  if (nieuwInfo.status === 'gebouwd') return uit('gebouwd');
  if (oud === null || VOORSTEL.has(oud.status)) return uit('besluit', true);
  return toegestaanZonderRecord(oud.status, nieuwInfo.status, nieuwInfo.kind) ? uit('besluit') : uit('geweigerd');
}

/** ADR geaccepteerd → vervangen/vervallen; spec goedgekeurd/gebouwd → vervallen; inhoud van een goedgekeurde spec. @param {string} van @param {string} naar @param {string} kind */
function toegestaanZonderRecord(van, naar, kind) {
  if (kind === 'adr') return van === 'geaccepteerd' && (naar === 'vervallen' || /^vervangen door \d{4}$/.test(naar));
  if (naar === 'vervallen') return van === 'goedgekeurd' || van === 'gebouwd';
  return van === 'goedgekeurd' && naar === 'goedgekeurd';
}

/** @param {string} text */
export function builtReference(text) {
  const match = /^status: gebouwd # #(\d+); gevalideerd: ([0-9a-f]{40})\r?$/m.exec(text);
  const pr = Number(match?.[1]);
  const sha = match?.[2];
  return Number.isSafeInteger(pr) && pr > 0 && sha !== undefined ? { pr, sha } : null;
}
