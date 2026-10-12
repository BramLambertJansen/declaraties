// Rolhek (framework §8, ADR 0011): beslist per toolgebruik of het mag (allow), de eigenaar moet kiezen (ask) of het
// verboden is (deny). Puur: alles wat van de schijf of git komt, zit in `ctx`, zodat test/hooks/rolhek.test.ts elke regel
// met echte payloads kan bewijzen. De stdin/stdout-kant staat in .claude/hooks/rolhek.mjs.
import path from 'node:path';
import { gitSubcommand, parseCommands, splitCommand, writeTargets } from './shell.mjs';

/**
 * @typedef {{ gates: string[], testpaden: string[], jsonGates: Record<string, string[]>, gegenereerd: string[],
 *   migraties: string[], schrijfrecht: Record<string, string[]>, mcpLezen: string[] }} Config
 * @typedef {{ root: string, cwd: string, config: Config, read: (rel: string) => string | null,
 *   committed: (rel: string) => boolean, isDir: (rel: string) => boolean, branch: string }} Ctx
 * @typedef {{ deny: string[], ask: string[], context: string[] }} Decision
 * @typedef {{ kind: 'write' | 'delete', after: string | null }} Change
 */

const SUBAGENT_ROLES = new Set(['architect', 'developer', 'tester', 'reviewer', 'docs']);

/**
 * Leest .claude/gates.json; een ontbrekende of verkeerde sleutel is een fout (de hook faalt dan dicht).
 * @param {string} text
 * @returns {Config}
 */
export function loadConfig(text) {
  /** @type {unknown} */
  const raw = JSON.parse(text);
  const value = (/** @type {string} */ key) =>
    typeof raw === 'object' && raw !== null ? Object.entries(raw).find(([name]) => name === key)?.[1] : undefined;
  const list = (/** @type {string} */ key) => {
    const found = value(key);
    if (!Array.isArray(found) || !found.every((item) => typeof item === 'string'))
      throw new Error(`.claude/gates.json: ${key} is geen lijst`);
    return found.map(String);
  };
  const record = (/** @type {string} */ key) => {
    const found = value(key);
    if (typeof found !== 'object' || found === null || Array.isArray(found))
      throw new Error(`.claude/gates.json: ${key} is geen object`);
    return Object.fromEntries(Object.entries(found).map(([name, items]) => [name, Array.isArray(items) ? items.map(String) : []]));
  };
  return {
    gates: list('gates'),
    testpaden: list('testpaden'),
    gegenereerd: list('gegenereerd'),
    migraties: list('migraties'),
    mcpLezen: list('mcpLezen'),
    jsonGates: record('jsonGates'),
    schrijfrecht: record('schrijfrecht'),
  };
}

/**
 * @param {unknown} payload
 * @param {Ctx} ctx
 * @returns {Decision}
 */
export function decide(payload, ctx) {
  /** @type {Decision} */
  const decision = { deny: [], ask: [], context: [] };
  const tool = field(payload, 'tool_name');
  const input = objectField(payload, 'tool_input');
  const role = roleOf(field(payload, 'agent_type'));
  if (tool.startsWith('mcp__')) decideMcp({ tool, role }, ctx, decision);
  else if (tool === 'Bash') decideBash({ command: field(input, 'command'), role }, ctx, decision);
  else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) decideEdit({ tool, input, role }, ctx, decision);
  return decision;
}

/**
 * Hoofdsessie zonder agent_type; een onbekende subagent telt als developer (strengste schrijfrol buiten de reviewer).
 * @param {string} agentType
 */
export function roleOf(agentType) {
  if (agentType === '') return 'hoofdsessie';
  return SUBAGENT_ROLES.has(agentType) ? agentType : 'developer';
}

/**
 * @param {unknown} value
 * @param {string} key
 */
function field(value, key) {
  if (typeof value !== 'object' || value === null || !(key in value)) return '';
  const found = Object.entries(value).find(([name]) => name === key)?.[1];
  return typeof found === 'string' ? found : '';
}

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {unknown}
 */
function objectField(value, key) {
  if (typeof value !== 'object' || value === null) return {};
  return Object.entries(value).find(([name]) => name === key)?.[1] ?? {};
}

/**
 * Een gate die de eigenaar mag doorlaten: voor de hoofdsessie `ask`, voor een subagent `deny`.
 * @param {Decision} decision
 * @param {string} role
 * @param {string} reason
 */
