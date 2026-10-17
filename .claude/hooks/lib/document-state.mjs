// Een status is afgeleid. Alleen de inhoud buiten die ene regel krijgt een digest (ADR 0027).
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
 * ADR 0031 besluit 4: achter een nieuwe of gewijzigde ADR-statuswaarde alleen `(JJJJ-MM-DD)`, `#<nr>` en `[NNNN](NNNN-<slug>.md)`
 * naar een bestaand ADR, gescheiden door `, ` of ` — `. Een regel gelijk aan main en een spec-regel vallen erbuiten.
 * @param {string} nieuweRegel @param {string | null} oudeRegel @param {readonly string[]} bestaandeAdrNummers
 * @returns {string | null} null of de reden
 */
export function statusregelOvertreding(nieuweRegel, oudeRegel, bestaandeAdrNummers) {
  if (!nieuweRegel.startsWith('Status:') || nieuweRegel === oudeRegel) return null;
  const rest = /^Status: (?:voorgesteld|geaccepteerd|vervallen|vervangen door \d{4})(.*)$/.exec(nieuweRegel)?.[1];
  if (rest === undefined) return 'statusregel heeft geen geldige statuswaarde';
  if (rest === '') return null;
  const delen = /^ (?:— )?(.+)$/.exec(rest)?.[1]?.split(/, | — /) ?? [rest];
  const fout = delen.find((deel) => !toegestaanDeel(deel, bestaandeAdrNummers));
  return fout === undefined
    ? null
    : `statusregel: "${fout}" mag niet achter de statuswaarde; alleen (JJJJ-MM-DD), #<nr> en [NNNN](NNNN-<slug>.md) naar een bestaand ADR (ADR 0031 besluit 4)`;
}

/** @param {string} deel @param {readonly string[]} bestaandeAdrNummers */
function toegestaanDeel(deel, bestaandeAdrNummers) {
  if (/^\(\d{4}-\d{2}-\d{2}\)$/.test(deel) || /^#\d+$/.test(deel)) return true;
  const nummer = /^\[(\d{4})\]\((\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md\)$/.exec(deel);
  return nummer !== null && nummer[1] === nummer[2] && bestaandeAdrNummers.includes(nummer[1] ?? '');
}

/** @param {string} text */
export function builtReference(text) {
  const match = /^status: gebouwd # #(\d+); gevalideerd: ([0-9a-f]{40})\r?$/m.exec(text);
  const pr = Number(match?.[1]);
  const sha = match?.[2];
  return Number.isSafeInteger(pr) && pr > 0 && sha !== undefined ? { pr, sha } : null;
}
