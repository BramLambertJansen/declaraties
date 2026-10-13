// Alleen vaste runner-opdrachten met ongewijzigde hostcode mogen zonder handmatige prompt (ADR 0027).
import { gitText, safeRepositoryPath } from './authority-context.mjs';

const HOST_FILES = ['scripts', 'package.json', 'pnpm-workspace.yaml', '.npmrc', '.pnpmfile.cjs', 'mise.toml',
  'compose.yaml', 'compose.*.yaml', 'compose.override.yaml', 'db/test.env', 'db/docker'];

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

/** @param {string} root */
export function trustedRunner(root) {
  const base = gitText(root, ['merge-base', 'origin/main', 'HEAD'])?.trim();
  if (base === undefined || !/^[0-9a-f]{40}$/.test(base)) return false;
  const trusted = gitText(root, ['rev-parse', '--verify', 'origin/main^{commit}'])?.trim();
  if (trusted === undefined || !/^[0-9a-f]{40}$/.test(trusted) ||
    !enabled(gitText(root, ['show', `${trusted}:.claude/gates.json`]) ?? '')) return false;
  const local = gitText(root, ['status', '--porcelain', '--untracked-files=all', '--', ...HOST_FILES]);
  const changed = gitText(root, ['diff', '--name-only', base, 'HEAD', '--', ...HOST_FILES]);
  const ignored = gitText(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '--', ...HOST_FILES]);
  const tracked = gitText(root, ['ls-files', '-z', '--', ...HOST_FILES]);
  return local === '' && changed === '' && ignored === '' && tracked !== null &&
    tracked.split('\0').filter(Boolean).every((file) => safeRepositoryPath(root, file));
}
