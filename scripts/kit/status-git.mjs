import { documentInfo } from '../../.claude/hooks/lib/document-state.mjs';
import { gitText } from '../../.claude/hooks/lib/authority-context.mjs';

/** @param {string} root @param {{ head: string, branch: string, base: string }} expected */
export function unchangedHead(root, expected) {
  return (
    gitText(root, ['rev-parse', 'HEAD'])?.trim() === expected.head &&
    gitText(root, ['branch', '--show-current'])?.trim() === expected.branch &&
    gitText(root, ['rev-parse', 'origin/main'])?.trim() === expected.base
  );
}
import { parseNameStatus } from './diff-guard.mjs';

/** @param {string} root @param {{ from: string, to: string }} commits */
export function statusOnlyDiff(root, commits) {
  if (![commits.from, commits.to].every((sha) => /^[0-9a-f]{40}$/.test(sha))) return false;
  const diff = gitText(root, [
    'diff',
    '--name-status',
    '-z',
    '--no-ext-diff',
    '--no-textconv',
    commits.from,
    commits.to,
  ]);
  if (diff === null) return false;
  return parseNameStatus(diff).every(({ status, pad }) => {
    if (status !== 'M') return false;
    const before = documentInfo(pad, gitText(root, ['show', `${commits.from}:${pad}`]) ?? '');
    const after = documentInfo(pad, gitText(root, ['show', `${commits.to}:${pad}`]) ?? '');
    return before !== null && after !== null && before.digest === after.digest;
  });
}

/** @param {string} root @param {{ from: string, to: string }} commits */
export function isAncestor(root, commits) {
  if (![commits.from, commits.to].every((sha) => /^[0-9a-f]{40}$/.test(sha))) return false;
  return gitText(root, ['merge-base', '--is-ancestor', commits.from, commits.to]) !== null;
}

/** @param {string} root @param {string} file @param {string} sha */
export function regularGitFile(root, file, sha) {
  const tree = gitText(root, ['ls-tree', sha, '--', file]);
  return tree !== null && /^100(?:644|755) blob [0-9a-f]{40}\t/.test(tree);
}
