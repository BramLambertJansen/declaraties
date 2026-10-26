// Rolhek (framework §8, ADR 0045): beslist per toolgebruik of het mag (allow), de eigenaar moet kiezen (ask) of het
// verboden is (deny). Puur: alles wat van de schijf of git komt, zit in `ctx`, zodat test/hooks/rolhek.test.ts elke regel
// met echte payloads kan bewijzen. De stdin/stdout-kant staat in rails/hooks/rolhek.mjs.
import path from 'node:path';
import { gitSubcommand, parseCommands, programName, splitCommand, writeTargets } from './shell.mjs';
import { A4_MELDING, beslisOvergang, documentInfo, documentKind, isHerschrijving } from './document-state.mjs';
import { canRecordStatus, canWriteProtected, TEMPLATE_REPOSITORY } from './task-authority.mjs';
import { automaticRunner } from './runner-authority.mjs';
import { isCoreUiSource, testChangeRisk } from './functional-ui.mjs';

/**
 * @typedef {{ gates: string[], testpaden: string[], jsonGates: Record<string, string[]>, gegenereerd: string[],
 *   migraties: string[], schrijfrecht: Record<string, string[]>, mcpLezen: string[], voorReview?: string[] | undefined,
 *   altijdVragen?: string[] | undefined, onderhoud?: { repository: string } | undefined }} Config
 * `voorReview` ontbreekt → elke gate telt als voorReview (faalt dicht). `altijdVragen` ontbreekt → in onderhoud blijft elk
 * voorReview-pad een gate (faalt dicht). `onderhoud`: de repository waarin de onderhoudsmodus geldt (ADR 0045 punt 8).
 * @typedef {{ root: string, cwd: string, config: Config, read: (rel: string) => string | null,
 *   committed: (rel: string) => boolean | 'zonder-origin', isDir: (rel: string) => boolean, branch: string,
 *   authority?: import('./task-authority.mjs').Authority | null, runnerTrusted?: boolean | (() => boolean),
 *   onbekendeRol?: boolean, onderhoud?: boolean }} Ctx
 * `onderhoud`: de onderhoudsmodus is actief (vertrouwde configuratie en origin is die repository, ADR 0045 punt 8–9).
 * `onbekendeRol`: een subagent zonder bekende rol; telt als developer, maar zonder de melding buiten voorReview.
 * `committed`: staat in de merge-base met het anker of met origin/main; 'zonder-origin' = beide onleesbaar en wel in HEAD (terugval).
 * @typedef {{ deny: string[], ask: string[], context: string[], allow?: boolean }} Decision
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
  const optionalList = (/** @type {string} */ key) => (value(key) === undefined ? undefined : list(key));
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
    voorReview: optionalList('voorReview'),
    altijdVragen: optionalList('altijdVragen'),
    onderhoud: onderhoudVan(value('onderhoud')),
  };
}

/** `{ "repository": "<owner>/<repo>" }` of ontbrekend; elke andere vorm gooit. @param {unknown} found */
export function onderhoudVan(found) {
  if (found === undefined) return undefined;
  const entries = typeof found === 'object' && found !== null && !Array.isArray(found) ? Object.entries(found) : [];
  const repository = entries.length === 1 && entries[0]?.[0] === 'repository' ? entries[0][1] : undefined;
  if (typeof repository !== 'string' || !/^[\w-]+\/[\w.-]+$/.test(repository))
    throw new Error('.claude/gates.json: onderhoud is geen { "repository": "<owner>/<repo>" }');
  return { repository };
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
  // Een onbekende subagent houdt de bestaande developerbeperkingen, maar krijgt nooit een taakmandaat.
  const namedRole = field(payload, 'agent_type');
  const context = ['', 'developer', 'architect'].includes(namedRole)
    ? ctx
    : { ...ctx, authority: null, onbekendeRol: !SUBAGENT_ROLES.has(namedRole) };
  if (tool.startsWith('mcp__')) decideMcp({ tool, role }, context, decision);
  else if (tool === 'Bash') {
    const command = field(input, 'command');
    decideBash({ command, role }, context, decision);
    if (command.includes('--sta-wijzigingen-toe')) decision.deny.push('De agent omzeilt de hostcontrole van de runner nooit; gebruik voor gewijzigd railwerk de CI-runner');
    if (ctx.cwd === ctx.root && automaticRunner(command) && decision.ask.length + decision.deny.length === 0 && runnerIsTrusted(ctx))
      decision.allow = true;
  }
  else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    decideEdit({ tool, input, role }, context, decision);
    if (decision.context.some((reason) => reason.startsWith('Taakmandaat:')) && decision.ask.length + decision.deny.length === 0)
      decision.allow = true;
  }
  return decision;
}

