// Gebouwd betekent: implementatie gecontroleerd en aangeboden in een PR. Het is geen release of nieuw mandaat.
import { builtReference, documentInfo } from './document-state.mjs';
import { canRecordStatus } from './task-authority.mjs';

export const GITHUB_ACTIONS_APP_ID = 15368;

/** @typedef {{ id: number, name: string, headSha: string, status: string, conclusion: string | null, appId: number }} CheckRun */
/** @typedef {{ number: number, repository: string, branch: string, headSha: string, state: string, merged: boolean }} PullRequest */
/** @typedef {{ pr: PullRequest, checks: CheckRun[], headSha: string, onlyStatuses: boolean, ancestor: boolean }} BuiltEvidence */

/** @param {CheckRun[]} checks @param {{ names: string[], sha: string }} required */
export function checkedCommit(checks, required) {
  if (required.names.length === 0 || !/^[0-9a-f]{40}$/.test(required.sha)) return false;
  return required.names.every((name) => {
    const matching = checks.filter((check) => check.name === name && check.headSha === required.sha);
    if (matching.some((check) => check.appId !== GITHUB_ACTIONS_APP_ID)) return false;
    const latest = matching.toSorted((left, right) => right.id - left.id)[0];
    return latest?.status === 'completed' && latest.conclusion === 'success';
  });
}

/**
 * @param {{ file: string, text: string }} document
 * @param {BuiltEvidence} evidence
 * @param {import('./task-authority.mjs').Authority} authority
 */
export function canRecordBuilt(document, evidence, authority) {
  const info = documentInfo(document.file, document.text);
  const reference = builtReference(document.text);
  if (info?.kind !== 'spec' || info.status !== 'gebouwd' || reference === null) return false;
  const approved = document.text.replace(/^status:[^\r\n]*$/m, 'status: goedgekeurd');
  const { pr } = evidence;
  if (!/^[0-9a-f]{40}$/.test(evidence.headSha) || !/^[0-9a-f]{40}$/.test(pr.headSha)) return false;
  if (!canRecordStatus({ file: document.file, text: approved }, authority)) return false;
  if (pr.number !== reference.pr || pr.repository !== authority.repository || pr.branch !== authority.branch ||
    pr.headSha !== evidence.headSha || (pr.state !== 'open' && !pr.merged)) return false;
  return evidence.ancestor && evidence.onlyStatuses && checkedCommit(evidence.checks, { names: authority.registry.requiredChecks, sha: reference.sha });
}
