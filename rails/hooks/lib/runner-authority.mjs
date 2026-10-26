// Alleen vaste runner-opdrachten met ongewijzigde hostcode mogen zonder handmatige prompt (ADR 0044 punt 5).
import { gitText, safeRepositoryPath, trustedBase } from './authority-context.mjs';

export const HOST_FILES = ['scripts', 'package.json', 'pnpm-workspace.yaml', '.npmrc', '.pnpmfile.cjs', 'mise.toml',
  'compose.yaml', 'compose.*.yaml', 'compose.override.yaml', 'db/test.env', 'db/docker',
  'vitest.config.ts', 'playwright.config.ts', 'vite.config.ts'];

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
  const base = gitText(root, ['merge-base', basis.sha, 'HEAD'])?.trim();
  if (base === undefined || !/^[0-9a-f]{40}$/.test(base)) return false;
  const local = gitText(root, ['status', '--porcelain', '--untracked-files=all', '--', ...HOST_FILES]);
  const changed = gitText(root, ['diff', '--name-only', base, 'HEAD', '--', ...HOST_FILES]);
  const ignored = gitText(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '--', ...HOST_FILES]);
  const tracked = gitText(root, ['ls-files', '-z', '--', ...HOST_FILES]);
  return local === '' && changed === '' && ignored === '' && tracked !== null &&
    tracked.split('\0').filter(Boolean).every((file) => safeRepositoryPath(root, file));
}