/**
 * Alleen `true` telt als vertrouwd (fail-closed); een functie wordt pas hier uitgevoerd (de aanroeper memoïseert).
 * @param {{ runnerTrusted?: boolean | (() => boolean) }} ctx
 */
function runnerIsTrusted(ctx) {
  const value = typeof ctx.runnerTrusted === 'function' ? ctx.runnerTrusted() : ctx.runnerTrusted;
  return value === true;
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
  if (inGitMap(file)) {
    decision.deny.push(gitMapMelding(file));
    return;
  }
  ctx = scopedContext(ctx, file);
  const rel = relative(ctx, file);
  if (rel === null) return;
  const before = ctx.read(rel);
  const after = tool === 'NotebookEdit' ? null : simulate(tool, input, before);
  decideFile({ rel, change: { kind: 'write', after }, role }, ctx, decision);
}

/** Een weggewerkte parentcomponent kan via een symlink naar een ander fysiek bestand wijzen.
 * @param {Ctx} ctx @param {string} file */
function scopedContext(ctx, file) {
  const parent = /(?:^|[\\/])\.\.(?:[\\/]|$)/;
  return parent.test(file) || parent.test(ctx.cwd) ? { ...ctx, authority: null } : ctx;
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
  const committed = matches(config.migraties) ? ctx.committed(rel) : false;
  if (committed !== false) {
    const hint = committed === 'zonder-origin' ? ' (origin/main onleesbaar, daarom vergeleken met HEAD: draai git fetch origin)' : '';
    decision.deny.push(`${rel} is een gecommitte migratie: wijzig hem nooit, maak een nieuwe (AGENTS.md)${hint}`);
    return;
  }
  // A4 en de overgang vergelijken met main (de vertrouwde basis); alleen zonder authority is de werkmap de terugval.
  const basis = ctx.authority == null ? ctx.read(rel) : ctx.authority.trusted(rel);
  const overgang = change.after === null || documentKind(rel) === null ? null : beslisOvergang(rel, basis, change.after);
  const beslisrol = ['hoofdsessie', 'architect'].includes(role);
  // A4 (ADR 0046 punt 2): alleen architect en hoofdsessie herschrijven een geaccepteerd ADR of verwijderen een ADR met een
  // eigenaarstatus; of dat in een besluit-PR gebeurt, met een herzieningsregel, controleert de guard in CI.
  const a4Toegestaan = beslisrol && (isHerschrijving(rel, basis, change.after) || adrMetEigenaarstatusWeg(rel, basis, change));
  if (!a4Toegestaan && (['a4', 'herzien'].includes(overgang?.uitslag ?? '') || adrMetEigenaarstatusWeg(rel, basis, change))) {
    decision.deny.push(`${rel}: ${A4_MELDING}`);
    return;
  }
  // ADR 0046 punt 6: architect en hoofdsessie schrijven de eigenaarstatus in het voorstel; de merge van de eigenaar beslist.
  const eigenaarstatus = beslisrol && (a4Toegestaan || ['besluit', 'vrij'].includes(overgang?.uitslag ?? ''));
  if (!eigenaarstatus && statusZonderBesluit({ rel, change, role }, ctx, decision)) return;
  if (matches(config.testpaden) && ctx.read(rel) !== null) existingTest({ rel, change, role }, ctx, decision);
  decideByRole({ rel, change, role }, ctx, decision);
}

/**
 * Een ADR dat met een eigenaarstatus (niet `voorgesteld`) in de basis staat, wordt verwijderd.
 * @param {string} rel @param {string | null} basis @param {Change} change
 */
function adrMetEigenaarstatusWeg(rel, basis, change) {
  if (change.kind !== 'delete' || documentKind(rel) !== 'adr' || basis === null) return false;
  const status = documentInfo(rel, basis)?.status;
  return status !== undefined && status !== 'voorgesteld';
}

/**
 * Voor een rol die geen eigenaarstatus schrijft: alleen met een record op main, en `goedgekeurd` nooit zelf (ADR 0046 punt 6).
 * @param {{ rel: string, change: Change, role: string }} target @param {Ctx} ctx @param {Decision} decision
 * @returns {boolean} true als de beslissing vaststaat
 */
