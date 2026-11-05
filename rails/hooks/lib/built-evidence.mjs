// Gebouwd betekent: implementatie gecontroleerd en aangeboden in een PR. Het is geen release of nieuw mandaat.
import { MARKERING, acIds, builtReference, documentInfo } from './document-state.mjs';
import { canRecordStatus, TEMPLATE_REPOSITORY } from './task-authority.mjs';
import { isFunctionalUiSpec } from './functional-ui.mjs';

export const GITHUB_ACTIONS_APP_ID = 15368;
// De aparte CodeQL-resultaatcheck komt van GitHub Advanced Security, niet van de Actions-analysejob.
const CODE_SCANNING_APP_ID = 57789;

/** @typedef {{ id: number, name: string, headSha: string, status: string, conclusion: string | null, appId: number }} CheckRun */
/** @typedef {{ number: number, repository: string, branch: string, headSha: string, state: string, merged: boolean, mergeSha: string | null, baseBranch: string }} PullRequest */
/** Feiten uit Git over de mergecommit van een gemergde PR (spec gebouwd-na-merge). */
/** @typedef {{ inHead: boolean, parents: string[], specAtMerge: string | null, requiredChecks: string[] | null, bouwpaden: string[] }} MergedEvidence */
/** `ancestor` en `headSha` gelden alleen voor een open PR; een gemergde PR toetst `merged` (inHead: in main, via de merge-base). */
/** @typedef {{ pr: PullRequest, checks: CheckRun[], headSha: string, onlyStatuses: boolean, ancestor: boolean, uiApproval?: string | null, merged?: MergedEvidence }} BuiltEvidence */

const ALGEMEEN = 'de juiste PR en gevalideerde commit';

/** @param {CheckRun[]} checks @param {{ names: string[], sha: string }} required */
export function requiredProofChecks(checks, required) {
  const scanning = required.names.some((name) => name.startsWith('codeql (')) ||
    checks.some((check) => check.name === 'CodeQL' && check.headSha === required.sha);
  return scanning && !required.names.includes('CodeQL') ? [...required.names, 'CodeQL'] : required.names;
}

/** @param {string} name */
export function expectedCheckAppId(name) {
  return name === 'CodeQL' ? CODE_SCANNING_APP_ID : GITHUB_ACTIONS_APP_ID;
}

/** @param {CheckRun[]} checks @param {{ names: string[], sha: string }} required */
export function checkedCommit(checks, required) {
  if (required.names.length === 0 || !/^[0-9a-f]{40}$/.test(required.sha)) return false;
  return requiredProofChecks(checks, required).every((name) => {
    const matching = checks.filter((check) => check.name === name && check.headSha === required.sha);
    if (matching.some((check) => check.appId !== expectedCheckAppId(name))) return false;
    const latest = matching.toSorted((left, right) => right.id - left.id)[0];
    return latest?.status === 'completed' && latest.conclusion === 'success';
  });
}

/**
 * Zonder bouwbewijs het bezwaar als voorwaarde ("vereist …"), anders null. Een gemergde PR gaat via de mergecommit, met de head
 * uit GitHub als er geen SHA in de regel staat (ADR 0080 punt 5); een open PR met SHA via de lokale HEAD op de PR-branch
 * (ADR 0046 punt 10, ADR 0062 punt 4, spec gebouwd-na-merge). Een open PR zonder SHA: `openRefusal`.
 * @param {{ file: string, text: string }} document
 * @param {BuiltEvidence} evidence
 * @param {import('./task-authority.mjs').Authority} authority
 * @returns {string | null}
 */
export function builtRefusal(document, evidence, authority) {
  const info = documentInfo(document.file, document.text);
  const reference = builtReference(document.text);
  if (info?.kind !== 'spec' || info.status !== 'gebouwd' || reference === null) return ALGEMEEN;
  const { pr } = evidence;
  if (!/^[0-9a-f]{40}$/.test(pr.headSha) || pr.number !== reference.pr || pr.repository !== authority.repository) return ALGEMEEN;
  if (!approvedBefore(document, evidence, authority)) return ALGEMEEN;
  if (pr.merged) return mergedRefusal({ digest: info.digest, file: document.file, sha: reference.sha ?? pr.headSha }, evidence);
  if (reference.sha === undefined || !/^[0-9a-f]{40}$/.test(evidence.headSha) || pr.state !== 'open' ||
    pr.branch !== authority.branch || pr.headSha !== evidence.headSha) return ALGEMEEN;
  const groen = evidence.ancestor && evidence.onlyStatuses &&
    checkedCommit(evidence.checks, { names: authority.registry.requiredChecks, sha: reference.sha });
  return groen ? null : ALGEMEEN;
}

