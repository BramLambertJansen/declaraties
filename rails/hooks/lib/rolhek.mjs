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
  decision.deny.push(...rawForbidden(command, role));
  // De inhoud van `$(…)` en backticks is zelf een commando; zo vallen ook geneste substituties onder dezelfde regels.
  for (const inner of substitutions(command)) decideBash({ command: inner, role }, ctx, decision);
  const setsGhEnv = zetGhOmgeving(parseCommands(command));
  for (const parsed of parseCommands(command)) {
    const { assignments, argv, pathWrappers } = splitCommand(parsed.words);
    // `$G pr merge`, `${x}h …`, `$(echo gh) …`: welk programma draait, is pas bij het uitvoeren bekend.
    const hidden = hiddenCommandWord(parsed.words);
    const ghGlob = parsed.words.find((word) => globForGh(word) || SHELL_EXPANSION.test(word));
    // `${G}h pr merge` achter een onbekend omhulsel: een variabel woord na het commandowoord bij een gh-subcommando.
    const expandedArg = argv.slice(1).some((word) => (parsed.expanded ?? []).includes(word));
    if (expandedArg && GH_SUBCOMMAND.test(command.replace(/[\\'"]/g, '')))
      decision.deny.push('een variabel woord naast een gh-subcommando (pr, api, run …) is verboden, voor elke rol');
    // Allowlist: met een geëxpandeerd argument mag alleen een programma dat zelf geen commando of netwerkopdracht start.
    if (expandedArg && !EXPANSION_SAFE.has(programName(argv[0] ?? ''))) {
      const melding = `\`${argv[0] ?? ''}\` met een geëxpandeerd argument ($, backtick): het rolhek ziet niet wat er draait`;
      if (role === 'hoofdsessie') decision.ask.push(melding);
      else decision.deny.push(`subagent: ${melding}`);
    }
    if (ghGlob !== undefined) decision.deny.push(`\`${ghGlob}\` kan naar gh wijzen (glob, brace-expansie of POSIX-klasse); verboden, voor elke rol`);
    if (hidden !== null)
      decision.deny.push(`een commandowoord dat niet letterlijk is (\`${hidden}\`) is verboden, voor elke rol`);
    if (envSplitsString(parsed.words))
      decision.deny.push('env -S/--split-string maakt van tekst een nieuw commando dat het rolhek niet ziet; verboden, voor elke rol');
    forbidden({ assignments, argv, expanded: parsed.expanded ?? [] }, { role, ctx }, decision);
    ghIssue(argv, { role, ctx, setsGhEnv }, decision);
    if (role === 'reviewer' && (pathWrappers.length > 0 || !reviewerMay(argv, parsed.redirects)))
      decision.deny.push(`reviewer: alleen lezen (\`${argv.slice(0, 3).join(' ')}\` mag niet; framework §8)`);
    const targets = writeTargets(parsed);
    for (const target of targets.writes) bashTarget({ file: target, kind: 'write', role }, ctx, decision);
    for (const target of targets.deletes) bashTarget({ file: target, kind: 'delete', role }, ctx, decision);
  }
}

// Opties van env die het volgende woord als waarde nemen (`-u NAAM`, `-C MAP`, `--unset NAAM`, `--chdir MAP`, `--argv0 X`).
const ENV_VALUE_SHORT = /^-[a-zA-Z]*[uCa]$/;
const ENV_VALUE_LONG = ['--unset', '--chdir', '--argv0'];

/**
 * `env -S …`, `env -vSgh …`, `env -u X -S…` of `env --split-string=…` (ook een unieke afkorting vanaf `--s`) vóór het
 * commandowoord. Dicht falen: elk optiewoord dat op `-…S` of `--s` lijkt telt, ook `-uS` (unset S); waarden van
 * `-u`/`-C`/`-a` en hun lange vormen worden overgeslagen, zodat ze de scan niet afbreken.
 * @param {readonly string[]} words
 */
function envSplitsString(words) {
  for (const [index, word] of words.entries()) {
    if (programName(word) !== 'env') continue;
    const rest = words.slice(index + 1);
    for (let at = 0; at < rest.length; at += 1) {
      const option = rest[at] ?? '';
      if (!option.startsWith('-') || option === '--') break;
      const name = option.split('=')[0] ?? '';
      if (/^-[a-zA-Z]*S/.test(option) || /^--s/.test(option)) return true;
      const longValue = !option.includes('=') && name.length >= 3 && ENV_VALUE_LONG.some((long) => long.startsWith(name));
      if (ENV_VALUE_SHORT.test(option) || longValue) at += 1;
    }
  }
  return false;
}

/**
 * De inhoud van elke `$(…)` en elk backtick-paar op het buitenste niveau (geneste vangt de recursie in decideBash).
 * @param {string} command
 * @returns {string[]}
 */
function substitutions(command) {
  /** @type {string[]} */
  const found = [];
  for (let index = 0; index < command.length; index += 1) {
    const close = command.startsWith('$(', index) ? matchingParen(command, index + 2)
      : command[index] === '`' ? command.indexOf('`', index + 1) : -1;
    if (close === -1) continue;
    found.push(command.slice(index + (command[index] === '`' ? 1 : 2), close));
    index = close;
  }
  return found;
}

/**
 * @param {string} text
 * @param {number} from positie na de openende `(`
 */
function matchingParen(text, from) {
  let depth = 1;
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    if (text[index] === ')') depth -= 1;
    if (depth === 0) return index;
  }
  return text.length;
}

// Grove, dichte regel op de ruwe commandotekst, heredocs inbegrepen (eigenaarsbesluit 2026-10-26): geen shell-parsing,
// dus ook `{ …; }`, `if`, brace-expansie, `$(…)` en `eval` vallen eronder. Een vangnet bovenop de regels per segment.
// `gh` als woord: niet in `rolhek-gh-allowlist`, `gh-notes` of `high-gh`, wel in `/usr/bin/gh`, `x;gh`, `(gh`, een git-alias
// `!gh`, `env -Sgh`, `env -vSgh` en `env -S\_gh` (`-S`/`--split-string` splitst de rest tot een nieuw commando; `\_`, `\t` …
// zijn daar witruimte en na het strippen van `\` een losse letter). Elk teken buiten `[\w.-]` is een grens.
const GH_WORD = /(?:^|[^\w.-]|(?<=(?:^|\s)(?:-[a-zA-Z]*S|--s[a-z-]*=)[_fnrtv]*))gh(?=$|[^\w.-])/;
const RAW_GITHUB = new RegExp(`${GH_WORD.source}|\\/pulls\\/|api\\.github\\.com|graphql`, 'm');
const RAW_MERGE = /(?<![,a-zA-Z])merge(?=[\s/,}]|$)/m;
// Los van gh-herkenning: `pr merge`, `pr review … --approve` en een GraphQL-merge zijn in elke vorm verboden. Met herkenbaar gh is
// `pr review` als losse woorden voor elke rol verboden, ook zonder approve: zo valt `env -i gh pr review …` (omhulsel met opties,
// dat `splitCommand` niet afpelt) net als directe `gh pr review` (`ghForbidden`). `-a` telt ook vooraan een cluster (`-ab`, `-aF`).
const RAW_PR_MERGE = /(?:^|[^\w.-])pr\s+merge(?=$|[^\w.-])/m;
const RAW_PR_REVIEW = /(?:^|[^\w.-])pr\s+review(?=$|[^\w.-])/m;
const RAW_APPROVE = /--approve|(?:^|\s)-a/;
const RAW_SUBAGENT = new RegExp(`${GH_WORD.source}|api\\.github\\.com|git\\s+credential`, 'm');
const SHELL_TRICKS = /\$\(|`|\beval\b|\bsource\b|(?:^|[\s;&|(])\.\s|\{[^}]*(?:,|\.\.)[^}]*\}|\|\s*(?:ba|z|da|k)?sh\b|<</;

/**
 * Voor elke rol: mergen of goedkeuren in tekst die naar gh, …/pulls/, de GitHub-API of GraphQL wijst, en `pr review` naast gh.
 * Voor een subagent: tekst die gh, de GitHub-API of git credential noemt mag alleen één direct gh-commando zonder shell-trucs zijn; vals positief
 * (`grep gh x`) is bewust geaccepteerd.
 * @param {string} command
 * @param {string} role
 * @returns {string[]}
 */
function rawForbidden(command, role) {
  /** @type {string[]} */
  const found = [];
  // Zonder `\`, `'` en `"`: `g\h`, `g""h` en `mer''ge` zijn voor de shell gewoon gh en merge.
  const text = command.replace(/[\\'"]/g, '');
  if (RAW_GITHUB.test(text) &&
    (RAW_MERGE.test(text) || MERGE_MUTATION.test(text) || (/\breview\b/.test(text) && RAW_APPROVE.test(text)) ||
      (/\/reviews\b/.test(text) && /APPROVE/.test(text))))
    found.push('mergen of goedkeuren via gh of …/pulls/ is voor elke rol verboden (vangnet op de ruwe tekst, WS-04)');
  else if (GH_WORD.test(text) && RAW_PR_REVIEW.test(text))
    found.push('gh pr review is voor elke rol verboden, ook achter een omhulsel en zonder --approve (vangnet op de ruwe tekst, AGENTS.md)');
  else if (RAW_PR_MERGE.test(text) || MERGE_MUTATION.test(text) || (RAW_PR_REVIEW.test(text) && RAW_APPROVE.test(text)))
    found.push('`pr merge`, `pr review --approve` of een GraphQL-merge is voor elke rol verboden, ook zonder herkenbaar gh (vangnet op de ruwe tekst, WS-04)');
  if (role === 'hoofdsessie' || !RAW_SUBAGENT.test(text)) return found;
  const segments = parseCommands(command);
  if (segments.length !== 1 || segments[0]?.words[0] !== 'gh' || SHELL_TRICKS.test(command))
    found.push('subagent: gh, de GitHub-API of git credential alleen als één direct gh-leescommando zonder shell-trucs');
  return found;
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
 * @param {{ assignments: string[], argv: string[], expanded: readonly string[] }} command
 * @param {{ role: string, ctx: Ctx }} who
 * @param {Decision} decision
 */
function forbidden({ assignments, argv, expanded }, { role, ctx }, decision) {
  const [word = '', ...args] = argv;
  const program = programName(word);
  const lefthook = [...assignments, ...(program === 'export' ? args : [])].find((word) => /^LEFTHOOK(?:_\w+)?=/.test(word));
  if (lefthook !== undefined) decision.deny.push(`${lefthook}: git-hooks overslaan is verboden (AGENTS.md)`);
  if ([...assignments, ...(program === 'export' ? args : [])].some((word) => /^CI=/.test(word)))
    decision.deny.push('De agent zet CI niet lokaal; dit kan de hostcontrole van de runner omzeilen');
  if (program === 'git') decision.deny.push(...gitForbidden(args, { role, branch: ctx.branch }));
  // Voor elk programma (ook pnpm test:db of bash scripts/runner.sh), en ook `export NAAM` of `declare -x NAAM=…`.
  const gitEnv = [...assignments, ...(ENV_EXPORTERS.has(program) ? args : [])].find((word) => GIT_ENV.test(word));
  if (gitEnv !== undefined)
    decision.deny.push(`${gitEnv.split('=')[0] ?? ''}: git-configuratie of -map via de omgeving kan de vertrouwde basis verleggen (ADR 0046)`);
  if (program === 'gh') decision.deny.push(...ghForbidden(args, expanded));
  if (program === 'pnpm' && pnpmCommand(args)[0] === 'format') {
    const melding = 'pnpm format schrijft de hele repository, inclusief beschermde paden; gebruik gerichte formattering';
    if (role === 'hoofdsessie') decision.ask.push(melding);
    else decision.deny.push(melding);
  }
  decision.deny.push(...indirectForbidden(program, args, role));
  if (role !== 'hoofdsessie' && (['eval', 'source', '.'].includes(program) ||
    (SHELLS.has(program) && !args.some((arg) => !arg.startsWith('-')))))
    decision.deny.push(`subagent: ${program} voert tekst uit die het rolhek niet ziet (eval, source, shell zonder scriptbestand)`);
  if (role !== 'hoofdsessie') {
    const command = { program, args, expanded };
    decision.deny.push(...subagentGitHub(command), ...subagentTokens(command), ...subagentFormatting(command, ctx));
  }
  if (role !== 'hoofdsessie' && isNewResource(program, args))
    decision.deny.push('pnpm new:resource: alleen de hoofdsessie (ADR 0047 punt 6); wat hij schrijft, ziet het rolhek niet');
  if (role !== 'hoofdsessie' &&
    ((program === 'pnpm' && args.includes('pr:label-gate')) ||
      (program === 'node' && args.some((arg) => /(?:^|\/)scripts\/kit\/pr-gate-label\.mjs$/.test(arg)))))
    decision.deny.push('Het administratieve gate-label zet alleen de hoofdsessie via pr:label-gate');
}

// Shell-sleutelwoorden die geen programma zijn; `{` en `[` staan daarom niet onder de glob-regel.
const SHELL_WORDS = new Set(['{', '}', '[', '[[', ']]', '!']);

/**
 * Letterlijk: geen expansie (`$`, backtick), geen glob (`*`, `?`, `[`, `{`) en geen `~` vooraan; dan weet het rolhek
 * vóór het uitvoeren welk programma draait.
 * @param {string} word
 */
function literalWord(word) {
  return SHELL_WORDS.has(word) || (!/[$`*?[{]/.test(word) && !word.startsWith('~'));
}

// Sleutelwoorden en omhulsels vóór het commandowoord. Hun opties zijn niet te overzien (`sudo --weird v`), dus na zo'n
// begin moet elk woord van het segment letterlijk zijn: dicht falen, ook bij `time ls *.md`.
const KEYWORDS = new Set(['{', '}', '!', 'if', 'then', 'elif', 'else', 'fi', 'do', 'done', 'while', 'until']);
const COMMAND_WRAPPERS = new Set(['time', 'env', 'nice', 'command', 'nohup', 'exec', 'stdbuf', 'timeout', 'sudo', 'coproc',
  'setsid', 'flock', 'watch', 'chroot', 'doas', 'unbuffer', 'parallel', 'script']);

// Brace-expansie (`{` met verderop `,` of `..`: `g{h..h}`, `{g,x}h`) en POSIX-klassen (`[[:alpha:]]`, `[[=h=]]`, `[[.h.]]`, ook `[![:digit:]]`)
// kunnen elke naam opleveren; een vangnet heeft geen expander nodig, dus dicht (ook `echo {a,b}`). `[[` als los woord mag.
// Programma's die met een geëxpandeerd argument (`$X`, `$(…)`) geen ander commando of GitHub-aanroep kunnen starten.
// `sed` (`e`) en `awk` (`system()`) kunnen dat wel en staan er daarom niet in.
const EXPANSION_SAFE = new Set(['echo', 'printf', 'cat', 'ls', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch', 'grep',
  'head', 'tail', 'wc', 'sort', 'uniq', 'diff', 'cmp', 'test', '[', 'cd', 'basename', 'dirname', 'realpath', 'readlink', 'stat',
  'file', 'du', 'df']);
// Losse woorden die op een gh-opdracht wijzen; bewust vals positief: `echo $HOME run`.
const GH_SUBCOMMAND = /(?:^|[\s;&|(){}<>])(?:pr|api|repo|release|workflow|run|issue|label|secret|merge|review|create)(?=$|[\s;&|(){}<>])/;
const SHELL_EXPANSION = /\{.*(?:,|\.\.)|\[[^\]]*\[[:=.]/s;

/**
 * Een woord met een glob (`*`, `?`, `[…]`) waarvan de naam `gh` of `gh.exe` kan zijn, op elke positie: zo hangt de regel
 * niet af van een lijst omhulsels (`setsid /usr/bin/g[h] …`). `cat g*.txt` en `ls src/*.ts` matchen niet.
 * @param {string} word
 */
function globForGh(word) {
  const name = word.slice(word.lastIndexOf('/') + 1);
  if (!/[*?]|\[[!^]?\]?[^\]]*\]/.test(name)) return false;
  // Een klasse mag direct na `[`, `[!` of `[^` een `]` bevatten (`g[]h]` matcht gh); een losse `[` is letterlijk.
  const pattern = name.replace(/\[[!^]?\]?[^\]]*\]|./g, globPart);
  const matcher = new RegExp(`^${pattern}$`, 'i');
  return matcher.test('gh') || matcher.test('gh.exe');
}

/**
 * Eén deel van een shell-glob als reguliere expressie: een klasse `[…]`/`[!…]`, `*`, `?` of een letterlijk teken.
 * @param {string} part
 */
function globPart(part) {
  const negated = /^\[[!^]/.test(part);
  if (part.length > 1) return `[${negated ? '^' : ''}${part.slice(negated ? 2 : 1, -1).replace(/[\\\]^]/g, '\\$&')}]`;
  if (part === '*') return '.*';
  if (part === '?') return '.';
  return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/**
 * Het eerste woord dat als commandowoord kan dienen en niet letterlijk is, of null. Na toewijzingen telt het eerste woord;
 * begint het segment met een sleutelwoord of omhulsel, dan telt elk woord.
 * @param {readonly string[]} words
 * @returns {string | null}
 */
function hiddenCommandWord(words) {
  const start = words.findIndex((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word));
  if (start === -1) return null;
  const rest = words.slice(start);
  const [first = ''] = rest;
  const all = KEYWORDS.has(first) || COMMAND_WRAPPERS.has(programName(first));
  return (all ? rest : [first]).find((word) => !literalWord(word)) ?? null;
}

const FIND_EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir']);
// Na xargs of find -exec: een omhulsel, shell of git kan met argumenten uit een bestand of stdin alsnog gh of een
// git-alias (`!gh …`) starten. Dicht falen: zo'n commandowoord is altijd verboden, ook zonder zichtbare gh erna.
const INDIRECT_LAUNCHERS = new Set([...COMMAND_WRAPPERS, 'git', 'eval', 'xargs', 'find', 'bash', 'sh', 'zsh', 'dash', 'ksh']);

/**
 * Programma's die een ander commando starten: xargs met vervangtekst of find -exec met een commandowoord dat niet
 * letterlijk is, en eval of `bash -c` met expansie (voor elke rol); voor een subagent elke xargs of find -exec met een
 * commandowoord.
 * @param {string} program
 * @param {readonly string[]} args
 * @param {string} role
 * @returns {string[]}
 */
function indirectForbidden(program, args, role) {
  const xargs = program === 'xargs' ? xargsCall(args) : null;
  const execs = program === 'find' ? args.flatMap((arg, index) => (FIND_EXEC.has(arg) ? [args[index + 1] ?? ''] : [])) : [];
  /** @type {string[]} */
  const found = [];
  const replaced = xargs !== null && xargs.command !== null &&
    (!literalWord(xargs.command) || (xargs.replace !== null && xargs.command.includes(xargs.replace)));
  if (replaced || execs.some((word) => !literalWord(word)))
    found.push(`${program}: een commandowoord dat niet letterlijk is, is verboden, voor elke rol`);
  const launched = [xargs?.command ?? '', ...execs].map((word) => programName(word));
  if (launched.includes('gh'))
    found.push(`${program}: gh via xargs of find -exec ontloopt de gh-controles; verboden, voor elke rol (roep gh rechtstreeks aan)`);
  const launcher = launched.find((name) => INDIRECT_LAUNCHERS.has(name));
  if (launcher !== undefined)
    found.push(`${program}: \`${launcher}\` via xargs of find -exec kan gh of een alias starten die het rolhek niet ziet; verboden, voor elke rol`);
  if ((program === 'eval' || (SHELLS.has(program) && args.some((arg) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(arg)))) &&
    args.some((arg) => /[$`]/.test(arg)))
    found.push(`${program}: tekst met expansie uitvoeren is verboden, voor elke rol`);
  if (role !== 'hoofdsessie' && ((xargs !== null && xargs.command !== null) || execs.length > 0))
    found.push(`subagent: ${program} start een ander commando; roep het commando rechtstreeks aan`);
  return found;
}

const XARGS_OPTIONS_WITH_VALUE = /^-[IJnLPsdEaRS]$/;

/**
 * Het commandowoord van xargs en de vervangtekst (`-I %`, `-I%`, `-J %`, `-i`, `--replace[=R]`), of null.
 * @param {readonly string[]} args
 * @returns {{ command: string | null, replace: string | null }}
 */
function xargsCall(args) {
  /** @type {string | null} */
  let replace = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (arg === '--') return { command: args[index + 1] ?? null, replace };
    if (!arg.startsWith('-')) return { command: arg, replace };
    if (/^-[IJ]./.test(arg)) replace = arg.slice(2);
    if (/^-[IJ]$/.test(arg)) replace = args[index + 1] ?? '';
    if (/^-i/.test(arg)) replace = arg.slice(2) || '{}';
    if (arg.startsWith('--replace')) replace = arg.split('=')[1] ?? '{}';
    if (XARGS_OPTIONS_WITH_VALUE.test(arg)) index += 1;
  }
  return { command: null, replace };
}

/** @typedef {{ program: string, args: readonly string[], expanded: readonly string[] }} Invocation */

// Subagents lezen alleen bij GitHub (eigenaarkeuze): al het andere, ook aliassen (`gh pr new`), `gh auth` en
// `gh extension`, weigert het rolhek. `gh api` loopt via apiReads. Issues en aliassen lezen mag (spec leerlus, AC-7).
const SUBAGENT_GH = [
  /^pr (?:view|diff|checks|list|status)$/,
  /^run (?:view|list|watch)$/,
  /^issue (?:view|list|ls|status)$/,
  /^repo view$/,
  /^alias list$/,
  /^version$/,
];
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);

/**
 * `gh` buiten de allowlist. gh achter een omhulsel, xargs of `bash -c` vangt rawForbidden op de ruwe tekst.
 * @param {Invocation} command
 * @returns {string[]}
 */
function subagentGitHub({ program, args }) {
  const gh = withoutRepo(args);
  if (program === 'gh' && !(gh[0] === 'api' ? apiReads(apiCall(gh.slice(1))) : SUBAGENT_GH.some((p) => p.test(gh.slice(0, 2).join(' ')))))
    return [`subagent: alleen lezende gh-opdrachten (\`gh ${gh.slice(0, 2).join(' ')}\` mag niet); de rest doet de hoofdsessie`];
  return [];
}

const CURL_CONFIG = /^(?:-[a-zA-Z]*K|--config(?:=|$)|--netrc|-e$|--execute(?:=|$))/;

/**
 * curl/wget met een token naar GitHub, een config- of headerbestand (`-K`, een headerbestand via -H) of een niet-letterlijk argument
 * (`"$U"`): wat er dan naar buiten gaat, ziet het rolhek niet.
 * @param {Invocation} command
 * @returns {string[]}
 */
function subagentTokens({ program, args, expanded }) {
  if (program !== 'curl' && program !== 'wget') return [];
  /** @type {string[]} */
  const found = [];
  const text = args.join(' ');
  // Bewust overal in de tekst (deny-kant): een substring, geen hostcontrole.
  if (text.toLowerCase().includes('github.com') && /authorization|bearer|token|--user\b|(?:^|\s)-u\b/i.test(text))
    found.push('subagent: GitHub-API met een token via curl/wget omzeilt de gh-allowlist; gebruik een lezende gh-opdracht');
  const headerFile = (/** @type {string} */ arg, /** @type {number} */ index) =>
    /^(?:-[a-zA-Z]*H|--header=?)@/.test(arg) || (/^(?:-[a-zA-Z]*H|--header)$/.test(arg) && (args[index + 1] ?? '').startsWith('@'));
  if (args.some((arg, index) => CURL_CONFIG.test(arg) || headerFile(arg, index)))
    found.push('subagent: curl/wget met een config-, netrc- of headerbestand is verboden; zet opties letterlijk');
  if (args.some((arg) => expanded.includes(arg) || arg.includes('$')))
    found.push('subagent: curl/wget alleen met letterlijke argumenten, geen $-expansie');
  return found;
}

/**
 * Brede formattering: `pnpm lint --fix` (ook via `run`), xargs met prettier/eslint die schrijft, of prettier/eslint met
 * `--write`/`-w`/`--fix` zonder expliciete bestanden.
 * @param {Invocation} command
 * @param {Ctx} ctx
 * @returns {string[]}
 */
function subagentFormatting({ program, args }, ctx) {
  const [script = '', ...scriptArgs] = program === 'pnpm' ? pnpmCommand(args) : [];
  const writes = (/** @type {readonly string[]} */ words) => words.some((arg) => FORMATTER_WRITES.test(arg));
  if ((/^(?:lint|format)(?::|$)/.test(script) && writes(scriptArgs)) ||
    (program === 'xargs' && args.some((arg) => ['prettier', 'eslint'].includes(programName(arg))) && writes(args)) ||
    broadFormat(formatterCall(program, args), ctx))
    return ['subagent: prettier/eslint met --write/-w/--fix alleen met expliciete bestanden, geen map, glob, script of xargs'];
  return [];
}

const PNPM_OPTIONS_WITH_VALUE = new Set(['-C', '--dir', '-F', '--filter', '--filter-prod', '--reporter', '--loglevel', '--workspace-concurrency', '--test-pattern', '--changed-files-ignore-pattern']);

/**
 * Het pnpm-commando met zijn argumenten, na de pnpm-opties en `run` (`pnpm -s --dir . run format` → `['format']`).
 * @param {readonly string[]} args
 * @returns {readonly string[]}
 */
function pnpmCommand(args) {
  let index = 0;
  while ((args[index] ?? '').startsWith('-')) index += PNPM_OPTIONS_WITH_VALUE.has(args[index] ?? '') ? 2 : 1;
  const rest = args.slice(index);
  return rest[0] === 'run' || rest[0] === 'run-script' ? pnpmCommand(rest.slice(1)) : rest;
}

/**
 * Het aangeroepen programma achter een starter (`pnpm exec`, `pnpm dlx`, `pnpm <bin>`, `npx`).
 * @param {string} program
 * @param {readonly string[]} args
 * @returns {{ tool: string, rest: readonly string[] }}
 */
function formatterCall(program, args) {
  /** @param {readonly string[]} words */
  const launched = (words) => {
    const index = words.findIndex((word) => !word.startsWith('-'));
    return index === -1 ? { tool: '', rest: [] } : { tool: programName(words[index] ?? ''), rest: words.slice(index + 1) };
  };
  if (program === 'pnpm') {
    const [command = '', ...rest] = pnpmCommand(args);
    return command === 'exec' || command === 'dlx' ? launched(rest) : { tool: programName(command), rest };
  }
  return ['npx', 'pnpx', 'bunx', 'yarn'].includes(program) ? launched(args) : { tool: program, rest: args };
}

const FORMATTER_WRITES = /^(?:--write|--fix|-[a-zA-Z]*w[a-zA-Z]*)(?:=|$)/;
const FORMATTER_OPTIONS_WITH_VALUE = new Set(['-c', '--config', '--ignore-path', '--plugin', '--parser', '--log-level', '--cache-location', '--cache-strategy', '--stdin-filepath', '--stdin-filename', '--ext', '--rule', '-f', '--format', '-o', '--output-file', '--max-warnings', '--ignore-pattern', '--fix-type', '--env', '--global', '--parser-options', '--rulesdir', '--resolve-plugins-relative-to', '--suppressions-location', '--concurrency', '--flag']);

/**
 * prettier/eslint die schrijft zonder expliciete bestanden: geen operand, `.`, een map, een glob of iets buiten de repo.
 * @param {{ tool: string, rest: readonly string[] }} call
 * @param {Ctx} ctx
 */
function broadFormat({ tool, rest }, ctx) {
  if ((tool !== 'prettier' && tool !== 'eslint') || !rest.some((arg) => FORMATTER_WRITES.test(arg))) return false;
  /** @type {string[]} */
  const operands = [];
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index] ?? '';
    if (arg === '--') operands.push(...rest.slice(index + 1));
    if (arg === '--') break;
    if (FORMATTER_OPTIONS_WITH_VALUE.has(arg)) index += 1;
    else if (!arg.startsWith('-')) operands.push(arg);
  }
  return operands.length === 0 || operands.some((operand) => {
    const rel = relative(ctx, operand);
    return rel === null || /[*?[{]/.test(operand) || ctx.isDir(rel);
  });
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
  if (shellAlias(args, { subcommand, rest, config }))
    found.push('een git-alias met `!` (shellcommando) of via --config-env is verboden, voor elke rol: het rolhek ziet niet wat er draait');
  if (role === 'hoofdsessie') return found;
  if (subcommand === 'push' || subcommand === 'merge' || subcommand === 'rebase')
    found.push(`subagent: git ${subcommand} doet de hoofdsessie`);
  if (subcommand === 'reset' && rest.includes('--hard')) found.push('subagent: git reset --hard is verboden');
  if (subcommand.startsWith('credential')) found.push('subagent: git credential geeft tokens vrij; verboden');
  return found;
}

/**
 * Een git-alias die een shellcommando start (`-c alias.x=!…`, `git config alias.x '!…'`) of zijn waarde uit de omgeving haalt
 * (`--config-env alias.x=VAR`); `git -c core.quotepath=false log` mag.
 * @param {readonly string[]} args
 * @param {{ subcommand: string, rest: readonly string[], config: readonly string[] }} git
 */
function shellAlias(args, { subcommand, rest, config }) {
  const fromEnv = args.some((arg, index) =>
    (/^--config-env=alias\./i.test(arg)) || (arg === '--config-env' && /^alias\./i.test(args[index + 1] ?? '')));
  if (fromEnv || config.some((setting) => /^alias\.[^=]*=\s*!/i.test(setting))) return true;
  return subcommand === 'config' && rest.some((arg) => /^alias\./i.test(arg)) && rest.some((arg) => /^\s*!/.test(arg));
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
const TRUSTED_CONFIG = /^(?:remote\.origin\.|url\.|include\.|includeif\.)/i;
const TRUSTED_NAME = /^(?:refs\/(?:heads|tags)\/)?origin\/(?:main|HEAD)$/;
const TRUSTED_DESTINATION = /:\+?(?:refs\/remotes\/)?origin\/(?:main|HEAD|\*)$/;
// Omgevingsvariabelen die git een andere config, repository of werkmap geven (`GIT_CONFIG_COUNT`, `GIT_DIR`, ...).
const GIT_ENV = /^GIT_(?:CONFIG\w*|DIR|WORK_TREE)(?:=|$)/;
const ENV_EXPORTERS = new Set(['export', 'declare', 'typeset', 'readonly', 'local']);
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
    case 'replace':
      // Een vervangend object laat main naar andere inhoud wijzen; alleen de lijst lezen mag.
      return !(rest.length === 0 || rest.includes('--list') || rest.includes('-l'));
    case 'symbolic-ref':
      return rest.some((arg) => /^refs\/remotes\/origin\//.test(arg));
    case 'branch':
    case 'tag':
      return !rest.some((arg) => BRANCH_READ_FLAGS.test(arg)) && TRUSTED_NAME.test(operands[0] ?? '');
    case 'checkout':
    case 'switch':
      return rest.some((arg, index) => ['-b', '-B', '-c', '-C'].includes(arg) && TRUSTED_NAME.test(rest[index + 1] ?? ''));
    case 'fetch':
      // Ook vanaf origin: `origin feat/x:refs/remotes/origin/main` buigt de basis om. `git fetch origin main` mag.
      return operands.slice(1).some((spec) => TRUSTED_DESTINATION.test(spec));
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

const GH_ISSUE_WRITES = new Set(['create', 'new', 'edit', 'close', 'reopen', 'delete', 'transfer', 'lock', 'unlock', 'pin', 'unpin', 'comment', 'develop']);
const GH_ISSUE_READS = new Set(['list', 'ls', 'view', 'status']);
// gh-vlaggen zonder waarde; cobra neemt bij elke andere vlag zonder `=` het volgende woord als waarde.
const GH_BOOL_FLAGS = new Set(['--help', '-h', '--version']);
const LEERPUNT = 'leerpunt';
const GH_ISSUE_WRITE_TEXT = new RegExp(`\\bgh\\b.*\\bissue\\b.*\\b(?:${[...GH_ISSUE_WRITES].join('|')})\\b`);
// Programma's die een ander commando uitvoeren; het rolhek ziet dat commando niet als eigen segment.
const COMMAND_RUNNERS = new Set(['xargs', 'eval', 'exec', 'command', 'time', 'timeout', 'nohup', 'nice', 'parallel', 'watch', 'find']);
// De ingebouwde gh-groepen; een ander eerste woord is een alias (`gh alias set ic 'issue create'`) of extensie.
const GH_GROUPS = new Set(['agent-task', 'alias', 'api', 'attestation', 'auth', 'browse', 'cache', 'codespace', 'completion', 'config', 'copilot', 'extension', 'gist', 'gpg-key', 'help', 'issue', 'label', 'licenses', 'org', 'pr', 'preview', 'project', 'release', 'repo', 'ruleset', 'run', 'search', 'secret', 'ssh-key', 'status', 'variable', 'version', 'workflow', '--help', '-h', '--version']);

/**
 * Zet een segment van het commando `GH_REPO` of `GH_HOST` (`GH_REPO=… gh`, `env GH_HOST=…`, `export GH_REPO=… &&`)?
 * @param {Iterable<{ words: string[] }>} commands
 */
function zetGhOmgeving(commands) {
  return [...commands].some(({ words }) => {
    const { assignments, argv } = splitCommand(words);
    const exported = ENV_EXPORTERS.has(programName(argv[0] ?? '')) ? argv.slice(1) : [];
    return [...assignments, ...exported].some((word) => /^GH_(?:REPO|HOST)=/.test(word));
  });
}

/**
 * De woorden die gh als commando leest, zoals cobra ze vindt: een vlag zonder `=` neemt het volgende woord als waarde
 * (`gh --duplicate-of 3 issue close 1`), behalve `--help`/`-h`/`--version`. Waarden van opties zijn dus geen subcommando.
 * @param {readonly string[]} args
 */
function ghCommandWords(args) {
  /** @type {string[]} */
  const words = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (arg === '--') break;
    if (arg === '' || arg === '-') continue; // cobra slaat lege woorden over; `-` is stdin, geen commando
    if (!arg.startsWith('-')) words.push(arg);
    else if (!arg.includes('=') && !GH_BOOL_FLAGS.has(arg) && !/^-[^-]./.test(arg)) index += 1;
  }
  return words;
}

/**
 * De schrijfactie van `gh issue <subcommando>` (`new` is de ingebouwde alias van `create`), of leeg. Een onbekend
 * subcommando telt als schrijvend; liever een vraag te veel dan een omzeiling.
 * @param {readonly string[]} args
 */
function ghIssueAction(args) {
  const [group, action = ''] = ghCommandWords(args);
  if (group !== 'issue' || action === '' || GH_ISSUE_READS.has(action)) return '';
  return action === 'new' ? 'create' : action;
}

/**
 * Een gh-issue-schrijfactie die het rolhek niet als eigen commando ziet: in `$( )` of backticks, in `sh -c`/`-lc`, of
 * achter een programma dat een commando uitvoert (`xargs`, `eval`).
 * @param {string} program
 * @param {readonly string[]} args
 */
function verborgenGhIssue(program, args) {
  const shell = SHELLS.has(program) && args.some((arg) => /^-[a-z]*c[a-z]*$/.test(arg));
  if (shell || COMMAND_RUNNERS.has(program)) return GH_ISSUE_WRITE_TEXT.test(args.join(' '));
  // Backticks zonder aanhalingstekens splitst de parser over meerdere woorden; toets dan het hele commando.
  if (args.some((arg) => arg.includes('`'))) return GH_ISSUE_WRITE_TEXT.test(args.join(' '));
  return args.some((arg) => /\$\(/.test(arg) && GH_ISSUE_WRITE_TEXT.test(arg));
}

/**
 * Subagent: een gh-alias kan elke opdracht verbergen, dus geen `gh alias set|import` en geen onbekend eerste woord.
 * @param {readonly string[]} args
 */
function ghAliasReden(args) {
  const [first = ''] = ghCommandWords(args);
  if (first === 'alias' && args.some((arg) => arg === 'set' || arg === 'import'))
    return 'subagent: gh alias set/import kan een schrijvende opdracht verbergen (ADR 0059)';
  if (first !== '' && !GH_GROUPS.has(first)) return `subagent: gh ${first} is geen ingebouwde gh-groep (alias of extensie; ADR 0059)`;
  return '';
}

/**
 * Leerlus (ADR 0059, spec leerlus): een subagent schrijft geen issues; de hoofdsessie dient zonder vraag alleen een leerpunt
 * in, met `--repo`/`-R` gelijk aan `onderhoud.repository` en precies één `--label leerpunt`. Elke andere vorm is ask.
 * @param {readonly string[]} argv
 * @param {{ role: string, ctx: Ctx, setsGhEnv: boolean }} who
 * @param {Decision} decision
 */
function ghIssue(argv, { role, ctx, setsGhEnv }, decision) {
  const [word = '', ...args] = argv;
  const program = programName(word);
  if (verborgenGhIssue(program, args)) {
    gate(decision, role, `gh issue binnen ${program} (string, substitutie of omhulsel): het rolhek kijkt daar niet in; gebruik een los gh-commando (ADR 0059)`);
    return;
  }
  const alias = program === 'gh' && role !== 'hoofdsessie' ? ghAliasReden(args) : '';
  if (alias !== '') decision.deny.push(alias);
  const action = program === 'gh' ? ghIssueAction(args) : '';
  if (action === '') return;
  if (role !== 'hoofdsessie') decision.deny.push(`subagent: gh issue ${action} doet alleen de hoofdsessie (ADR 0059)`);
  else if (action === 'create') {
    const reden = leerpuntAfwijking(args, ctx.config.onderhoud?.repository ?? '', setsGhEnv);
    if (reden !== '') decision.ask.push(`gh issue create buiten de leerpuntvorm: ${reden} (ADR 0059)`);
  }
}

/**
 * Lege string als het commando precies de leerpuntvorm heeft, anders de reden.
 * @param {readonly string[]} args
 * @param {string} repository
 * @param {boolean} setsGhEnv
 */
function leerpuntAfwijking(args, repository, setsGhEnv) {
  if (setsGhEnv) return 'GH_REPO of GH_HOST verlegt het doel';
  if (args.some((arg) => /\$\(|`/.test(arg))) return 'commandosubstitutie in het commando; zet de tekst in --body-file';
  const repos = optionValues(args, ['--repo', '-R']);
  const labels = optionValues(args, ['--label', '-l']);
  if (repository === '') return 'onderhoud.repository ontbreekt in .claude/gates.json';
  if (repos.length !== 1 || (repos[0] ?? '').toLowerCase() !== repository.toLowerCase())
    return `--repo moet precies één keer ${repository} zijn`;
  if (labels.length !== 1 || (labels[0] ?? '').toLowerCase() !== LEERPUNT) return `precies één --label ${LEERPUNT}, geen ander label`;
  return '';
}

/**
 * Waarden van een optie in de vormen `--naam waarde`, `--naam=waarde`, `-X waarde` en `-Xwaarde`.
 * @param {readonly string[]} args
 * @param {readonly string[]} names
 */
function optionValues(args, names) {
  /** @type {string[]} */
  const values = [];
  args.forEach((arg, index) => {
    if (names.includes(arg)) values.push(args[index + 1] ?? '');
    const long = names.find((name) => name.startsWith('--') && arg.startsWith(`${name}=`));
    const short = names.find((name) => /^-\w$/.test(name) && arg.length > 2 && arg.startsWith(name));
    if (long !== undefined) values.push(arg.slice(long.length + 1));
    else if (short !== undefined) values.push(arg.slice(2).replace(/^=/, ''));
  });
  return values;
}

const SELF_REVIEW_API = /\/(?:labels|reviews|statuses|check-runs|check-suites)\b|\/requested_reviewers\b/;

/**
 * Zonder `-R x`, `--repo x` en `--repo=x`, die gh vóór of na groep en actie accepteert (`gh -R o/r pr merge`), en zonder
 * lege woorden, die cobra bij het zoeken van het commando overslaat (`gh "" api …`). Een leeg woord na een vlag zonder `=`
 * blijft staan: dat kan de waarde van die vlag zijn (`gh api -f "" -X POST …`).
 * @param {readonly string[]} args
 */
function withoutRepo(args) {
  /** @type {string[]} */
  const rest = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    const previous = rest.at(-1) ?? '';
    if (arg === '-R' || arg === '--repo') index += 1;
    else if (arg === '' && !(previous.startsWith('-') && !previous.includes('='))) continue;
    else if (!/^(?:--repo=|-R.)/.test(arg)) rest.push(arg);
  }
  return rest;
}

/**
 * Voor elke rol, ook de hoofdsessie: zelfreview, het gate-label, mergen (WS-04), aliassen en onleesbare API-invoer.
 * @param {readonly string[]} rawArgs
 * @param {readonly string[]} [expanded] woorden met shell-expansie (`Command.expanded` uit shell.mjs)
 * @returns {string[]}
 */
export function ghForbidden(rawArgs, expanded = []) {
  const args = withoutRepo(rawArgs);
  const [group = '', action = ''] = args;
  const api = group === 'api' ? apiCall(args.slice(1)) : null;
  /** @type {string[]} */
  const found = [];
  if (group !== '' && !GH_GROUPS.has(group)) found.push(`gh ${group}: onbekende opdracht (mogelijk een alias), voor elke rol geweigerd`);
  if (group === 'alias' && (action === 'set' || action === 'import')) found.push('gh alias set/import: een alias omzeilt het rolhek');
  if (group === 'pr' && action === 'review') found.push('gh pr review: de agent keurt nooit zelf goed (AGENTS.md)');
  if (args.some((arg, index) => arg.includes('gate-wijziging') && /label/.test(`${args[index - 1] ?? ''}${arg}`)))
    found.push('het label gate-wijziging zet alleen de eigenaar (AGENTS.md)');
  if (api !== null) found.push(...apiUnreadable(api, expanded));
  if (api !== null && apiWritesSelfReview(api)) found.push('gh api: labels, reviews en statussen zet alleen de eigenaar');
  if ((group === 'pr' && action === 'merge') || (api !== null && apiMerges(api)))
    found.push('mergen (ook auto-merge) doet alleen de eigenaar, voor elke rol (WS-04)');
  return found;
}

const MERGE_API = /\/(?:auto-)?merges?\/?(?:[?#]|$)/;
const MERGE_MUTATION = /\b(?:mergePullRequest|enablePullRequestAutoMerge|mergeBranch)\b/;

/**
 * `gh api` naar …/merge of …/auto-merge (elke methode) of een GraphQL-mutatie die mergt.
 * @param {ApiCall} api
 */
function apiMerges({ endpoint, args }) {
  if (isGraphql(endpoint)) return args.some((arg) => MERGE_MUTATION.test(arg));
  return MERGE_API.test(endpoint);
}

/** @param {ApiCall} api */
function apiWritesSelfReview(api) {
  if (isGraphql(api.endpoint)) return api.args.some((arg) => /mutation[\s\S]*(?:Review|Label|Status|CheckRun)/i.test(arg));
  return apiMutates(api) && SELF_REVIEW_API.test(api.endpoint);
}

// In een endpoint is elke `$`, `\` of backtick onleesbaar; in een GraphQL-query alleen expansie (`$(`, `${`, backtick, `\`,
// of `$` buiten enkele aanhalingstekens): `query($n:Int!)` binnen enkele aanhalingstekens is een gewone variabele.
const UNREADABLE = /[$\\`]/;
const UNREADABLE_QUERY = /[`\\]|\$[({]/;

/**
 * Voor elke rol dicht falen: een GraphQL-query die niet letterlijk is (expansie, een bestand via -F, `--input`) kan elke mutatie zijn,
 * en een onleesbaar endpoint met een schrijvende aanroep kan …/merge, …/reviews of …/labels zijn.
 * @param {ApiCall} api
 * @param {readonly string[]} expanded
 * @returns {string[]}
 */
function apiUnreadable({ endpoint, options }, expanded) {
  // Het veld `query`, of een veld waarvan de naam zelf niet letterlijk is (`-f "$K=…"`).
  const query = options.filter(({ name, value }) => FIELDS.has(name) && !/^(?!query=)[\w[\]]+=/.test(value));
  const hidden = (/** @type {ApiOption} */ { value, word }) =>
    expanded.includes(word) || UNREADABLE_QUERY.test(value) || /^[^=]*=@/.test(value);
  if (isGraphql(endpoint) && (options.some(({ name }) => name === 'input') || query.some(hidden)))
    return ['gh api graphql met een niet-letterlijke query ($(…), shell-variabele, \\, @file of --input) is verboden, voor elke rol'];
  if (UNREADABLE.test(endpoint) && apiMutates({ endpoint, options, args: [] }))
    return ['gh api: een schrijvende aanroep naar een onleesbaar endpoint is verboden, voor elke rol'];
  return [];
}

// Wat een subagent bij `gh api` mag: alleen opties die niets schrijven of meesturen (`-H` alleen als Accept-header).
const API_READ_OPTIONS = new Set(['jq', 'paginate', 'include', 'silent']);

/**
 * Lezen via `gh api` voor een subagent: leesbaar REST-endpoint, geen GraphQL en alleen bekende lezende opties.
 * @param {ApiCall} api
 */
function apiReads({ endpoint, options }) {
  return endpoint !== '' && !UNREADABLE.test(endpoint) && !isGraphql(endpoint) &&
    options.every(({ name, value }) => API_READ_OPTIONS.has(name) || (name === 'header' && /^accept:/i.test(value)));
}

/** @param {string} endpoint */
function isGraphql(endpoint) {
  return /^graphql\/?(?:[?#]|$)/i.test(endpoint);
}

const FIELDS = new Set(['field', 'raw-field', 'input']);

/** REST met een andere methode dan GET of met velden/invoer (gh stuurt dan POST). @param {ApiCall} api */
function apiMutates({ options }) {
  const method = options.filter(({ name }) => name === 'method').at(-1)?.value ?? 'GET';
  return method.toUpperCase() !== 'GET' || options.some(({ name }) => FIELDS.has(name));
}

/**
 * @typedef {{ name: string, value: string, word: string }} ApiOption `word`: het argument waar de waarde in stond.
 * @typedef {{ endpoint: string, options: ApiOption[], args: readonly string[] }} ApiCall
 */

// Korte opties van gh api met hun lange naam; de lange namen in API_VALUES nemen een waarde.
const API_SHORT = new Map([['X', 'method'], ['H', 'header'], ['f', 'raw-field'], ['F', 'field'], ['q', 'jq'], ['t', 'template'], ['p', 'preview'], ['i', 'include']]);
const API_VALUES = new Set(['method', 'header', 'raw-field', 'field', 'input', 'jq', 'template', 'preview', 'hostname', 'cache']);

/**
 * Leest `gh api`-argumenten: opties (ook clusters als `-iX PUT`, `-XPUT`, `-ftitle=x`, `--method=PUT`) en het endpoint,
 * genormaliseerd zonder host (`https://api.github.com`, GHES `…/api/v3`) en voorloop-`/`.
 * @param {readonly string[]} args
 * @returns {ApiCall}
 */
function apiCall(args) {
  /** @type {ApiOption[]} */
  const options = [];
  let endpoint = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    const next = args[index + 1] ?? '';
    const [long = '', ...inline] = arg.slice(2).split('=');
    const taken = arg.startsWith('--')
      ? pushOption(options, { name: long, value: inline.join('='), word: arg }, inline.length === 0 ? next : null)
      : arg.startsWith('-') && arg.length > 1 ? shortCluster(options, arg, next) : null;
    if (taken === true) index += 1;
    else if (taken === null && endpoint === null) endpoint = arg;
  }
  const normalized = (endpoint ?? '').replace(/^https?:\/\/[^/]*/i, '').replace(/^\/+/, '').replace(/^api\/(?:v3\/)?/i, '');
  return { endpoint: normalized, options, args };
}

/**
 * Voegt een optie toe; neemt `next` als waarde als de optie er een vraagt en er nog geen heeft. Geeft terug of `next` op is.
 * @param {ApiOption[]} options
 * @param {ApiOption} option
 * @param {string | null} next
 */
function pushOption(options, option, next) {
  const takes = next !== null && API_VALUES.has(option.name);
  options.push(takes ? { name: option.name, value: next, word: next } : option);
  return takes;
}

/**
 * Een cluster korte opties; een optie met waarde neemt de rest van het cluster of anders het volgende argument.
 * @param {ApiOption[]} options
 * @param {string} arg
 * @param {string} next
 */
function shortCluster(options, arg, next) {
  for (let index = 1; index < arg.length; index += 1) {
    const flag = arg[index] ?? '';
    const name = API_SHORT.get(flag) ?? flag;
    const rest = arg.slice(index + 1);
    if (API_VALUES.has(name)) return pushOption(options, { name, value: rest, word: arg }, rest === '' ? next : null);
    options.push({ name, value: '', word: arg });
  }
  return false;
}