function gate(decision, role, reason) {
  if (role === 'hoofdsessie') decision.ask.push(reason);
  else decision.deny.push(reason);
}

/**
 * MCP-tools (WS-06): alleen exacte namen uit mcpLezen mogen door; anders vraagt de hoofdsessie de eigenaar en weigert een
 * subagent (ook een onbekende), want een connector kan buiten de repo schrijven (framework §10).
 * @param {{ tool: string, role: string }} call
 * @param {Ctx} ctx
 * @param {Decision} decision
 */
function decideMcp({ tool, role }, ctx, decision) {
  if (ctx.config.mcpLezen.includes(tool)) return;
  gate(decision, role, `${tool} staat niet in mcpLezen (.claude/gates.json): MCP alleen read-only (AGENTS.md)`);
}

// ---------- bestanden ----------

/**
 * @param {{ tool: string, input: unknown, role: string }} call
 * @param {Ctx} ctx
 * @param {Decision} decision
 */
function decideEdit({ tool, input, role }, ctx, decision) {
  const file = field(input, 'file_path') || field(input, 'notebook_path');
  const rel = relative(ctx, file);
  if (rel === null) return;
  const before = ctx.read(rel);
  const after = tool === 'NotebookEdit' ? null : simulate(tool, input, before);
  decideFile({ rel, change: { kind: 'write', after }, role }, ctx, decision);
}

/**
 * De inhoud na Edit/MultiEdit/Write; null als hij niet te bepalen is.
 * @param {string} tool
 * @param {unknown} input
 * @param {string | null} before
 * @returns {string | null}
 */
export function simulate(tool, input, before) {
  if (tool === 'Write') return field(input, 'content');
  if (before === null) return null;
  const edits = tool === 'MultiEdit' ? objectField(input, 'edits') : [input];
  if (!Array.isArray(edits)) return null;
  return edits.reduce((text, edit) => {
    const from = field(edit, 'old_string');
    const to = field(edit, 'new_string');
    const all = typeof edit === 'object' && edit !== null && 'replace_all' in edit && edit.replace_all === true;
    return all ? text.split(from).join(to) : text.replace(from, () => to);
  }, before);
}

/**
 * Pad relatief aan de repo (posix), of null als het erbuiten ligt.
 * @param {Ctx} ctx
 * @param {string} file
 */
export function relative(ctx, file) {
  if (file === '') return null;
  const rel = path.relative(ctx.root, path.resolve(ctx.cwd, file)).split(path.sep).join('/');
  return rel === '' || rel.startsWith('..') || path.isAbsolute(rel) ? null : rel;
}

/**
 * @param {{ rel: string, change: Change, role: string }} target
 * @param {Ctx} ctx
 * @param {Decision} decision
 */
function decideFile({ rel, change, role }, ctx, decision) {
  const { config } = ctx;
  const matches = (/** @type {readonly string[]} */ globs) => globs.some((glob) => globMatch(glob, rel));
  if (matches(config.gegenereerd)) {
    decision.deny.push(`${rel} is gegenereerd: draai het script dat hem maakt (pnpm db:generate, de router-plugin)`);
    return;
  }
  if (matches(config.migraties) && ctx.committed(rel)) {
    decision.deny.push(`${rel} is een gecommitte migratie: wijzig hem nooit, maak een nieuwe (AGENTS.md)`);
    return;
  }
  if (approvesSpec(rel, change, ctx)) {
    decision.deny.push(`${rel}: status goedgekeurd zet alleen de eigenaar (AGENTS.md)`);
    return;
  }
  if (matches(config.testpaden) && ctx.read(rel) !== null) existingTest({ rel, change, role }, ctx, decision);
  decideByRole({ rel, change, role }, ctx, decision);
}

/**
 * @param {string} rel
 * @param {Change} change
 * @param {Ctx} ctx
 */
function approvesSpec(rel, change, ctx) {
  if (!rel.startsWith('docs/specs/') || change.after === null) return false;
  const approved = /^status:\s*goedgekeurd\b/m;
  return approved.test(change.after) && !approved.test(ctx.read(rel) ?? '');
}

