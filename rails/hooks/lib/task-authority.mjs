// De caller leest het register uit main. Een status in de werkmap is geen toestemming (ADR 0046). Records in `decisions`
// geven sinds ADR 0063 punt 5 niets meer; readRegistry leest ze nog, omdat oudere commits van main ze bevatten.
import { documentInfo, documentKind, validStatus } from './document-state.mjs';

export const TEMPLATE_REPOSITORY = 'BramLambertJansen/template';

/** @typedef {{ file: string, digest: string, repository: string, branch: string, status: string, paths: string[] }} OwnerDecision */
/** @typedef {{ version: number, requiredChecks: string[], decisions: OwnerDecision[] }} Registry */
/** @typedef {{ registry: Registry, repository: string, branch: string, trusted: (file: string) => string | null,
 * working: (file: string) => string | null, safe: (file: string) => boolean }} Authority */

/** @param {unknown} value @param {string[]} keys */
function objectWithKeys(value, keys) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Beslissing is geen object');
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value)))
    throw new Error('Beslissing heeft ontbrekende of onbekende velden');
  return value;
}

/** @param {object} value @param {string} key */
function field(value, key) {
  return Object.entries(value).find(([name]) => name === key)?.[1];
}

/** @param {object} value @param {string} key */
function stringField(value, key) {
  const found = field(value, key);
  if (typeof found !== 'string') throw new Error(`Beslissing: ${key} is geen tekst`);
  return found;
}

/** @param {unknown} value */
function stringList(value) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) throw new Error('Beslissing: ongeldige lijst');
  return value.map(String);
}

/** @param {string} file */
export function canonicalPath(file) {
  return /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(file) &&
    !file.split('/').some((part) => part === '.' || part === '..') && !file.endsWith('/');
}

/** @param {unknown} value */
function readDecision(value) {
  const raw = objectWithKeys(value, ['file', 'digest', 'repository', 'branch', 'status', 'paths']);
  const file = stringField(raw, 'file');
  const digest = stringField(raw, 'digest');
  const repository = stringField(raw, 'repository');
  const branch = stringField(raw, 'branch');
  const status = stringField(raw, 'status');
  const paths = stringList(field(raw, 'paths'));
  const kind = documentKind(file);
  if (kind === null || !validStatus(kind, status) || status === 'gebouwd') throw new Error('Beslissing: ongeldig document of besluit');
  if (!/^[0-9a-f]{64}$/.test(digest) || !/^[\w-]+\/[\w.-]+$/.test(repository)) throw new Error('Beslissing: ongeldige digest of repository');
  if (!/^[a-z][a-z0-9-]*\/[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(branch) || branch.endsWith('/main'))
    throw new Error('Beslissing: verwacht een exacte featurebranch');
  if (paths.some((item) => !canonicalPath(item)) || new Set(paths).size !== paths.length)
    throw new Error('Beslissing: alleen unieke, exacte relatieve bestandspaden');
  return { file, digest, repository, branch, status, paths };
}

/** @param {string} text @returns {Registry} */
export function readRegistry(text) {
  const raw = objectWithKeys(JSON.parse(text), ['version', 'requiredChecks', 'decisions']);
  if (field(raw, 'version') !== 1) throw new Error('Beslissingen: onbekende versie');
  const requiredChecks = stringList(field(raw, 'requiredChecks'));
  if (requiredChecks.length === 0 || requiredChecks.some((name) => name.trim() !== name || name === '') ||
    new Set(requiredChecks).size !== requiredChecks.length) throw new Error('Beslissingen: verplichte checks ontbreken of zijn ongeldig');
  const values = field(raw, 'decisions');
  if (!Array.isArray(values)) throw new Error('Beslissingen: decisions is geen lijst');
  const decisions = values.map((value) => readDecision(value));
  const identifiers = decisions.map((entry) => `${entry.repository}\0${entry.branch}\0${entry.file}`);
  if (new Set(identifiers).size !== identifiers.length) throw new Error('Beslissingen: dubbel besluit voor dezelfde taak');
  return { version: 1, requiredChecks, decisions };
}

/** @param {{ file: string, text: string }} target @param {Authority} authority */
export function canRecordStatus(target, authority) {
  const info = documentInfo(target.file, target.text);
  if (info === null || info.status === 'gebouwd' || !authority.safe(target.file)) return false;
  const trusted = documentInfo(target.file, authority.trusted(target.file) ?? '');
  return trusted !== null && !['voorstel', 'voorgesteld'].includes(trusted.status) && trusted.digest === info.digest &&
    trusted.status === info.status;
}
