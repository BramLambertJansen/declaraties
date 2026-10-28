// Leest werkelijk CI-bewijs op de huidige PR-commit; maakt nooit zelf een check-status (ADR 0046).
import { readAuthority, gitText } from '../../rails/hooks/lib/authority-context.mjs';
import { checkedCommit, expectedCheckAppId, requiredProofChecks } from '../../rails/hooks/lib/built-evidence.mjs';
import { pullRequest, checkRuns } from './github-evidence.mjs';
import { setTimeout } from 'node:timers/promises';
import { unchangedHead } from './status-git.mjs';

/** @param {import('../../rails/hooks/lib/built-evidence.mjs').CheckRun[]} checks @param {{ names: string[], sha: string }} required */
function codeqlAnalysisPending(checks, required) {
  return required.names
    .filter((name) => name.startsWith('codeql ('))
    .some((name) => {
      const latest = checks
        .filter((check) => check.name === name && check.headSha === required.sha)
        .toSorted((left, right) => right.id - left.id)[0];
      return latest?.status !== 'completed';
    });
}

/** @param {import('../../rails/hooks/lib/built-evidence.mjs').CheckRun[]} checks @param {{ names: string[], sha: string }} required */
export function checkProgress(checks, required) {
  const names = requiredProofChecks(checks, required);
  if (checkedCommit(checks, required)) return { state: 'success', lines: names.map((name) => `${name}: success`) };
  if (required.names.length === 0 || !/^[0-9a-f]{40}$/.test(required.sha))
    throw new Error('Geen vertrouwde verplichte checks of geldige commit');
  const entries = names.map((name) => {
    const matching = checks.filter((check) => check.name === name && check.headSha === required.sha);
    if (matching.some((check) => check.appId !== expectedCheckAppId(name)))
      return { failed: true, line: `${name}: ongeldige check-identiteit` };
    const latest = matching.toSorted((left, right) => right.id - left.id)[0];
    const waitingForAnalysis =
      name === 'CodeQL' && latest?.conclusion === 'neutral' && codeqlAnalysisPending(checks, required);
    return {
      failed: !waitingForAnalysis && latest?.status === 'completed' && latest.conclusion !== 'success',
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

/** @param {string} pad @param {readonly string[]} negeer */
function valtOnderNegeer(pad, negeer) {
  if (pad.split('/').includes('..')) return false;
  return negeer.some((entry) => (entry.endsWith('/') ? pad.startsWith(entry) : pad === entry));
}

/**
 * De paden uit `git status --porcelain` die pr:verify blokkeren: alles behalve ongetrackte bestanden onder `negeer`
 * (ADR 0045 punt 23). Een getrackte wijziging, hernoeming of pad met `..` blokkeert altijd.
 * @param {string} statusPorcelain @param {readonly string[]} negeer
 * @returns {string[]}
 */
export function onbekendeWerkmapBestanden(statusPorcelain, negeer) {
  return statusPorcelain
    .split('\n')
    .filter((regel) => regel !== '')
    .filter((regel) => !(regel.startsWith('?? ') && valtOnderNegeer(regel.slice(3), negeer)))
    .map((regel) => regel.slice(3));
}

/**
 * `werkmapNegeer` uit .claude/gates.json op de vertrouwde basis (nooit uit de werkmap); ongeldige vorm geeft [].
 * @param {string} root @param {string} base
 * @returns {string[]}
 */
export function werkmapNegeer(root, base) {
  try {
    /** @type {unknown} */
    const gates = JSON.parse(gitText(root, ['show', `${base}:.claude/gates.json`]) ?? '');
    const lijst = typeof gates === 'object' && gates !== null && 'werkmapNegeer' in gates ? gates.werkmapNegeer : null;
    return Array.isArray(lijst) && lijst.every((pad) => typeof pad === 'string') ? lijst.map(String) : [];
  } catch {
    return [];
  }
}

/** @param {{ root: string, base: string }} context */
function verifyWorktree({ root, base }) {
  const status = gitText(root, ['status', '--porcelain', '--untracked-files=all', '--', '.', ':!node_modules']);
  if (status === null)
    throw new Error('Werkmapstatus is niet leesbaar; controleer Git-toegang en haal het bewijs opnieuw op');
  const blocked = onbekendeWerkmapBestanden(status, werkmapNegeer(root, base));
  if (blocked.length > 0)
    throw new Error(
      `Werkmap bevat blokkerende wijzigingen:\n${blocked.map((file) => `- ${file}`).join('\n')}\nControleer werkmap en index; haal het bewijs opnieuw op`,
    );
}

/** @param {{ root: string, head: string, base: string, authority: import('../../rails/hooks/lib/task-authority.mjs').Authority, number: number }} context */
function verifyHead(context) {
  const pr = pullRequest(context.authority.repository, context.number);
  if (
    pr.headSha !== context.head ||
    pr.branch !== context.authority.branch ||
    pr.state !== 'open' ||
    !unchangedHead(context.root, { head: context.head, branch: context.authority.branch, base: context.base })
  )
    throw new Error('PR, branch of werkmap wijkt af van de gecontroleerde commit; bewijs opnieuw ophalen');
  verifyWorktree(context);
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
