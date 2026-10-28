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
// Opties waarmee `git branch` iets anders doet dan een branch maken (lezen, verwijderen, hernoemen, kopiëren, upstream);
// elke andere optie laat het een create blijven (dicht falen).
const BRANCH_OTHER_LONG = /^--(?:d|mo|cop|l|a|rem|v|con|no-con|me|no-me|po|so|form|sh|se|u|e|colu|no-colu|ig|om)/;
const BRANCH_OTHER_SHORT = /^-[a-zA-Z]*[dDmMcClarvui]/;
// Opties van `git fetch` met een losse waarde, en opties waarna origin/main niet echt is bijgewerkt.
const FETCH_VALUE_OPTIONS = new Set(['--depth', '--deepen', '--shallow-since', '--shallow-exclude', '-j', '--jobs',
  '--upload-pack', '--negotiation-tip', '-o', '--server-option', '--filter']);
const FETCH_NO_UPDATE = /^--(?:dry-run|refmap)/;

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
 * `git worktree add [-b|-B <naam>] <pad> [start]`. Zonder `-b`/`-B`/`--detach` en zonder start maakt git zelf een branch
 * naar het pad, vanaf HEAD; `--orphan` maakt er een zonder geschiedenis.
 * @param {readonly string[]} args de woorden na `add`
 * @returns {string | null}
 */
function worktreeStart(args) {
  const words = args.filter((arg, index) => arg !== '--reason' && args[index - 1] !== '--reason');
  const { creates, operands } = createOperands(words, { short: /[bB]/, long: /^--orp/ });
  if (creates) return operands[1] ?? 'HEAD';
  if (words.some((arg) => /^--det/.test(arg) || /^-[a-zA-Z]*d/.test(arg))) return null;
  return operands.length === 1 ? 'HEAD' : null;
}

/**
 * Het startpunt van een nieuwe branch (HEAD als het ontbreekt), of null als het commando geen branch maakt.
 * @param {string} subcommand
 * @param {readonly string[]} rest
 * @returns {string | null}
 */
export function newBranchStart(subcommand, rest) {
  if (subcommand === 'switch') {
    const { creates, operands } = createOperands(rest, { short: /[cC]/, long: /^--(?:cr|force-|orp)/ });
    return creates ? (operands[0] ?? 'HEAD') : null;
  }
  if (subcommand === 'checkout') {
    const { creates, operands } = createOperands(rest, { short: /[bB]/, long: /^--orp/ });
    return creates ? (operands[0] ?? 'HEAD') : null;
  }
  if (subcommand === 'worktree' && rest[0] === 'add') return worktreeStart(rest.slice(1));
  if (subcommand !== 'branch') return null;
  const operands = rest.filter((arg) => !arg.startsWith('-'));
  const other = rest.some((arg) => BRANCH_OTHER_SHORT.test(arg) || BRANCH_OTHER_LONG.test(arg));
  if (operands.length === 0 || other) return null;
  return operands[1] ?? 'HEAD';
}

/**
 * `git fetch origin` of `git fetch origin main`, met alleen opties ervoor of ertussen.
 * @param {string} subcommand
 * @param {readonly string[]} rest
 */
function fetchesMain(subcommand, rest) {
  if (subcommand !== 'fetch' || rest.some((arg) => FETCH_NO_UPDATE.test(arg))) return false;
  const operands = rest.filter((arg, index) => !arg.startsWith('-') && !FETCH_VALUE_OPTIONS.has(rest[index - 1] ?? ''));
  return operands[0] === 'origin' && operands.slice(1).every((spec) => MAIN_REFSPECS.has(spec));
}

/**
 * @param {Segment} segment
 * @returns {{ subcommand: string, rest: string[] } | null}
 */
function gitCall(segment) {
  const { argv } = splitCommand(withoutTimeout(segment.words));
  if (programName(argv[0] ?? '') !== 'git') return null;
  const { subcommand, rest } = gitSubcommand(argv.slice(1));
  return { subcommand, rest };
}

/**
 * `timeout [opties] <duur> cmd …` → `cmd …`: onder WSL is een fetch met timeout gangbaar, en zo ontloopt ook een
 * branchopdracht achter timeout de regel niet.
 * @param {readonly string[]} words
 */
function withoutTimeout(words) {
  if (programName(words[0] ?? '') !== 'timeout') return words;
  let index = 1;
  while ((words[index] ?? '').startsWith('-')) index += ['-s', '-k', '--signal', '--kill-after'].includes(words[index] ?? '') ? 2 : 1;
  return words.slice(index + 1);
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