const SKIP = /\.(?:skip|todo|fixme)\s*\(|\b(?:xit|xtest|xdescribe)\s*\(|\bskip\s*\(/g;
const CASES = /\b(?:test|it)(?:\.each\b[^(]*\([^)]*\))?\s*\(/g;

/**
 * Bestaande test: verwijderen, skippen of gevallen weghalen vraagt akkoord van de eigenaar; wijzigen meldt het rolhek.
 * @param {{ rel: string, change: Change, role: string }} target
 * @param {Ctx} ctx
 * @param {Decision} decision
 */
function existingTest({ rel, change, role }, ctx, decision) {
  const before = ctx.read(rel) ?? '';
  const count = (/** @type {string} */ text, /** @type {RegExp} */ pattern) => (text.match(pattern) ?? []).length;
  if (change.kind === 'delete') {
    gate(decision, role, `${rel} is een bestaande test: verwijderen alleen met akkoord van de eigenaar (AGENTS.md)`);
  } else if (change.after !== null && count(change.after, SKIP) > count(before, SKIP)) {
    gate(decision, role, `${rel}: een test skippen alleen met akkoord van de eigenaar (AGENTS.md)`);
  } else if (change.after !== null && count(change.after, CASES) < count(before, CASES)) {
    gate(decision, role, `${rel}: testgevallen weghalen alleen met akkoord van de eigenaar (AGENTS.md)`);
  } else {
    decision.context.push(`${rel} is een bestaande test: noem de wijziging met reden in de PR (AGENTS.md, framework §8).`);
  }
}

/**
 * @param {{ rel: string, change: Change, role: string }} target
 * @param {Ctx} ctx
 * @param {Decision} decision
 */
function decideByRole({ rel, change, role }, ctx, decision) {
  const { config } = ctx;
  const allowed = config.schrijfrecht[role];
  if (role !== 'hoofdsessie' && role !== 'developer') {
    if (!(allowed ?? []).some((glob) => globMatch(glob, rel)))
      decision.deny.push(`rol ${role} mag ${rel} niet schrijven (schrijfrecht in .claude/gates.json)`);
    return;
  }
  const keys = config.jsonGates[rel];
  if (keys !== undefined) {
    if (jsonKeysChanged(keys, ctx.read(rel), change.after))
      gate(decision, role, `${rel}: ${keys.join(', ')} is een gate; wijzigen vraagt akkoord van de eigenaar`);
    return;
  }
  // Tests (toevoegen is vrij) en specs (de agent schrijft ze; goedgekeurd bewaakt de check) zijn geen gate voor schrijven.
  const free = config.testpaden.some((glob) => globMatch(glob, rel)) || rel.startsWith('docs/specs/');
  if (!free && config.gates.some((glob) => globMatch(glob, rel)))
    gate(decision, role, `${rel} is een beschermd pad (framework §10): wijzigen vraagt akkoord van de eigenaar`);
}

/**
 * Of een van de bewaakte sleutels verandert; onleesbaar of onbekend telt als verandering.
 * @param {readonly string[]} keys
 * @param {string | null} before
 * @param {string | null} after
 */
export function jsonKeysChanged(keys, before, after) {
  if (after === null) return true;
  const pick = (/** @type {string | null} */ text) => {
    try {
      /** @type {unknown} */
      const parsed = JSON.parse(text ?? '{}');
      if (typeof parsed !== 'object' || parsed === null) return null;
      return JSON.stringify(keys.map((key) => Object.entries(parsed).find(([name]) => name === key)?.[1] ?? null));
    } catch {
      return null;
    }
  };
  const old = pick(before);
  const next = pick(after);
  return old === null || next === null || old !== next;
}

/**
 * Glob met `*` (binnen één map), `**` (over mappen) en `?`.
 * @param {string} glob
 * @param {string} rel
 */
export function globMatch(glob, rel) {
  let pattern = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index] ?? '';
    if (glob.startsWith('**/', index)) {
      pattern += '(?:.*/)?';
      index += 2;
    } else if (glob.startsWith('**', index)) {
      pattern += '.*';
      index += 1;
    } else if (char === '*') pattern += '[^/]*';
    else if (char === '?') pattern += '[^/]';
    else pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`).test(rel);
}

// ---------- Bash ----------

/**
 * @param {{ command: string, role: string }} call
 * @param {Ctx} ctx
 * @param {Decision} decision
 */
function decideBash({ command, role }, ctx, decision) {
  for (const parsed of parseCommands(command)) {
    const { assignments, argv } = splitCommand(parsed.words);
    forbidden({ assignments, argv }, { role, ctx }, decision);
    if (role === 'reviewer' && !reviewerMay(argv, parsed.redirects))
      decision.deny.push(`reviewer: alleen lezen (\`${argv.slice(0, 3).join(' ')}\` mag niet; framework §8)`);
    const targets = writeTargets(parsed);
    for (const target of targets.writes) bashTarget({ file: target, kind: 'write', role }, ctx, decision);
    for (const target of targets.deletes) bashTarget({ file: target, kind: 'delete', role }, ctx, decision);
  }
}

/**
 * @param {{ file: string, kind: 'write' | 'delete', role: string }} target
 * @param {Ctx} ctx
 * @param {Decision} decision
 */
function bashTarget({ file, kind, role }, ctx, decision) {
  const rel = relative(ctx, file);
  if (rel === null) return;
  // Naar een bestaande map (cp x src/core/): beslis voor een nieuw bestand daarin.
  const target = kind === 'write' && ctx.isDir(rel) ? `${rel}/nieuw-bestand` : rel;
  decideFile({ rel: target, change: { kind, after: null }, role }, ctx, decision);
}

const REVIEWER_COMMANDS = [
  /^pnpm (?:check:\S+|test\S*|gate:\S+)$/,
  /^git (?:diff|log|show|status)$/,
  /^gh pr (?:view|diff|checks)$/,
];

/**
 * @param {readonly string[]} argv
 * @param {readonly string[]} redirects
 */
function reviewerMay(argv, redirects) {
  if (redirects.length > 0) return false;
  const head = argv[0] === 'gh' ? argv.slice(0, 3).join(' ') : argv.slice(0, 2).join(' ');
  return REVIEWER_COMMANDS.some((pattern) => pattern.test(head));
}

/**
 * De generator via het script of rechtstreeks met node.
 * @param {string} program
 * @param {readonly string[]} args
 */
function isNewResource(program, args) {
  if (program === 'pnpm') return args[0] === 'new:resource' || (args[0] === 'run' && args[1] === 'new:resource');
  return program === 'node' && args.some((arg) => /(?:^|\/)scripts\/kit\/new-resource\.mjs$/.test(arg));
}

/**
 * Wat voor elke rol verboden is (zelfreview, hooks overslaan, push naar main), plus wat alleen een subagent niet mag.
 * @param {{ assignments: string[], argv: string[] }} command
 * @param {{ role: string, ctx: Ctx }} who
 * @param {Decision} decision
 */
function forbidden({ assignments, argv }, { role, ctx }, decision) {
  const [program = '', ...args] = argv;
  const lefthook = [...assignments, ...(program === 'export' ? args : [])].find((word) => /^LEFTHOOK(?:_\w+)?=/.test(word));
  if (lefthook !== undefined) decision.deny.push(`${lefthook}: git-hooks overslaan is verboden (AGENTS.md)`);
  if (program === 'git') decision.deny.push(...gitForbidden(args, { role, branch: ctx.branch }));
  if (program === 'gh') decision.deny.push(...ghForbidden(args, role));
  if (role !== 'hoofdsessie' && isNewResource(program, args))
    decision.deny.push('pnpm new:resource: alleen de hoofdsessie (ADR 0016, OV-4); wat hij schrijft, ziet het rolhek niet');
}

/**
 * @param {readonly string[]} args
 * @param {{ role: string, branch: string }} who
 * @returns {string[]}
 */
export function gitForbidden(args, { role, branch }) {
  const { subcommand, rest, config } = gitSubcommand(args);
  /** @type {string[]} */
  const found = [];
  if (config.some((setting) => /^core\.hookspath/i.test(setting))) found.push('git -c core.hooksPath: hooks omleiden is verboden');
  if (args.includes('--no-verify')) found.push('--no-verify is verboden (AGENTS.md)');
  if (subcommand === 'commit' && commitSkipsHooks(rest)) found.push('git commit -n slaat de hooks over: verboden');
  if (subcommand === 'config' && setsHooksPath(rest)) found.push('core.hooksPath zetten is verboden');
  if (subcommand === 'push' && pushesMain(rest, branch)) found.push('push naar main is verboden; open een PR');
  if (role === 'hoofdsessie') return found;
  if (subcommand === 'push' || subcommand === 'merge' || subcommand === 'rebase')
    found.push(`subagent: git ${subcommand} doet de hoofdsessie`);
  if (subcommand === 'reset' && rest.includes('--hard')) found.push('subagent: git reset --hard is verboden');
  return found;
}

const COMMIT_VALUE_FLAGS = new Set(['m', 'F', 'C', 'c', 't', 'S']);

/**
 * `-n` in een cluster (`-an`, `-nm x`), niet in de waarde van `-m`.
 * @param {readonly string[]} rest
 */
function commitSkipsHooks(rest) {
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index] ?? '';
    if (arg === '--') return false;
    if (/^-[^-]/.test(arg)) {
      const flags = clusterFlags(arg.slice(1));
      if (flags.hooks) return true;
      if (flags.takesNext) index += 1;
    } else if (['--message', '--file', '--author', '--date', '--template', '--reuse-message'].includes(arg)) index += 1;
  }
  return false;
}

