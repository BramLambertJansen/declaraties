// Kleine shell-lezer voor het rolhek (framework §8, ADR 0011): splitst een Bash-commando in losse commando's (`;`, `&&`, `||`,
// `|`, `&`, regeleinde), haalt aanhalingstekens weg, slaat heredoc-teksten over en verzamelt redirect-doelen. Bewust geen
// volledige shell: wat tekstheuristiek niet vangt (`bash -c`, `node -e`, `$(…)`), vangt de diff-guard in CI.

/** @typedef {{ words: string[], redirects: string[] }} Command */
/** @typedef {{ kind: 'word' | 'op', value: string }} Token */

const SEPARATORS = new Set([';', '&&', '||', '|', '&', '|&', '\n', '(', ')']);
const OPERATORS = ['&>>', '>>', '>|', '&>', '>&', '<<-', '<<<', '<<', '<&', '&&', '||', '|&', '<', '>', ';', '|', '&', '(', ')', '\n'];

/**
 * @param {string} script
 * @returns {Command[]}
 */
export function parseCommands(script) {
  /** @type {Command[]} */
  const commands = [];
  /** @type {Command} */
  let current = { words: [], redirects: [] };
  /** @type {'redirect' | 'skip' | null} */
  let expect = null;
  for (const token of tokenize(script)) {
    if (token.kind === 'op' && SEPARATORS.has(token.value)) {
      if (current.words.length > 0 || current.redirects.length > 0) commands.push(current);
      current = { words: [], redirects: [] };
      expect = null;
    } else if (token.kind === 'op') {
      // `<`, `<<<`, `<<` en kopieën van een descriptor (`>&2`, `2>&1`) schrijven geen bestand.
      expect = token.value.startsWith('<') || token.value.endsWith('&') ? 'skip' : 'redirect';
    } else {
      if (expect === 'redirect') current.redirects.push(token.value);
      else if (expect === null) current.words.push(token.value);
      expect = null;
    }
  }
  if (current.words.length > 0 || current.redirects.length > 0) commands.push(current);
  return commands;
}

/**
 * @param {string} script
 * @returns {Token[]}
 */
export function tokenize(script) {
  /** @type {Token[]} */
  const tokens = [];
  /** @type {{ delimiter: string, strip: boolean }[]} */
  const heredocs = [];
  let index = 0;
  while (index < script.length) {
    const char = script[index] ?? '';
    if (char === ' ' || char === '\t') {
      index += 1;
    } else if (char === '#' && (index === 0 || /\s/.test(script[index - 1] ?? ''))) {
      while (index < script.length && script[index] !== '\n') index += 1;
    } else {
      index = nextToken(script, index, { tokens, heredocs });
    }
  }
  return tokens;
}

/**
 * Leest het token op `index`, voegt het toe en geeft de positie erna. Na een regeleinde slaat hij openstaande heredocs over.
 * @param {string} script
 * @param {number} index
 * @param {{ tokens: Token[], heredocs: { delimiter: string, strip: boolean }[] }} state
 */
function nextToken(script, index, { tokens, heredocs }) {
  const descriptor = /^\d+(?=[<>])/.exec(script.slice(index))?.[0] ?? '';
  const op = OPERATORS.find((candidate) => script.startsWith(candidate, index + descriptor.length));
  if (op === undefined) {
    const word = readWord(script, index);
    const previous = tokens.at(-1);
    if (previous?.kind === 'op' && (previous.value === '<<' || previous.value === '<<-'))
      heredocs.push({ delimiter: word.value, strip: previous.value === '<<-' });
    tokens.push({ kind: 'word', value: word.value });
    return word.end;
  }
  tokens.push({ kind: 'op', value: op });
  const end = index + descriptor.length + op.length;
  return op === '\n' && heredocs.length > 0 ? skipHeredocBodies(script, end, heredocs.splice(0)) : end;
}

/**
 * Slaat de tekst van de heredocs over die op de vorige regel begonnen; geeft de positie na de laatste sluitregel.
 * @param {string} script
 * @param {number} from
 * @param {{ delimiter: string, strip: boolean }[]} heredocs
 */
function skipHeredocBodies(script, from, heredocs) {
  let index = from;
  for (const { delimiter, strip } of heredocs) {
    while (index < script.length) {
      const end = script.indexOf('\n', index);
      const line = script.slice(index, end === -1 ? script.length : end);
      index = end === -1 ? script.length : end + 1;
      if ((strip ? line.replace(/^\t+/, '') : line) === delimiter) break;
    }
  }
  return index;
}

/**
 * Leest één woord; haalt aanhalingstekens en escapes weg. `$(…)` blijft letterlijk in het woord.
 * @param {string} script
 * @param {number} start
 */
function readWord(script, start) {
  let value = '';
  let index = start;
  while (index < script.length) {
    const char = script[index] ?? '';
    if (/[\s;&|<>()]/.test(char)) break;
    const part = wordPart(script, index, char);
    value += part.text;
    index = part.end;
  }
  return { value, end: index };
}

/**
 * @param {string} script
 * @param {number} index
 * @param {string} char
 * @returns {{ text: string, end: number }}
 */
