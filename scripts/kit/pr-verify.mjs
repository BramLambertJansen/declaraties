// Leest werkelijk CI-bewijs op de huidige PR-commit; maakt nooit zelf een check-status (ADR 0027).
import { readAuthority, gitText } from '../../.claude/hooks/lib/authority-context.mjs';
import { checkedCommit, GITHUB_ACTIONS_APP_ID } from '../../.claude/hooks/lib/built-evidence.mjs';
import { pullRequest, checkRuns } from './github-evidence.mjs';
import { setTimeout } from 'node:timers/promises';
import { unchangedHead } from './status-git.mjs';

/** @param {import('../../.claude/hooks/lib/built-evidence.mjs').CheckRun[]} checks @param {{ names: string[], sha: string }} required */
export function checkProgress(checks, required) {
  if (checkedCommit(checks, required))
    return { state: 'success', lines: required.names.map((name) => `${name}: success`) };
  if (required.names.length === 0 || !/^[0-9a-f]{40}$/.test(required.sha))
    throw new Error('Geen vertrouwde verplichte checks of geldige commit');
  const entries = required.names.map((name) => {
    const matching = checks.filter((check) => check.name === name && check.headSha === required.sha);
    if (matching.some((check) => check.appId !== GITHUB_ACTIONS_APP_ID))
      return { failed: true, line: `${name}: ongeldige check-identiteit` };
    const latest = matching.toSorted((left, right) => right.id - left.id)[0];
    return {
      failed: latest?.status === 'completed' && latest.conclusion !== 'success',
      line: `${name}: ${latest === undefined ? 'ontbreekt' : (latest.conclusion ?? latest.status)}`,
    };
  });
  return {
    state: entries.some((entry) => entry.failed) ? 'failure' : 'pending',
    lines: entries.map((entry) => entry.line),
  };
}

/** @param {string[]} args */
function argumentsFor(args) {
  const [number, flag] = args;
  if (!/^[1-9]\d*$/.test(number ?? '') || args.length > 2 || (flag !== undefined && flag !== '--watch'))
    throw new Error('Gebruik: pnpm pr:verify <nummer> [--watch]');
  return { number: Number(number), watch: flag === '--watch' };
}

/** @param {{ root: string, head: string, base: string, authority: import('../../.claude/hooks/lib/task-authority.mjs').Authority, number: number }} context */
function verifyHead(context) {
  const pr = pullRequest(context.authority.repository, context.number);
  if (
    pr.headSha !== context.head ||
    pr.branch !== context.authority.branch ||
    pr.state !== 'open' ||
    !unchangedHead(context.root, { head: context.head, branch: context.authority.branch, base: context.base }) ||
    gitText(context.root, ['status', '--porcelain', '--untracked-files=all', '--', '.', ':!node_modules']) !== ''
  )
    throw new Error('PR, branch of werkmap wijkt af van de gecontroleerde commit; bewijs opnieuw ophalen');
}

async function main() {
  const root = process.cwd();
  const target = argumentsFor(process.argv.slice(2));
  const base = gitText(root, ['rev-parse', 'origin/main'])?.trim();
  const authority = base === undefined ? null : readAuthority({ root, base });
  const head = gitText(root, ['rev-parse', 'HEAD'])?.trim();
  if (authority === null || head === undefined || base === undefined)
    throw new Error('Geen leesbare vertrouwde basis of HEAD');
  const context = { root, head, base, authority, number: target.number };
  const required = { names: authority.registry.requiredChecks, sha: head };
  const deadline = Date.now() + 30 * 60 * 1000;
  while (true) {
    verifyHead(context);
    const progress = checkProgress(checkRuns(authority.repository, head), required);
    verifyHead(context);
    console.log(`PR #${String(target.number)} · ${head}\n${progress.lines.join('\n')}`);
    if (progress.state === 'success') return;
    if (progress.state === 'failure') throw new Error('CI is rood; herstel de oorzaak en controleer de nieuwe commit');
    if (!target.watch || Date.now() >= deadline)
      throw new Error('CI ontbreekt of loopt nog; geen geslaagde oplevering');
    await setTimeout(10000);
  }
}

if (import.meta.main)
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
