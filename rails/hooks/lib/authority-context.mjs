// Alleen git-data uit de vertrouwde basis; hooks doen geen netwerkwerk (ADR 0027).
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
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
 * @param {{ root: string, base?: string, repository?: string, branch?: string }} config
 * @returns {import('./task-authority.mjs').Authority | null}
 */
export function readAuthority(config) {
  const sha = gitText(config.root, ['rev-parse', '--verify', `${config.base ?? 'origin/main'}^{commit}`])?.trim() ?? null;
  const repository = config.repository ?? repositoryName(gitText(config.root, ['config', '--get', 'remote.origin.url'])?.trim() ?? '');
  const branch = config.branch ?? gitText(config.root, ['branch', '--show-current'])?.trim() ?? null;
  if (sha === null || !/^[0-9a-f]{40}$/.test(sha) || repository === null || branch === null) return null;
  const registryText = gitText(config.root, ['show', `${sha}:.claude/decisions.json`]);
  // Voor de eerste template-update bestaan er nog geen besluiten. Dat geeft geen extra bevoegdheid.
  const registry = registryText === null ? { version: 1, requiredChecks: [], decisions: [] } : readRegistry(registryText);
  return {
    registry, repository, branch,
    trusted: (file) => canonicalPath(file) ? gitText(config.root, ['show', `${sha}:${file}`]) : null,
    working: (file) => workingText(config.root, file),
    safe: (file) => safeRepositoryPath(config.root, file),
  };
}
