// GitHub alleen lezen via gh. De uitkomst komt van GitHub, niet uit een PR-body of lokaal bewijsbestand.
import { execFileSync } from 'node:child_process';

/** @param {unknown} value @param {string} key */
function valueOf(value, key) {
  return typeof value === 'object' && value !== null
    ? Object.entries(value).find(([name]) => name === key)?.[1]
    : undefined;
}

/** @param {unknown} value @param {string} key */
function textField(value, key) {
  const found = valueOf(value, key);
  if (typeof found !== 'string') throw new Error(`GitHub-bewijs mist ${key}`);
  return found;
}

/** @param {unknown} value @param {string} key */
function numberField(value, key) {
  const found = valueOf(value, key);
  if (typeof found !== 'number' || !Number.isSafeInteger(found) || found <= 0)
    throw new Error(`GitHub-bewijs mist ${key}`);
  return found;
}

/** @param {string} endpoint @returns {unknown} */
function github(endpoint) {
  try {
    return JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    throw new Error(`GitHub-bewijs is niet leesbaar: ${endpoint}`);
  }
}

/** @param {string} repository */
function repoPath(repository) {
  if (!/^[\w-]+\/[\w.-]+$/.test(repository)) throw new Error('Ongeldige repository-identiteit');
  return `repos/${repository}`;
}

/** @param {unknown} raw @returns {import('../../rails/hooks/lib/built-evidence.mjs').PullRequest} */
export function parsePullRequest(raw) {
  const base = valueOf(raw, 'base');
  const head = valueOf(raw, 'head');
  const repository = textField(valueOf(base, 'repo'), 'full_name');
  const merged = valueOf(raw, 'merged');
  if (typeof merged !== 'boolean') throw new Error('GitHub-PR mist zijn merge-uitkomst');
  if (textField(valueOf(head, 'repo'), 'full_name') !== repository)
    throw new Error('Statusbewijs uit een fork wordt niet vertrouwd');
  const mergeSha = merged ? textField(raw, 'merge_commit_sha') : null;
  if (mergeSha !== null && !/^[0-9a-f]{40}$/.test(mergeSha)) throw new Error('GitHub-bewijs mist merge_commit_sha');
  return {
    number: numberField(raw, 'number'),
    repository,
    branch: textField(head, 'ref'),
    baseBranch: textField(base, 'ref'),
    headSha: textField(head, 'sha'),
    state: textField(raw, 'state'),
    merged,
    mergeSha,
  };
}

/** @param {string} repository @param {number} number */
export function pullRequest(repository, number) {
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Ongeldig PR-nummer');
  return parsePullRequest(github(`${repoPath(repository)}/pulls/${String(number)}`));
}

/** @param {unknown} raw @returns {import('../../rails/hooks/lib/built-evidence.mjs').CheckRun} */
export function parseCheckRun(raw) {
  const conclusion = valueOf(raw, 'conclusion');
  if (conclusion !== null && typeof conclusion !== 'string') throw new Error('GitHub-check mist zijn uitslag');
  return {
    id: numberField(raw, 'id'),
    name: textField(raw, 'name'),
    headSha: textField(raw, 'head_sha'),
    status: textField(raw, 'status'),
    conclusion,
    appId: numberField(valueOf(raw, 'app'), 'id'),
  };
}

/** @param {string} repository @param {string} sha */
export function checkRuns(repository, sha) {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Ongeldige gevalideerde commit');
  /** @type {import('../../rails/hooks/lib/built-evidence.mjs').CheckRun[]} */
  const checks = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = github(`${repoPath(repository)}/commits/${sha}/check-runs?per_page=100&page=${String(page)}`);
    const items = valueOf(response, 'check_runs');
    if (!Array.isArray(items)) throw new Error('GitHub-checks zijn niet leesbaar');
    checks.push(...items.map((item) => parseCheckRun(item)));
    if (items.length < 100) return checks;
  }
  throw new Error('Te veel GitHub-checks om het bewijs volledig te controleren');
}
