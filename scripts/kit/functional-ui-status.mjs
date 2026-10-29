// Gedeelde scopecontrole voor de guard en docs:status; beide lezen dezelfde broncommit als git-data.
import { documentInfo } from '../../rails/hooks/lib/document-state.mjs';
import { isFunctionalUiSpec, isUiTest, testChangeRisk } from '../../rails/hooks/lib/functional-ui.mjs';
import { gitText } from '../../rails/hooks/lib/authority-context.mjs';
import { loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { parseNameStatus } from './diff-guard.mjs';
import { laneVan } from './lane.mjs';
import { regularGitFile } from './status-git.mjs';

/** @typedef {{ root: string, base: string, sha: string }} Snapshot */

/** @param {Snapshot} snapshot @param {{ status: string, pad: string, van?: string }[]} changes */
export function verifyFunctionalUiChanges(snapshot, changes) {
  const split = gitText(snapshot.root, ['merge-base', snapshot.base, snapshot.sha])?.trim();
  if (split === undefined) throw new Error('Geen leesbare UI-merge-base');
  for (const { status, pad } of changes) {
    if (status !== 'D' && !regularGitFile(snapshot.root, pad, snapshot.sha))
      throw new Error(`${pad}: geen regulier UI-bestand`);
    if (!isUiTest(pad)) continue;
    const before = gitText(snapshot.root, ['show', `${split}:${pad}`]) ?? '';
    const after = gitText(snapshot.root, ['show', `${snapshot.sha}:${pad}`]) ?? '';
    const risk = testChangeRisk(before, after);
    if (risk !== null)
      throw new Error(
        `${pad}: ${risk === 'skip' ? 'tests skippen' : 'testgevallen weghalen'} vraagt afzonderlijk eigenaarakkoord`,
      );
  }
}

/** @param {Snapshot & { file: string, text: string, repository: string }} snapshot */
export function functionalUiApproval(snapshot) {
  const { root, base, sha, file, text, repository } = snapshot;
  const source = gitText(root, ['show', `${sha}:${file}`]) ?? '';
  const info = documentInfo(file, source);
  const original = documentInfo(file, gitText(root, ['show', `${base}:${file}`]) ?? '');
  if (!isFunctionalUiSpec(source) || info?.status !== 'goedgekeurd' || info.digest !== documentInfo(file, text)?.digest)
    return null;
  if (original !== null && original.status !== 'voorstel') return null;
  const split = gitText(root, ['merge-base', base, sha])?.trim();
  if (split === undefined) return null;
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
  if (diff === null) return null;
  const changes = parseNameStatus(diff);
  const config = loadConfig(gitText(root, ['show', `${base}:.claude/gates.json`]) ?? '');
  const lane = laneVan({ changes, besluiten: [file], mini: true, functioneleUi: true, repository, config });
  if (lane.lane !== 'feature') return null;
  verifyFunctionalUiChanges(snapshot, changes);
  return info.digest;
}
