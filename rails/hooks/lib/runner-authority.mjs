// Alleen vaste runner-opdrachten met ongewijzigde hostcode mogen zonder handmatige prompt (ADR 0044 punt 5).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { gitText, safeRepositoryPath, trustedBase } from './authority-context.mjs';

export const HOST_FILES = ['scripts', 'package.json', 'pnpm-workspace.yaml', '.npmrc', '.pnpmfile.cjs', 'mise.toml',
  'compose.yaml', 'compose.*.yaml', 'compose.override.yaml', 'db/test.env', 'db/docker',
  'vitest.config.ts', 'playwright.config.ts', 'vite.config.ts'];

// `pnpm pr:merge` (ADR 0069 punt 4) volgt de scriptregel in package.json en laadt pr-merge.mjs met imports uit scripts/ en
// rails/: die bestanden plus de hostbestanden moeten gelijk zijn aan het anker.
export const MERGE_FILES = [...HOST_FILES, 'rails'];
const MERGE_BIN = ['gh', 'git', 'node', 'gh.exe', 'git.exe', 'node.exe'];

/** @param {string} command */
export function automaticRunner(command) {
  return /^pnpm (?:run )?(?:test:db|ui:check|gate:slow)$/.test(command.trim().replace(/ +/g, ' '));
}

/** @param {string} text */
function enabled(text) {
  try {
    /** @type {unknown} */
    const value = JSON.parse(text);
    return typeof value === 'object' && value !== null && 'autoRunner' in value && value.autoRunner === true;
  } catch {
    return false;
  }
}

/**
 * Binnen een hook het anker (ADR 0045), gecontroleerd gelezen; anders origin/main. Het rolhek geeft de basis door die het
 * al berekende; zonder basis (null) is het antwoord nee.
 * @param {string} root
 * @param {ReturnType<typeof trustedBase>} [basis]
 */
export function trustedRunner(root, basis = trustedBase(root, undefined)) {
  if (basis === null || !enabled(basis.read('.claude/gates.json') ?? '')) return false;
  return unchangedFrom(root, basis.sha, HOST_FILES);
}

/**
 * De bestanden staan op schijf precies zoals in de merge-base met het anker: niets lokaal gewijzigd, niets op de branch
 * gewijzigd, geen genegeerd of onveilig pad.
 * @param {string} root @param {string} anker @param {readonly string[]} files
 */
export function unchangedFrom(root, anker, files) {
  const base = gitText(root, ['merge-base', anker, 'HEAD'])?.trim();
  if (base === undefined || !/^[0-9a-f]{40}$/.test(base)) return false;
  const local = gitText(root, ['status', '--porcelain', '--untracked-files=all', '--', ...files]);
  const changed = gitText(root, ['diff', '--name-only', base, 'HEAD', '--', ...files]);
  const ignored = gitText(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '--', ...files]);
  const tracked = gitText(root, ['ls-files', '-z', '--', ...files]);
  return local === '' && changed === '' && ignored === '' && tracked !== null &&
    tracked.split('\0').filter(Boolean).every((file) => safeRepositoryPath(root, file));
}

/** @param {string} text */
function mergeMode(text) {
  try {
    /** @type {unknown} */
    const value = JSON.parse(text);
    return typeof value === 'object' && value !== null && 'merge' in value && value.merge === 'niet-kritiek';
  } catch {
    return false;
  }
}

/**
 * `pnpm pr:merge` zonder prompt (ADR 0069 punt 4): modus `niet-kritiek` in het anker en `MERGE_FILES` ongewijzigd. Zonder
 * basis (null) is het antwoord nee.
 * @param {string} root
 * @param {ReturnType<typeof trustedBase>} [basis]
 */
export function trustedMerge(root, basis = trustedBase(root, undefined)) {
  if (basis === null || !mergeMode(basis.read('.claude/gates.json') ?? '')) return false;
  // `pnpm run` zet `node_modules/.bin` vooraan in PATH; daar hoort geen gh, git of node (ADR 0069 punt 4).
  if (MERGE_BIN.some((naam) => existsSync(path.join(root, 'node_modules', '.bin', naam)))) return false;
  return unchangedFrom(root, basis.sha, MERGE_FILES);
}
