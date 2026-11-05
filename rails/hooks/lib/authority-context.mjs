// Alleen git-data uit de vertrouwde basis; hooks doen geen netwerkwerk (ADR 0046).
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { anker, vertrouwdeCommit, vertrouwdeTekst } from './objecten.mjs';
import { canonicalPath, readRegistry } from './task-authority.mjs';

/** @param {string} root @param {string[]} args */
export function gitText(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

/** @param {string} remote */
export function repositoryName(remote) {
  const ssh = /^git@github\.com:([\w-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote)?.[1];
  if (ssh !== undefined) return ssh;
  try {
    const url = new URL(remote);
    const name = url.pathname.replace(/^\//, '').replace(/\.git$/, '');
    return url.hostname === 'github.com' && ['https:', 'ssh:'].includes(url.protocol) && /^[\w-]+\/[\w.-]+$/.test(name) ? name : null;
  } catch {
    return null;
  }
}

/** @param {string} root @param {string} file */
export function safeRepositoryPath(root, file) {
  if (!canonicalPath(file)) return false;
  try {
    if (realpathSync(root) !== path.resolve(root)) return false;
    let current = root;
    for (const part of file.split('/')) {
      current = path.join(current, part);
      const state = pathState(current);
      if (state !== 'plain') return state === 'missing';
    }
    return true;
  } catch {
    return false;
  }
}

/** @param {string} file */
function pathState(file) {
  try {
    return lstatSync(file).isSymbolicLink() ? 'unsafe' : 'plain';
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 'missing' : 'unsafe';
  }
}

/** @param {string} root @param {string} file */
function workingText(root, file) {
  if (!safeRepositoryPath(root, file)) return null;
  try {
    return readFileSync(path.join(root, file), 'utf8');
  } catch {
    return null;
  }
}

/**
 * De vertrouwde basis: binnen een hook het anker van de stub-lader (ADR 0045), gecontroleerd gelezen; daarbuiten `base` of
 * origin/main. Een gezet maar ongeldig anker geeft null (nooit terugval op origin/main, die een agent kan ombuigen).
 * @param {string} root @param {string | undefined} base
 * @returns {{ sha: string, read: (file: string) => string | null } | null}
 */
export function trustedBase(root, base) {
  const vast = base === undefined ? anker() : null;
  if (vast !== null) return vertrouwdeCommit(root, vast) ? { sha: vast, read: (file) => vertrouwdeTekst(root, vast, file) } : null;
  const sha = gitText(root, ['rev-parse', '--verify', `${base ?? 'origin/main'}^{commit}`])?.trim() ?? '';
  return /^[0-9a-f]{40}$/.test(sha) ? { sha, read: (file) => gitText(root, ['show', `${sha}:${file}`]) } : null;
}

/**
 * @param {{ root: string, base?: string, repository?: string, branch?: string }} config
 * @returns {import('./task-authority.mjs').Authority | null}
 */
export function readAuthority(config) {
  const basis = trustedBase(config.root, config.base);
  const repository = config.repository ?? repositoryName(gitText(config.root, ['config', '--get', 'remote.origin.url'])?.trim() ?? '');
  const branch = config.branch ?? gitText(config.root, ['branch', '--show-current'])?.trim() ?? null;
  if (basis === null || repository === null || branch === null) return null;
  const registryText = basis.read('.claude/decisions.json');
  // Voor de eerste template-update bestaan er nog geen besluiten. Dat geeft geen extra bevoegdheid.
  const registry = registryText === null ? { version: 1, requiredChecks: [], decisions: [] } : readRegistry(registryText);
  return {
    registry, repository, branch,
    trusted: (file) => canonicalPath(file) ? basis.read(file) : null,
    working: (file) => workingText(config.root, file),
    safe: (file) => safeRepositoryPath(config.root, file),
  };
}
