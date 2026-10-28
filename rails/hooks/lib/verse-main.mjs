// Nieuw werk begint vanaf een verse main (framework §8): een commando dat een nieuwe lokale branch maakt, start van
// `origin/main` en haalt die in hetzelfde commando eerst op, verbonden met alleen `&&`. Het rolhek gebruikt geen netwerk;
// door de `&&` ontstaat er geen branch als de fetch faalt. Geldt voor elke rol, in de template en in elke app.
import { gitSubcommand, programName, splitCommand, tokenize } from './shell.mjs';

export const VERSE_MAIN_MELDING =
  'nieuw werk begint vanaf een verse main: `git fetch origin main && git switch -c <naam> origin/main` in één commando ' +
  '(ook `checkout -b`, `git branch`, `worktree add -b`; framework §8). Een branch op een andere basis maakt de eigenaar zelf.';

const SEPARATORS = new Set([';', '&&', '||', '|', '&', '|&', '\n', '(', ')']);
const ORIGIN_MAIN = new Set(['origin/main', 'refs/remotes/origin/main']);
const MAIN_REFSPECS = new Set(['main', 'refs/heads/main']);
// Opties van `git branch` die samen met het maken van een branch mogen; elke andere maakt er een lees-, verwijder-,
// hernoem- of kopieeropdracht van.
const BRANCH_CREATE_OPTIONS = /^(?:-f|--force|-t|--track(?:=.*)?|--no-track|-q|--quiet|--recurse-submodules)$/;

/** @typedef {{ words: string[], before: string | null }} Segment */

/**
 * Losse commando's met de operator ervoor (`&&`, `;`, …); redirect-doelen tellen niet als woord.
 * @param {string} command
 * @returns {Segment[]}
 */
function segments(command) {
  /** @type {Segment[]} */
  const found = [];
  /** @type {Segment} */
  let current = { words: [], before: null };
  let skipNext = false;
  for (const token of tokenize(command)) {
    if (token.kind === 'op' && SEPARATORS.has(token.value)) {
      if (current.words.length > 0) found.push(current);
      current = { words: [], before: token.value };
    } else if (token.kind === 'op') skipNext = true;
    else if (skipNext) skipNext = false;
    else current.words.push(token.value);
  }
  if (current.words.length > 0) found.push(current);
  return found;
}

/**
 * De naam van de nieuwe branch staat in de optie zelf (`-cfeat/x`, `--create=feat/x`) of in het volgende woord.
 * @param {readonly string[]} rest
 * @param {{ short: RegExp, long: RegExp }} flags
 * @returns {{ creates: boolean, operands: string[] }}
 */
function createOperands(rest, { short, long }) {
  let creates = false;
  /** @type {string[]} */
  const operands = [];
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index] ?? '';
    if (arg === '--') break;
    const shortAt = /^-[^-]/.test(arg) ? arg.slice(1).search(short) : -1;
    const isLong = long.test(arg.split('=')[0] ?? '');
    if (shortAt !== -1 || isLong) {
      creates = true;
      const inline = isLong ? arg.includes('=') : arg.length > shortAt + 2;
      if (!inline) index += 1;
    } else if (!arg.startsWith('-')) operands.push(arg);
  }
  return { creates, operands };
}

/**
 * Het startpunt van een nieuwe branch (HEAD als het ontbreekt), of null als het commando geen branch maakt.
 * @param {string} subcommand
 * @param {readonly string[]} rest
 * @returns {string | null}
 */
export function newBranchStart(subcommand, rest) {
  if (subcommand === 'switch') {
    const { creates, operands } = createOperands(rest, { short: /[cC]/, long: /^--(?:cr|force-c|orphan)/ });
    return creates ? (operands[0] ?? 'HEAD') : null;
  }
  if (subcommand === 'checkout') {
    const { creates, operands } = createOperands(rest, { short: /[bB]/, long: /^--orphan/ });
    return creates ? (operands[0] ?? 'HEAD') : null;
  }
  if (subcommand === 'worktree' && rest[0] === 'add') {
    const args = rest.slice(1).flatMap((arg, index, all) => (all[index - 1] === '--reason' || arg === '--reason' ? [] : [arg]));
    const { creates, operands } = createOperands(args, { short: /^[bB]/, long: /^$/ });
    return creates ? (operands[1] ?? 'HEAD') : null;
  }
  if (subcommand !== 'branch') return null;
  const options = rest.filter((arg) => arg.startsWith('-'));
  const operands = rest.filter((arg) => !arg.startsWith('-'));
  if (operands.length === 0 || !options.every((arg) => BRANCH_CREATE_OPTIONS.test(arg))) return null;
  return operands[1] ?? 'HEAD';
}

/**
 * `git fetch origin` of `git fetch origin main`, met alleen opties ervoor of ertussen.
 * @param {string} subcommand
 * @param {readonly string[]} rest
 */
function fetchesMain(subcommand, rest) {
  if (subcommand !== 'fetch') return false;
  const operands = rest.filter((arg) => !arg.startsWith('-'));
  return operands[0] === 'origin' && operands.slice(1).every((spec) => MAIN_REFSPECS.has(spec));
}

/**
 * @param {Segment} segment
 * @returns {{ subcommand: string, rest: string[] } | null}
 */
function gitCall(segment) {
  const { argv } = splitCommand(segment.words);
  if (programName(argv[0] ?? '') !== 'git') return null;
  const { subcommand, rest } = gitSubcommand(argv.slice(1));
  return { subcommand, rest };
}

/**
 * Weigeringen voor elk commando dat een branch maakt zonder verse origin/main ervoor.
 * @param {string} command
 * @returns {string[]}
 */
export function staleBranchStart(command) {
  const parts = segments(command);
  /** @type {string[]} */
  const found = [];
  let fetched = false;
  for (const segment of parts) {
    if (segment.before !== '&&') fetched = false;
    const git = gitCall(segment);
    if (git === null) continue;
    const start = newBranchStart(git.subcommand, git.rest);
    if (start !== null && !(fetched && ORIGIN_MAIN.has(start))) found.push(VERSE_MAIN_MELDING);
    if (fetchesMain(git.subcommand, git.rest)) fetched = true;
  }
  return found;
}