/**
 * `docs:status` voor een open PR (ADR 0080 punt 5, Werking 3): `gebouwd # #N` met PR N open op deze branch, code buiten
 * `docs/` en een spec die goedgekeurd op main stond (of UI-akkoord had); geen check-runs, die eist de ruleset bij de merge.
 * @param {{ file: string, text: string }} document
 * @param {{ pr: PullRequest, code: boolean, uiApproval?: string | null }} evidence
 * @param {import('./task-authority.mjs').Authority} authority
 * @returns {boolean} true als het geweigerd wordt
 */
export function openRefusal(document, evidence, authority) {
  const info = documentInfo(document.file, document.text);
  const reference = builtReference(document.text);
  const { pr } = evidence;
  if (info?.kind !== 'spec' || info.status !== 'gebouwd' || reference?.sha !== undefined || reference === null) return true;
  if (pr.number !== reference.pr || pr.repository !== authority.repository || pr.state !== 'open' || pr.merged ||
    pr.branch !== authority.branch || !evidence.code) return true;
  return !approvedBefore(document, { uiApproval: evidence.uiApproval }, authority) && !gebouwdOpMain(document, authority);
}

/**
 * Vervolgbouw van een levende spec (ADR 0080 punt 4): de spec staat al `gebouwd` op main met dezelfde inhoud (de digest telt
 * zonder markering), dus de bouw-PR die alleen de markering weghaalt mag `gebouwd # #<deze PR>` schrijven.
 * @param {{ file: string, text: string }} document @param {import('./task-authority.mjs').Authority} authority
 */
function gebouwdOpMain(document, authority) {
  if (!authority.safe(document.file)) return false;
  const trusted = documentInfo(document.file, authority.trusted(document.file) ?? '');
  return trusted?.kind === 'spec' && trusted.status === 'gebouwd' &&
    trusted.digest === documentInfo(document.file, document.text)?.digest;
}

/** De spec stond goedgekeurd op main of in een besluit (of had UI-akkoord) vóór `gebouwd`. */
/** @param {{ file: string, text: string }} document @param {{ uiApproval?: string | null | undefined }} evidence @param {import('./task-authority.mjs').Authority} authority */
function approvedBefore(document, evidence, authority) {
  const approved = document.text.replace(/^status:[^\r\n]*$/m, 'status: goedgekeurd');
  const ui = authority.repository === TEMPLATE_REPOSITORY && authority.safe(document.file) &&
    isFunctionalUiSpec(approved) && evidence.uiApproval === documentInfo(document.file, approved)?.digest;
  return ui || canRecordStatus({ file: document.file, text: approved }, authority);
}

/**
 * Gemergde route: de gevalideerde SHA (of zonder SHA in de regel de head uit GitHub) is de PR-head; de mergecommit zit in HEAD, draagt de ongewijzigde goedgekeurde spec en een
 * door de spec genoemd pad buiten docs/, en de verplichte checks uit main vlak vóór de merge waren groen op de PR-head.
 * @param {{ digest: string, file: string, sha: string }} spec @param {BuiltEvidence} evidence
 */
function mergedRefusal(spec, evidence) {
  const { pr, merged } = evidence;
  const n = String(pr.number);
  if (spec.sha !== pr.headSha) return ALGEMEEN;
  const ouders = merged?.parents ?? [];
  if (merged === undefined || pr.baseBranch !== 'main' || !merged.inHead || ![1, 2].includes(ouders.length) ||
    (ouders.length === 2 && ouders[1] !== pr.headSha)) return `de mergecommit van PR #${n} in HEAD`;
  const bijMerge = documentInfo(spec.file, merged.specAtMerge ?? '');
  if (bijMerge?.kind !== 'spec' || bijMerge.status !== 'goedgekeurd' || bijMerge.digest !== spec.digest)
    return 'de spec ongewijzigd en goedgekeurd in de mergecommit';
  if (acIds(merged.specAtMerge ?? '').gemarkeerd.size > 0)
    return `de spec zonder AC${MARKERING} in de mergecommit (ADR 0080)`;
  const names = merged.requiredChecks ?? [];
  if (!checkedCommit(evidence.checks, { names, sha: pr.headSha }))
    return `alle verplichte GitHub Actions-checks groen op de head van PR #${n}`;
  if (merged.bouwpaden.length === 0) return `een wijziging buiten docs/ in PR #${n} op een pad dat de spec noemt`;
  return evidence.onlyStatuses ? null : 'alleen statusregels en het eigen roadmapvinkje in deze PR';
}

/**
 * @param {{ file: string, text: string }} document
 * @param {BuiltEvidence} evidence
 * @param {import('./task-authority.mjs').Authority} authority
 */
export function canRecordBuilt(document, evidence, authority) {
  return builtRefusal(document, evidence, authority) === null;
}
