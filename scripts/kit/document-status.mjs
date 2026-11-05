// Administratie van besluiten en bouwbewijs. Schrijft uitsluitend de afgeleide statusregel en, met --roadmap, het vinkje van
// het item van de eigen spec (ADR 0046 punt 10, spec taakmandaat-vervolg).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readAuthority, gitText } from '../../rails/hooks/lib/authority-context.mjs';
import { changeStatus, documentInfo, documentKind } from '../../rails/hooks/lib/document-state.mjs';
import { builtRefusal, openRefusal } from '../../rails/hooks/lib/built-evidence.mjs';
import { loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { pullRequest, checkRuns } from './github-evidence.mjs';
import { kaderVan, ROADMAP, taakVinkje, tikAf } from './roadmap-item.mjs';
import { statusOnlyDiff, mergedEvidence, unchangedHead } from './status-git.mjs';
import { functionalUiApproval } from './functional-ui-status.mjs';

const USAGE = 'Gebruik: pnpm docs:status <document> <status> [--pr <nummer> [--roadmap]]';
const ROADMAP_ONLY = '--roadmap kan alleen met een spec, status gebouwd en --pr';

/** @param {string[]} args */
function argumentsFor(args) {
  const [file, status, flag, number, extra] = args;
  const withPr = (args.length === 4 || (args.length === 5 && extra === '--roadmap')) && flag === '--pr';
  if (
    file === undefined ||
    status === undefined ||
    (args.length !== 2 && !withPr && !(args.length === 3 && flag === '--roadmap'))
  )
    throw new Error(USAGE);
  const roadmap = args.length === 5 || args.length === 3;
  if (roadmap && (!withPr || documentKind(file) !== 'spec' || status !== 'gebouwd')) throw new Error(ROADMAP_ONLY);
  return { file, status, pr: Number(number), roadmap };
}

/** Het nieuwe roadmap-bestand voor `--roadmap`, of een fout; schrijft niets (B1, spec taakmandaat-vervolg). @param {{ root: string, file: string, pr: number }} target @param {import('../../rails/hooks/lib/task-authority.mjs').Authority} authority */
function nextRoadmap(target, authority) {
  const { root } = target;
  const before = gitText(root, ['show', `HEAD:${ROADMAP}`]);
  if (before === null || !authority.safe(ROADMAP)) throw new Error(`${ROADMAP} is niet leesbaar of geen veilig pad`);
  const next = tikAf({ tekst: before, spec: target.file, pr: target.pr });
  if ('melding' in next) throw new Error(next.melding);
  const names = gitText(root, ['ls-tree', '-r', '--name-only', '-z', 'HEAD']) ?? '';
  const gates = loadConfig(gitText(root, ['show', 'origin/main:.claude/gates.json']) ?? '');
  const message = taakVinkje({
    basis: before,
    head: next.tekst,
    specs: [target.file],
    kader: kaderVan({
      packageJson: gitText(root, ['show', 'HEAD:package.json']),
      bestanden: names.split('\0').filter(Boolean),
      testpaden: gates.testpaden,
    }),
  });
  if (message !== null) throw new Error(message);
  return next.tekst;
}

/** @param {{ file: string, status: string, pr: number }} target @param {{ root: string, authority: import('../../rails/hooks/lib/task-authority.mjs').Authority, before: string }} context */
function nextStatus(target, context) {
  if (target.status !== 'gebouwd')
    throw new Error(
      `${target.status}: een eigenaarstatus zet de architect of hoofdsessie in een besluit-PR; de merge door de eigenaar beslist (ADR 0063)`,
    );
  const sha = gitText(context.root, ['rev-parse', 'HEAD'])?.trim();
  if (sha === undefined) throw new Error('HEAD is niet leesbaar');
  const pr = pullRequest(context.authority.repository, target.pr);
  if (pr.merged) return mergedStatus(target, { ...context, pr, sha });
  const after = changeStatus(target.file, context.before, { status: target.status, pr: target.pr });
  const evidence = {
    pr,
    code: codeBuitenDocs(context.root, sha),
    uiApproval: functionalUiApproval({
      root: context.root,
      base: 'origin/main',
      sha,
      repository: context.authority.repository,
      file: target.file,
      text: after,
    }),
  };
  if (openRefusal({ file: target.file, text: after }, evidence, context.authority))
    throw new Error('Gebouwd vereist de juiste geopende PR op deze branch en code buiten docs/');
  return after;
}

/** De branch wijzigt tegenover main iets buiten `docs/` en `CHANGELOG.md` (ADR 0062 punt 4). @param {string} root @param {string} sha */
function codeBuitenDocs(root, sha) {
  const split = gitText(root, ['merge-base', 'origin/main', sha])?.trim();
  if (split === undefined) return false;
  const namen = gitText(root, ['diff', '--name-only', '-z', '--no-renames', split, sha]) ?? '';
  return namen.split('\0').some((pad) => pad !== '' && !pad.startsWith('docs/') && pad !== 'CHANGELOG.md');
}

/**
 * PR n is al gemerged (spec gebouwd-na-merge, ADR 0080 punt 5): de head van PR n komt uit GitHub en het bewijs uit de mergecommit in HEAD.
 * @param {{ file: string, status: string, pr: number }} target
 * @param {{ root: string, authority: import('../../rails/hooks/lib/task-authority.mjs').Authority, before: string, pr: import('../../rails/hooks/lib/built-evidence.mjs').PullRequest, sha: string }} context
 */
function mergedStatus(target, context) {
  const { pr, root } = context;
  const after = changeStatus(target.file, context.before, { status: target.status, pr: target.pr });
  const split = gitText(root, ['merge-base', 'origin/main', context.sha])?.trim() ?? '';
  const proof = {
    pr,
    headSha: context.sha,
    checks: checkRuns(context.authority.repository, pr.headSha),
    ancestor: false,
    onlyStatuses: statusOnlyDiff(root, { from: split, to: context.sha }),
    // De mergecommit moet in main liggen, niet alleen in HEAD: een zijbranch kan een mergecommit binnenbrengen.
    merged: mergedEvidence(root, { mergeSha: pr.mergeSha ?? '', head: split, file: target.file }),
  };
  const bezwaar = builtRefusal({ file: target.file, text: after }, proof, context.authority);
  if (bezwaar !== null) throw new Error(`Gebouwd na de merge vereist ${bezwaar}`);
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
  const roadmap = target.roadmap ? nextRoadmap({ root, file: target.file, pr: target.pr }, authority) : null;
  const after = nextStatus(target, { root, authority, before });
  if (!unchanged(expected) || !authority.safe(target.file))
    throw new Error('De werkmap wijzigde tijdens de bewijscontrole; status niet aangepast');
  writeFileSync(path.join(root, target.file), after);
  if (roadmap === null) {
    console.log(`${target.file}: ${target.status}; bewijs gecontroleerd, alleen de statusregel gewijzigd`);
    return;
  }
  try {
    writeFileSync(path.join(root, ROADMAP), roadmap);
  } catch (error) {
    writeFileSync(path.join(root, target.file), before); // geen van beide bestanden wijzigt
    throw error;
  }
  console.log(
    `${target.file}: gebouwd; bewijs gecontroleerd, alleen de statusregel en het vinkje van het item gewijzigd`,
  );
}

if (import.meta.main)
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