/**
 * @param {string} cluster
 * @returns {{ hooks: boolean, takesNext: boolean }}
 */
function clusterFlags(cluster) {
  for (let index = 0; index < cluster.length; index += 1) {
    const flag = cluster[index] ?? '';
    if (flag === 'n') return { hooks: true, takesNext: false };
    if (COMMIT_VALUE_FLAGS.has(flag)) return { hooks: false, takesNext: index === cluster.length - 1 };
  }
  return { hooks: false, takesNext: false };
}

/** @param {readonly string[]} rest */
function setsHooksPath(rest) {
  const reading = rest.some((arg) => ['--get', '--get-all', '--list', '-l', '--get-regexp'].includes(arg));
  return !reading && rest.some((arg) => /^core\.hookspath$/i.test(arg));
}

/**
 * @param {readonly string[]} rest
 * @param {string} branch
 */
function pushesMain(rest, branch) {
  if (rest.includes('--mirror') || rest.includes('--all')) return true;
  const operands = rest.filter((arg) => !arg.startsWith('-'));
  const refspecs = operands.slice(1);
  if (refspecs.length === 0) return branch === 'main';
  return refspecs.some((spec) => /(?:^|:)\+?(?:refs\/heads\/)?main$/.test(spec) || (spec === 'HEAD' && branch === 'main'));
}