function wordPart(script, index, char) {
  if (char === '\\') return { text: script[index + 1] ?? '', end: index + 2 };
  if (char === "'" || char === '"') {
    const close = findClose(script, index + 1, char);
    const inner = script.slice(index + 1, close);
    return { text: char === '"' ? inner.replace(/\\(["\\$`])/g, '$1') : inner, end: close + 1 };
  }
  if (char === '$' && script[index + 1] === '(') {
    const close = findParen(script, index + 2);
    return { text: script.slice(index, close + 1), end: close + 1 };
  }
  return { text: char, end: index + 1 };
}

/**
 * @param {string} script
 * @param {number} from
 * @param {string} quote
 */
function findClose(script, from, quote) {
  let index = from;
  while (index < script.length && script[index] !== quote) index += quote === '"' && script[index] === '\\' ? 2 : 1;
  return index;
}

/**
 * @param {string} script
 * @param {number} from
 */
function findParen(script, from) {
  let depth = 1;
  for (let index = from; index < script.length; index += 1) {
    if (script[index] === '(') depth += 1;
    if (script[index] === ')') depth -= 1;
    if (depth === 0) return index;
  }
  return script.length;
}

/** Omhulsels die een ander commando starten; het rolhek kijkt naar dat commando. */
const WRAPPERS = new Set(['sudo', 'env', 'command', 'time', 'nohup', 'exec', 'nice']);

/**
 * De woorden van het eigenlijke commando: zonder voorafgaande variabelen (`A=1 cmd`) en omhulsels (`env`, `sudo`).
 * @param {readonly string[]} words
 * @returns {{ assignments: string[], argv: string[] }}
 */
export function splitCommand(words) {
  let index = 0;
  /** @type {string[]} */
  const assignments = [];
  while (index < words.length) {
    const word = words[index] ?? '';
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) assignments.push(word);
    else if (!WRAPPERS.has(word)) break;
    index += 1;
  }
  return { assignments, argv: words.slice(index) };
}

/** @typedef {{ writes: string[], deletes: string[] }} Targets */

/**
 * Bestanden die een commando schrijft of verwijdert (redirect, tee, sed -i, perl -i, cp, mv, rm, touch, truncate, dd,
 * git checkout/restore/rm/mv). Paden zoals geschreven; het rolhek maakt ze relatief aan de repo.
 * @param {Command} command
 * @returns {Targets}
 */
export function writeTargets(command) {
  const { argv } = splitCommand(command.words);
  const [program = '', ...args] = argv;
  const targets = fileTargets(program, args);
  return { writes: [...command.redirects, ...targets.writes], deletes: targets.deletes };
}

/**
 * @param {string} program
 * @param {string[]} args
 * @returns {Targets}
 */
function fileTargets(program, args) {
  const operands = args.filter((arg) => !arg.startsWith('-'));
  switch (program) {
    case 'tee':
    case 'touch':
    case 'truncate':
      return { writes: operands, deletes: [] };
    case 'rm':
    case 'unlink':
    case 'rmdir':
      return { writes: [], deletes: operands };
    case 'cp':
    case 'install':
      return { writes: operands.slice(-1), deletes: [] };
    case 'mv':
      return { writes: operands.slice(-1), deletes: operands.slice(0, -1) };
    case 'dd':
      return { writes: args.filter((arg) => arg.startsWith('of=')).map((arg) => arg.slice(3)), deletes: [] };
    case 'sed':
    case 'perl':
      return { writes: inPlaceFiles(program, args), deletes: [] };
    case 'git':
      return gitTargets(args);
    default:
      return { writes: [], deletes: [] };
  }
}

/**
 * `sed -i`/`perl -pi`: de bestanden na het script (of na `-e`/`-f`).
 * @param {string} program
 * @param {string[]} args
 */
function inPlaceFiles(program, args) {
  const inPlace = args.some((arg) => (program === 'sed' && arg === '--in-place') || /^-[a-zA-Z]*i/.test(arg));
  if (!inPlace) return [];
  /** @type {string[]} */
  const operands = [];
  let scriptGiven = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (arg === '-e' || arg === '-f' || arg === '--expression' || arg === '--file') {
      scriptGiven = true;
      index += 1;
    } else if (!arg.startsWith('-')) operands.push(arg);
  }
  return scriptGiven ? operands : operands.slice(1);
}

/**
 * @param {string[]} args
 * @returns {Targets}
 */
function gitTargets(args) {
  const { subcommand, rest } = gitSubcommand(args);
  const operands = rest.filter((arg) => !arg.startsWith('-'));
  switch (subcommand) {
    case 'checkout': {
      const dashdash = rest.indexOf('--');
      return { writes: dashdash === -1 ? [] : rest.slice(dashdash + 1), deletes: [] };
    }
    case 'restore':
      return { writes: withoutSource(rest), deletes: [] };
    case 'rm':
      return { writes: [], deletes: operands };
    case 'mv':
      return { writes: operands.slice(-1), deletes: operands.slice(0, -1) };
    default:
      return { writes: [], deletes: [] };
  }
}

/**
 * `git restore -s <tree> a b` → `a`, `b`.
 * @param {string[]} rest
 */
function withoutSource(rest) {
  return rest.filter((arg, index) => !arg.startsWith('-') && rest[index - 1] !== '-s' && rest[index - 1] !== '--source');
}

const GIT_OPTIONS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);

/**
 * `git -C x -c a=b commit …` → subcommand `commit`, met de globale `-c`-instellingen apart.
 * @param {readonly string[]} args
 */
export function gitSubcommand(args) {
  /** @type {string[]} */
  const config = [];
  let index = 0;
  while (index < args.length) {
    const arg = args[index] ?? '';
    if (!arg.startsWith('-')) break;
    if (arg === '-c') config.push(args[index + 1] ?? '');
    else if (arg.startsWith('-c') || arg.startsWith('--config-env')) config.push(arg.replace(/^-c|^--config-env=?/, ''));
    index += GIT_OPTIONS_WITH_VALUE.has(arg) ? 2 : 1;
  }
  return { subcommand: args[index] ?? '', rest: args.slice(index + 1), config };
}
