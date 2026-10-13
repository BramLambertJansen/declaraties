// Administratie van besluiten en bouwbewijs. Schrijft uitsluitend de afgeleide statusregel (ADR 0027).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readAuthority, gitText } from '../../.claude/hooks/lib/authority-context.mjs';
import { changeStatus, documentInfo, documentKind } from '../../.claude/hooks/lib/document-state.mjs';
import { canRecordStatus } from '../../.claude/hooks/lib/task-authority.mjs';
import { canRecordBuilt } from '../../.claude/hooks/lib/built-evidence.mjs';
import { pullRequest, checkRuns } from './github-evidence.mjs';
import { statusOnlyDiff, isAncestor, unchangedHead } from './status-git.mjs';

/** @param {string[]} args */
function argumentsFor(args) {
  const [file, status, flag, number] = args;
  if (file === undefined || status === undefined || (args.length !== 2 && (args.length !== 4 || flag !== '--pr')))
    throw new Error('Gebruik: pnpm docs:status <document> <status> [--pr <nummer>]');
  return { file, status, pr: Number(number) };
}

/** @param {{ file: string, status: string, pr: number }} target @param {{ root: string, authority: import('../../.claude/hooks/lib/task-authority.mjs').Authority, before: string }} context */
function nextStatus(target, context) {
  if (target.status !== 'gebouwd') {
    const after = changeStatus(target.file, context.before, { status: target.status });
    if (!canRecordStatus({ file: target.file, text: after }, context.authority))
      throw new Error('Geen overeenkomend eigenaarbesluit uit main; de status geeft zichzelf geen goedkeuring');
    return after;
  }
  const sha = gitText(context.root, ['rev-parse', 'HEAD'])?.trim();
  if (sha === undefined) throw new Error('HEAD is niet leesbaar');
  const pr = pullRequest(context.authority.repository, target.pr);
  const after = changeStatus(target.file, context.before, { status: target.status, pr: target.pr, validatedSha: sha });
  const commits = { from: sha, to: sha };
  const proof = {
    pr,
    headSha: sha,
    checks: checkRuns(context.authority.repository, sha),
    ancestor: isAncestor(context.root, commits),
    onlyStatuses: statusOnlyDiff(context.root, commits),
  };
  if (!canRecordBuilt({ file: target.file, text: after }, proof, context.authority))
    throw new Error('Gebouwd vereist de juiste geopende PR en alle verplichte GitHub Actions-checks groen op HEAD');
  return after;
}

/** @param {{ root: string, file: string, before: string, head: string, branch: string, base: string }} expected */
function unchanged(expected) {
  return (
    unchangedHead(expected.root, expected) &&
    gitText(expected.root, ['status', '--porcelain', '--untracked-files=all', '--', '.', ':!node_modules']) === '' &&
    readFileSync(path.join(expected.root, expected.file), 'utf8') === expected.before
  );
}

async function main() {
  const root = process.cwd();
  const target = argumentsFor(process.argv.slice(2));
  if (documentKind(target.file) === null) throw new Error('Alleen een spec- of ADR-document is toegestaan');
  const base = gitText(root, ['rev-parse', 'origin/main'])?.trim();
  const authority = base === undefined ? null : readAuthority({ root, base });
  if (authority === null || base === undefined || !authority.safe(target.file))
    throw new Error('Geen leesbare vertrouwde basis of veilig documentpad; haal origin/main opnieuw op');
  const head = gitText(root, ['rev-parse', 'HEAD'])?.trim();
  if (head === undefined) throw new Error('HEAD is niet leesbaar');
  const before = readFileSync(path.join(root, target.file), 'utf8');
  if (documentInfo(target.file, before) === null) throw new Error('Ongeldig ADR- of spec-document');
  const expected = { root, file: target.file, before, head, branch: authority.branch, base };
  if (!unchanged(expected))
    throw new Error('Leg de implementatie eerst vast; de gecontroleerde commit en werkmap moeten overeenkomen');
  const after = nextStatus(target, { root, authority, before });
  if (!unchanged(expected) || !authority.safe(target.file))
    throw new Error('De werkmap wijzigde tijdens de bewijscontrole; status niet aangepast');
  writeFileSync(path.join(root, target.file), after);
  console.log(`${target.file}: ${target.status}; bewijs gecontroleerd, alleen de statusregel gewijzigd`);
}

if (import.meta.main)
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