function statusZonderBesluit({ rel, change, role }, ctx, decision) {
  if (recordedStatus({ rel, change, role }, ctx, decision)) return true;
  const nextDocument = documentInfo(rel, change.after ?? '');
  if (ctx.authority != null && nextDocument !== null && !['voorstel', 'voorgesteld'].includes(nextDocument.status) &&
    !canRecordStatus({ file: rel, text: change.after ?? '' }, ctx.authority)) {
    decision.deny.push(`${rel}: een eigenaarstatus of de inhoud van een goedgekeurde spec schrijven alleen architect en hoofdsessie (ADR 0046 punt 6); gebouwd via pnpm docs:status`);
    return true;
  }
  if (!['hoofdsessie', 'architect'].includes(role) && approvesSpec(rel, change, ctx)) {
    decision.deny.push(`${rel}: status goedgekeurd schrijven alleen architect en hoofdsessie (ADR 0046 punt 6)`);
    return true;
  }
  return false;
}

/**
 * Een statuswijziging mag alleen de statusregel aanpassen en een bestaand besluit administreren.
 * @param {{ rel: string, change: Change, role: string }} target
 * @param {Ctx} ctx
 * @param {Decision} decision
 */
function recordedStatus({ rel, change, role }, ctx, decision) {
  if (ctx.authority == null || change.kind !== 'write' || change.after === null) return false;
  const before = ctx.read(rel);
  const old = documentInfo(rel, before ?? '');
  const next = documentInfo(rel, change.after);
  if (old === null || next === null || before === change.after || old.digest !== next.digest) return false;
  if (!['hoofdsessie', 'developer', 'architect'].includes(role) || !canRecordStatus({ file: rel, text: change.after }, ctx.authority)) {
    decision.deny.push(`${rel}: deze statusovergang heeft geen geldig besluit uit de vertrouwde basis; gebouwd via pnpm docs:status`);
  } else decision.context.push(`Taakmandaat: ${rel}: status administratief vastgelegd op basis van het besluit uit main`);
  return true;
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


// Testbestanden in testpaden; de rest daar is een hulpbestand (harness, fixture, setup, e2e/support).
const TEST_FILES = ['**/*.test.*', '**/*.spec.*', 'db/tests/**'];
// Fixtures bewijzen dat een check faalt en de setup draait vóór elke test: wijzigen is een gate (WS-02), ook voor een
// bestand daaronder dat als testbestand heet.
const LOCKED_HELPERS = ['test/rails/fixtures/**', 'test/setup/**'];

/**
 * Bestaande test of hulpbestand: verwijderen, skippen of gevallen weghalen vraagt akkoord van de eigenaar, net als een
 * fixture of setup wijzigen; een andere wijziging meldt het rolhek.
 * @param {{ rel: string, change: Change, role: string }} target
 * @param {Ctx} ctx
 * @param {Decision} decision
 */
function existingTest({ rel, change, role }, ctx, decision) {
  const before = ctx.read(rel) ?? '';
  const risk = change.after === null ? null : testChangeRisk(before, change.after);
  const helper = !TEST_FILES.some((glob) => globMatch(glob, rel));
  // Vóór de indeling als testbestand: ook een fixture die `*.test.*` heet, blijft vergrendeld (WS-02 follow-up).
  if (LOCKED_HELPERS.some((glob) => globMatch(glob, rel))) {
    gate(decision, role, `${rel} is een fixture of setup: wijzigen of verwijderen alleen met akkoord van de eigenaar (WS-02)`);
  } else if (change.kind === 'delete') {
    gate(decision, role, `${rel} is een bestaande test: verwijderen alleen met akkoord van de eigenaar (AGENTS.md)`);
  } else if (risk === 'skip') {
    gate(decision, role, `${rel}: een test skippen alleen met akkoord van de eigenaar (AGENTS.md)`);
  } else if (risk === 'removed') {
    gate(decision, role, `${rel}: testgevallen weghalen alleen met akkoord van de eigenaar (AGENTS.md)`);
  } else if (helper) {
    decision.context.push(`${rel}: hulpbestand gewijzigd: noem het met reden in de PR (AGENTS.md, framework §8).`);
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
  if (!free && ctx.authority != null && canWriteProtected({ file: rel, role }, ctx.authority)) {
    decision.context.push(`Taakmandaat: ${rel}: exact bestand toegestaan door de goedgekeurde taak uit main`);
    return;
  }
  if (free || !config.gates.some((glob) => globMatch(glob, rel))) return;
  // ADR 0046 punt 28: buiten voorReview geen prompt, wel een melding; de eigenaar reviewt het in de PR.
  const voorReview = config.voorReview ?? config.gates;
  const melding = ctx.onbekendeRol !== true && (!voorReview.some((glob) => globMatch(glob, rel)) || inOnderhoud(rel, ctx));
  if (melding && isCoreUiSource(rel) && ctx.authority?.repository === TEMPLATE_REPOSITORY)
    decision.context.push(`${rel}: functionele UI (ADR 0056): geen voorafgaand broncodemandaat; toepasselijke mini-spec en scope worden in CI en door de eigenaar beoordeeld; beperkte fixes vragen geen nieuwe mini-spec (ADR 0058)`);
  else if (melding && ctx.onderhoud === true && voorReview.some((glob) => globMatch(glob, rel)))
    decision.context.push(`${rel} is een beschermd pad (framework §10, onderhoudsmodus ADR 0045): noem het in de PR (eigenaarreview)`);
  else if (melding)
    decision.context.push(`${rel} is een beschermd pad (framework §10): noem het in de PR (eigenaarreview, ADR 0046 punt 28)`);
  else gate(decision, role, `${rel} is een beschermd pad (framework §10): wijzigen vraagt akkoord van de eigenaar`);
}

/**
 * In onderhoud (ADR 0045 punt 9) is een voorReview-pad een melding, behalve `altijdVragen`; ontbreekt die lijst, dan geen melding.
 * @param {string} rel @param {Ctx} ctx
 */
function inOnderhoud(rel, ctx) {
  const altijd = ctx.config.altijdVragen;
  return ctx.onderhoud === true && altijd !== undefined && !altijd.some((glob) => globMatch(glob, rel));
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
 * Remote-URL, refs en objecten zijn de vertrouwensbasis van anker en onderhoudsmodus (ADR 0045): nooit schrijven in een `.git`-map,
 * met Edit/Write of met Bash. @param {string} file
 */
function inGitMap(file) {
  return /(?:^|[\\/])\.git(?:[\\/]|$)/i.test(file);
}

/** @param {string} file */
function gitMapMelding(file) {
  return `${file}: schrijven in .git is verboden voor elke rol (ADR 0045)`;
}


/**
 * @param {{ command: string, role: string }} call
 * @param {Ctx} ctx
 * @param {Decision} decision
 */
function decideBash({ command, role }, ctx, decision) {
  for (const parsed of parseCommands(command)) {
    const { assignments, argv, pathWrappers } = splitCommand(parsed.words);
    forbidden({ assignments, argv }, { role, ctx }, decision);
    if (role === 'reviewer' && (pathWrappers.length > 0 || !reviewerMay(argv, parsed.redirects)))
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
  if (inGitMap(file)) {
    decision.deny.push(gitMapMelding(file));
    return;
  }
  ctx = scopedContext(ctx, file);
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
  // De feiten voor stap 1 van .claude/agents/reviewer.md (gates, specs, fase); scripts/kit/feiten.mjs schrijft niets.
  /^node scripts\/kit\/feiten\.mjs$/,
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
  const [word = '', ...args] = argv;
  const program = programName(word);
  const lefthook = [...assignments, ...(program === 'export' ? args : [])].find((word) => /^LEFTHOOK(?:_\w+)?=/.test(word));
  if (lefthook !== undefined) decision.deny.push(`${lefthook}: git-hooks overslaan is verboden (AGENTS.md)`);
  if ([...assignments, ...(program === 'export' ? args : [])].some((word) => /^CI=/.test(word)))
    decision.deny.push('De agent zet CI niet lokaal; dit kan de hostcontrole van de runner omzeilen');
  if (program === 'git') decision.deny.push(...gitForbidden(args, { role, branch: ctx.branch }));
  if (program === 'gh') decision.deny.push(...ghForbidden(args));
  if (program === 'gh' && role !== 'hoofdsessie' &&
    (args.some((arg, index) => arg === 'pr' && args[index + 1] === 'create') ||
      (args[0] === 'api' && apiMutates(args.slice(1)))))
    decision.deny.push('subagent: PR-creatie en schrijvende GitHub-API-opdrachten doet alleen de hoofdsessie');
  if (program === 'pnpm' && (args[0] === 'format' || (args[0] === 'run' && args[1] === 'format'))) {
    const melding = 'pnpm format schrijft de hele repository, inclusief beschermde paden; gebruik gerichte formattering';
    if (role === 'hoofdsessie') decision.ask.push(melding);
    else decision.deny.push(melding);
  }
  if (role !== 'hoofdsessie' && isNewResource(program, args))
    decision.deny.push('pnpm new:resource: alleen de hoofdsessie (ADR 0047 punt 6); wat hij schrijft, ziet het rolhek niet');
  if (role !== 'hoofdsessie' &&
    ((program === 'pnpm' && args.includes('pr:label-gate')) ||
      (program === 'node' && args.some((arg) => /(?:^|\/)scripts\/kit\/pr-gate-label\.mjs$/.test(arg)))))
    decision.deny.push('Het administratieve gate-label zet alleen de hoofdsessie via pr:label-gate');
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
  if (config.some((setting) => TRUSTED_CONFIG.test(setting)) || movesTrustedBase(subcommand, rest))
    found.push('de vertrouwde basis (origin/main en remote origin) verander je alleen met git fetch (ADR 0046)');
  if (subcommand === 'push' && pushesMain(rest, branch)) found.push('push naar main is verboden; open een PR');
  if (subcommand === 'push' && forcePushes(rest)) found.push('force-push is verboden, ook voor de hoofdsessie (WS-04)');
  if (subcommand === 'branch' && deletesMain(rest)) found.push('git branch -d/-D/--delete van main is verboden (ADR 0046 punt 26)');
  if (role === 'hoofdsessie') return found;
  if (subcommand === 'push' || subcommand === 'merge' || subcommand === 'rebase')
    found.push(`subagent: git ${subcommand} doet de hoofdsessie`);
  if (subcommand === 'reset' && rest.includes('--hard')) found.push('subagent: git reset --hard is verboden');
  return found;
}

// git accepteert elke unieke prefix van een long option: `--d` t/m `--delete`.
const BRANCH_DELETE_FLAGS = /^(?:--d(?:e(?:l(?:e(?:t(?:e)?)?)?)?)?|-[a-zA-Z]*[dD][a-zA-Z]*)$/;

/**
 * `git branch -d/-D/--delete` met `main` of `refs/heads/main` als operand.
 * @param {readonly string[]} rest
 */
function deletesMain(rest) {
  const deletes = rest.some((arg) => BRANCH_DELETE_FLAGS.test(arg));
  return deletes && rest.some((arg) => arg === 'main' || arg === 'refs/heads/main');
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

// De hooks lezen besluiten, autoRunner en gateMarker uit de lokale ref origin/main (ADR 0046). Een eigen commit of een andere
// remote onder die naam zou bevoegdheid geven die nooit is toegekend; de CI-guard leest main bij GitHub en blijft de grens.
const TRUSTED_CONFIG = /^(?:remote\.origin\.|url\.)/i;
const TRUSTED_NAME = /^(?:refs\/(?:heads|tags)\/)?origin\/(?:main|HEAD)$/;
const TRUSTED_DESTINATION = /:\+?(?:refs\/remotes\/)?origin\/(?:main|HEAD|\*)$/;
const READ_ONLY_CONFIG = ['--get', '--get-all', '--get-regexp', '--list', '-l', '--show-origin'];
const BRANCH_READ_FLAGS = /^(?:--set-upstream-to|-u|--contains|--no-contains|--merged|--no-merged|--points-at|--list|-l)(?:=|$)/;

/**
 * @param {string} subcommand
 * @param {readonly string[]} rest
 */
function movesTrustedBase(subcommand, rest) {
  const operands = rest.filter((arg) => !arg.startsWith('-'));
  switch (subcommand) {
    case 'update-ref':
      if (rest.some((arg) => arg.length > 2 && '--stdin'.startsWith(arg))) return true;
      return rest.some((arg) => /^refs\/remotes\/origin\//.test(arg));
    case 'symbolic-ref':
      return rest.some((arg) => /^refs\/remotes\/origin\//.test(arg));
    case 'branch':
    case 'tag':
      return !rest.some((arg) => BRANCH_READ_FLAGS.test(arg)) && TRUSTED_NAME.test(operands[0] ?? '');
    case 'checkout':
    case 'switch':
      return rest.some((arg, index) => ['-b', '-B', '-c', '-C'].includes(arg) && TRUSTED_NAME.test(rest[index + 1] ?? ''));
    case 'fetch':
      return operands[0] !== 'origin' && operands.slice(1).some((spec) => TRUSTED_DESTINATION.test(spec));
    case 'remote':
      return ['add', 'set-url', 'rename', 'remove', 'rm', 'set-head', 'set-branches'].includes(operands[0] ?? '');
    case 'config':
      return !rest.some((arg) => READ_ONLY_CONFIG.includes(arg)) && rest.some((arg) => TRUSTED_CONFIG.test(arg));
    default:
      return false;
  }
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

// Git accepteert elke unieke prefix van een long option: alles vanaf `--forc` is --force, --force-with-lease[=…] of
// --force-if-includes. `--fo`/`--for` zijn ambigu met --follow-tags en weigert git zelf; --follow-tags moet door.
const FORCE_OPTIONS = /^--forc/;
const PUSH_OPTIONS_WITH_VALUE = new Set(['--push-option', '--repo', '--receive-pack', '--exec']);

/**
 * `--force`, `--force-with-lease[=…]`, `--force-if-includes`, `-f` (ook in een cluster als `-uf`) of een refspec met `+`.
 * @param {readonly string[]} rest
 */
function forcePushes(rest) {
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index] ?? '';
    if (FORCE_OPTIONS.test(arg) || arg.startsWith('+')) return true;
    if (PUSH_OPTIONS_WITH_VALUE.has(arg)) index += 1;
    else if (/^-[^-]/.test(arg)) {
      // `-o <optie>`: wat na `o` in het cluster staat, is de waarde, geen vlag; `-uo` neemt het volgende argument.
      const [flags = ''] = arg.slice(1).split('o');
      if (flags.includes('f')) return true;
      if (arg.endsWith('o')) index += 1;
    }
  }
  return false;
}

const SELF_REVIEW_API = /\/(?:labels|reviews|statuses|check-runs|check-suites)\b|\/requested_reviewers\b/;

/**
 * Voor elke rol, ook de hoofdsessie: zelfreview, het gate-label en mergen (WS-04).
 * @param {readonly string[]} args
 * @returns {string[]}
 */
export function ghForbidden(args) {
  const [group = '', action = ''] = args;
  /** @type {string[]} */
  const found = [];
  if (group === 'pr' && action === 'review') found.push('gh pr review: de agent keurt nooit zelf goed (AGENTS.md)');
  if (args.some((arg, index) => arg.includes('gate-wijziging') && /label/.test(`${args[index - 1] ?? ''}${arg}`)))
    found.push('het label gate-wijziging zet alleen de eigenaar (AGENTS.md)');
  if (group === 'api' && apiWritesSelfReview(args.slice(1))) found.push('gh api: labels, reviews en statussen zet alleen de eigenaar');
  if ((group === 'pr' && action === 'merge') || (group === 'api' && apiMerges(args.slice(1))))
    found.push('mergen (ook auto-merge) doet alleen de eigenaar, voor elke rol (WS-04)');
  return found;
}

const MERGE_API = /\/(?:auto-)?merges?\/?(?:[?#]|$)/;
const MERGE_MUTATION = /\b(?:mergePullRequest|enablePullRequestAutoMerge|mergeBranch)\b/;

/**
 * `gh api` naar …/merge of …/auto-merge (elke methode) of een GraphQL-mutatie die mergt.
 * @param {readonly string[]} args
 */
function apiMerges(args) {
  const endpoint = apiEndpoint(args);
  if (endpoint === 'graphql') return args.some((arg) => MERGE_MUTATION.test(arg));
  return MERGE_API.test(endpoint);
}

/** @param {readonly string[]} args */
function apiWritesSelfReview(args) {
  const endpoint = apiEndpoint(args);
  if (endpoint === 'graphql') return args.some((arg) => /mutation[\s\S]*(?:Review|Label|Status|CheckRun)/i.test(arg));
  return apiMutates(args) && SELF_REVIEW_API.test(endpoint);
}

/** REST met schrijfargumenten, of GraphQL-mutatie/onleesbare invoer; inline queries blijven lezen. @param {readonly string[]} args */
function apiMutates(args) {
  if (apiEndpoint(args) === 'graphql')
    return args.some((arg) => /\bmutation\b/i.test(arg) || /query=@/.test(arg) || arg === '--input' || arg.startsWith('--input='));
  const method = args.findIndex((arg) => arg === '-X' || arg === '--method');
  return (
    (method !== -1 && (args[method + 1] ?? 'GET').toUpperCase() !== 'GET') ||
    args.some((arg) => /^--method=(?!GET$)/i.test(arg) || /^-X(?!GET$).+/i.test(arg)) ||
    args.some((arg) => arg.startsWith('-f') || arg.startsWith('-F') || ['--field', '--raw-field', '--input'].includes(arg) || /^--(?:field|raw-field|input)=/.test(arg))
  );
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
