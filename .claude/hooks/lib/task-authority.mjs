// De caller leest de beslissingen uit main. Een status in de werkmap is geen toestemming (ADR 0027).
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

/** @param {OwnerDecision} decision @param {Authority} authority */
function currentDecision(decision, authority) {
  if (decision.repository !== authority.repository || decision.branch !== authority.branch || !authority.safe(decision.file)) return false;
  const trusted = documentInfo(decision.file, authority.trusted(decision.file) ?? '');
  const working = documentInfo(decision.file, authority.working(decision.file) ?? '');
  return trusted !== null && working !== null && trusted.digest === decision.digest && working.digest === decision.digest;
}

/** @param {{ file: string, text: string }} target @param {Authority} authority */
export function canRecordStatus(target, authority) {
  const info = documentInfo(target.file, target.text);
  if (info === null || info.status === 'gebouwd' || !authority.safe(target.file)) return false;
  const trusted = documentInfo(target.file, authority.trusted(target.file) ?? '');
  if (trusted !== null && !['voorstel', 'voorgesteld'].includes(trusted.status) && trusted.digest === info.digest && trusted.status === info.status) return true;
  return authority.registry.decisions.some((decision) => decision.file === target.file && decision.status === info.status &&
    decision.digest === info.digest && currentDecision(decision, authority));
}

/** @param {string} file @param {string} repository */
function protectedSource(file, repository) {
  if (!canonicalPath(file) || /\.(?:test|spec|test-helper|gen)\.|\/testing\.ts$/.test(file)) return false;
  if (/^src\/core\/(?:api|web|shared)\/.+\.(?:ts|tsx|css)$/.test(file)) return repository === TEMPLATE_REPOSITORY;
  return /^src\/api\/(?:app|kit|server|env)\.ts$/.test(file) || file === 'src/shared/permissions.ts';
}

/** @param {{ file: string, role: string }} target @param {Authority} authority */
export function canWriteProtected(target, authority) {
  if (target.role !== 'developer' || !authority.safe(target.file) || !protectedSource(target.file, authority.repository)) return false;
  return authority.registry.decisions.some((decision) => {
    if (documentKind(decision.file) !== 'spec' || decision.status !== 'goedgekeurd' || !decision.paths.includes(target.file)) return false;
    const working = documentInfo(decision.file, authority.working(decision.file) ?? '');
    return currentDecision(decision, authority) && (working?.status === 'goedgekeurd' || working?.status === 'gebouwd');
  });
}