const SELF_REVIEW_API = /\/(?:labels|reviews|statuses|check-runs|check-suites)\b|\/requested_reviewers\b/;

/**
 * @param {readonly string[]} args
 * @param {string} role
 * @returns {string[]}
 */
export function ghForbidden(args, role) {
  const [group = '', action = ''] = args;
  /** @type {string[]} */
  const found = [];
  if (group === 'pr' && action === 'review') found.push('gh pr review: de agent keurt nooit zelf goed (AGENTS.md)');
  if (args.some((arg, index) => arg.includes('gate-wijziging') && /label/.test(`${args[index - 1] ?? ''}${arg}`)))
    found.push('het label gate-wijziging zet alleen de eigenaar (AGENTS.md)');
  if (group === 'api' && apiWritesSelfReview(args.slice(1))) found.push('gh api: labels, reviews en statussen zet alleen de eigenaar');
  if (role !== 'hoofdsessie' && group === 'pr' && action === 'merge') found.push('subagent: mergen is verboden');
  return found;
}

/** @param {readonly string[]} args */
function apiWritesSelfReview(args) {
  const endpoint = apiEndpoint(args);
  const method = args.findIndex((arg) => arg === '-X' || arg === '--method');
  const writes =
    (method !== -1 && (args[method + 1] ?? 'GET').toUpperCase() !== 'GET') ||
    args.some((arg) => ['-f', '-F', '--field', '--raw-field', '--input'].includes(arg) || /^--?(?:f|F|field|raw-field)=/.test(arg));
  if (endpoint === 'graphql') return args.some((arg) => /mutation[\s\S]*(?:Review|Label|Status|CheckRun)/i.test(arg));
  return writes && SELF_REVIEW_API.test(endpoint);
}

const API_OPTIONS_WITH_VALUE = new Set(['-X', '--method', '-H', '--header', '-f', '-F', '--field', '--raw-field', '--input', '-q', '--jq', '-t', '--template', '--hostname', '--cache', '-p', '--preview']);

/**
 * Het eerste argument dat geen optie of optiewaarde is (`gh api -X POST <endpoint>`).
 * @param {readonly string[]} args
 */
function apiEndpoint(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (API_OPTIONS_WITH_VALUE.has(arg)) index += 1;
    else if (!arg.startsWith('-')) return arg;
  }
  return '';
}
