// guard.yml voert uitsluitend deze versie uit main uit; PR-code wordt alleen als git-data gelezen (ADR 0027).
import { documentInfo, documentKind, builtReference } from '../../.claude/hooks/lib/document-state.mjs';
import { readAuthority, gitText } from '../../.claude/hooks/lib/authority-context.mjs';
import { canRecordStatus, canWriteProtected } from '../../.claude/hooks/lib/task-authority.mjs';
import { canRecordBuilt } from '../../.claude/hooks/lib/built-evidence.mjs';
import { loadConfig, globMatch } from '../../.claude/hooks/lib/rolhek.mjs';
import { parseNameStatus } from './diff-guard.mjs';
import { pullRequest, checkRuns } from './github-evidence.mjs';
import { regularGitFile, statusOnlyDiff, isAncestor } from './status-git.mjs';

/** @param {string} name */
function requiredEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} ontbreekt`);
  return value;
}

/** @param {{ file: string, text: string }} document @param {{ root: string, sha: string, authority: import('../../.claude/hooks/lib/task-authority.mjs').Authority }} context */
function verifyBuilt(document, context) {
  const reference = builtReference(document.text);
  if (reference === null) return false;
  const commits = { from: reference.sha, to: context.sha };
  const evidence = {
    pr: pullRequest(context.authority.repository, reference.pr),
    checks: checkRuns(context.authority.repository, reference.sha),
    headSha: context.sha,
    ancestor: isAncestor(context.root, commits),
    onlyStatuses: statusOnlyDiff(context.root, commits),
  };
  return canRecordBuilt(document, evidence, context.authority);
}

/** @param {{ file: string, before: string | null, after: string | null }} document @param {{ root: string, sha: string, authority: import('../../.claude/hooks/lib/task-authority.mjs').Authority }} context */
function verifyDocument(document, context) {
  if (documentKind(document.file) === null || document.after === null) return;
  const info = documentInfo(document.file, document.after);
  if (info === null || !regularGitFile(context.root, document.file, context.sha))
    throw new Error(`${document.file}: ongeldige status of symlink`);
  if (['voorstel', 'voorgesteld'].includes(info.status) || document.before === document.after) return;
  const target = { file: document.file, text: document.after };
  const valid = info.status === 'gebouwd' ? verifyBuilt(target, context) : canRecordStatus(target, context.authority);
  if (!valid)
    throw new Error(
      `${document.file}: status of inhoud heeft geen geldig besluit of bouwbewijs uit de vertrouwde basis`,
    );
}

/** @param {{ status: string, pad: string, van?: string }[]} changes @param {{ root: string, sha: string, authority: import('../../.claude/hooks/lib/task-authority.mjs').Authority, config: import('../../.claude/hooks/lib/rolhek.mjs').Config }} context */
function verifyScope(changes, context) {
  const active = context.authority.registry.decisions.some(
    (entry) =>
      entry.repository === context.authority.repository &&
      entry.branch === context.authority.branch &&
      entry.status === 'goedgekeurd' &&
      documentKind(entry.file) === 'spec',
  );
  if (!active) return; // Gewoon railwerk blijft onder de bestaande eigenaarreview van de diff-guard vallen.
  const files = changes.flatMap(({ pad, van }) => [pad, ...(van === undefined ? [] : [van])]);
  for (const file of files) verifyScopedFile(file, context);
}

/** @param {string} file @param {{ authority: import('../../.claude/hooks/lib/task-authority.mjs').Authority, config: import('../../.claude/hooks/lib/rolhek.mjs').Config }} context */
function verifyScopedFile(file, context) {
  if (!context.config.gates.some((glob) => globMatch(glob, file))) return;
  if (
    context.config.testpaden.some((glob) => globMatch(glob, file)) &&
    !/^(?:test\/rails\/fixtures\/|test\/setup\/)/.test(file)
  )
    return;
  if (documentKind(file) !== null) {
    const before = documentInfo(file, context.authority.trusted(file) ?? '');
    const after = documentInfo(file, context.authority.working(file) ?? '');
    if (before !== null && after !== null && before.digest === after.digest) return;
  }
  if (!canWriteProtected({ file, role: 'developer' }, context.authority))
    throw new Error(`${file}: buiten het broncodemandaat; bewaking blijft beschermd`);
}

async function main() {
  const root = process.cwd();
  const base = requiredEnv('BASE_SHA');
  const sha = requiredEnv('HEAD_SHA');
  if (![base, sha].every((value) => /^[0-9a-f]{40}$/.test(value))) throw new Error('Geen volledige commit-SHA');
  const authority = readAuthority({ root, base, repository: requiredEnv('REPO'), branch: requiredEnv('HEAD_REF') });
  if (authority === null) throw new Error('Geen leesbare vertrouwde basis voor statuscontrole');
  /** @type {import('../../.claude/hooks/lib/task-authority.mjs').Authority} */
  const snapshot = {
    ...authority,
    working: (file) => gitText(root, ['show', `${sha}:${file}`]),
    safe: (file) =>
      gitText(root, ['ls-tree', sha, '--', file]) === ''
        ? regularGitFile(root, file, base)
        : regularGitFile(root, file, sha),
  };
  const split = gitText(root, ['merge-base', base, sha])?.trim();
  if (split === undefined) throw new Error('Geen leesbare merge-base');
  const diff = gitText(root, [
    'diff',
    '--name-status',
    '-z',
    '--find-renames',
    '--no-ext-diff',
    '--no-textconv',
    split,
    sha,
  ]);
  if (diff === null) throw new Error('Diff is niet leesbaar');
  const changes = parseNameStatus(diff);
  const context = { root, sha, authority: snapshot };
  for (const { pad } of changes)
    verifyDocument({ file: pad, before: authority.trusted(pad), after: snapshot.working(pad) }, context);
  const config = loadConfig(gitText(root, ['show', `${base}:.claude/gates.json`]) ?? '');
  verifyScope(changes, { ...context, config });
  console.log('document-status: besluiten, bouwbewijs en eventuele taakscope gecontroleerd vanuit main');
}

if (import.meta.main)
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
