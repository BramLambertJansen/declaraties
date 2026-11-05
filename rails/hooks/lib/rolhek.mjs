// Rolhek (framework §8, ADR 0045): beslist per toolgebruik of het mag (allow), de eigenaar moet kiezen (ask) of het
// verboden is (deny). Puur: alles wat van de schijf of git komt, zit in `ctx`, zodat test/hooks/rolhek.test.ts elke regel
// met echte payloads kan bewijzen. De stdin/stdout-kant staat in rails/hooks/rolhek.mjs.
import path from 'node:path';
import { gitSubcommand, parseCommands, programName, splitCommand, writeTargets } from './shell.mjs';
import { A4_MELDING, archiefBron, beslisOvergang, builtReference, documentInfo, documentKind, isArchief, isHerschrijving } from './document-state.mjs';
import { canRecordStatus, TEMPLATE_REPOSITORY } from './task-authority.mjs';
import { automaticRunner } from './runner-authority.mjs';
import { isCoreUiSource, testChangeRisk } from './functional-ui.mjs';
import { staleBranchStart } from './verse-main.mjs';
import { zelfladend } from './zelfladend.mjs';
import { afgeleid, globMatch } from './padtabel.mjs';

/**
 * @typedef {{ gates: string[], testpaden: string[], jsonGates: Record<string, string[]>, gegenereerd: string[],
 *   migraties: string[], schrijfrecht: Record<string, string[]>, mcpLezen: string[], voorReview?: string[] | undefined,
 *   altijdVragen?: string[] | undefined, kritiek?: string[] | undefined, zelfladend?: string[] | undefined, onderhoud?: { repository: string } | undefined,
 *   rolhekEffectHoofdsessie?: 'uit' | 'schaduw' | 'aan', generatoren?: string[] | undefined }} Config
 * `rolhekEffectHoofdsessie` (spec rolhek-vooraf-krimp AC-4, AC-7): ontbreekt → `uit`. `generatoren`: commando's die exact zo een
 * pad onder `gegenereerd` mogen schrijven.
 * De lijsten komen uit `afgeleid` (rails/hooks/lib/padtabel.mjs, ADR 0079); alleen in de oude vorm kunnen ze ontbreken:
 * `voorReview` ontbreekt → elke gate telt als voorReview (faalt dicht). `altijdVragen` ontbreekt → in onderhoud blijft elk
 * voorReview-pad een gate (faalt dicht). `onderhoud`: de repository waarin de onderhoudsmodus geldt (ADR 0045 punt 8).
 * @typedef {{ root: string, cwd: string, config: Config, read: (rel: string) => string | null,
 *   committed: (rel: string) => boolean | 'zonder-origin', isDir: (rel: string) => boolean, branch: string,
 *   authority?: import('./task-authority.mjs').Authority | null, runnerTrusted?: boolean | (() => boolean),
 *   mergeTrusted?: boolean | (() => boolean),
 *   onbekendeRol?: boolean, onderhoud?: boolean, files?: (rel: string) => string[] }} Ctx
 * `files`: bestanden (getrackt en niet-genegeerd) onder een map, repo-relatief; `''` is de hele repo.
 * `onderhoud`: de onderhoudsmodus is actief (vertrouwde configuratie en origin is die repository, ADR 0045 punt 8–9).
 * `onbekendeRol`: een subagent zonder bekende rol; telt als reviewer (alleen lezen).
 * `committed`: staat in de merge-base met het anker of met origin/main; 'zonder-origin' = beide onleesbaar en wel in HEAD (terugval).
 * @typedef {{ deny: string[], ask: string[], context: string[], allow?: boolean }} Decision
 * @typedef {{ kind: 'write' | 'delete', after: string | null, verhuizing?: boolean }} Change
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
  // Spec padtabel (ADR 0079): gates, voorReview, altijdVragen en kritiek komen uit de padtabel (of de oude vorm); beide vormen gooit.
  const lijsten = afgeleid(raw);
  return {
    gates: lijsten.gates,
    testpaden: list('testpaden'),
    gegenereerd: list('gegenereerd'),
    migraties: list('migraties'),
    mcpLezen: list('mcpLezen'),
    jsonGates: record('jsonGates'),
    schrijfrecht: record('schrijfrecht'),
    voorReview: lijsten.voorReview,
    altijdVragen: lijsten.altijdVragen,
    kritiek: lijsten.kritiek,
    zelfladend: optionalList('zelfladend'),
    onderhoud: onderhoudVan(value('onderhoud')),
    rolhekEffectHoofdsessie: effectModus(value('rolhekEffectHoofdsessie')),
    generatoren: optionalList('generatoren'),
  };
}

/** `uit`, `schaduw` of `aan`; ontbrekend is `uit`, elke andere waarde gooit (dicht falen). @param {unknown} found */
function effectModus(found) {
  if (found === undefined) return 'uit';
  if (found === 'uit' || found === 'schaduw' || found === 'aan') return found;
  throw new Error('.claude/gates.json: rolhekEffectHoofdsessie is geen "uit", "schaduw" of "aan"');
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
  // Een onbekende subagent leest geen statusbesluit uit main.
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
    decidePrMerge({ command, role }, ctx, decision);
  }
  else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    decideEdit({ tool, input, role }, context, decision);
    if (decision.context.some((reason) => reason.startsWith('Status uit main:')) && decision.ask.length + decision.deny.length === 0)
      decision.allow = true;
  }
  return decision;
}

/**
 * De beslissing van een Edit voor een pad dat een Bash-commando veranderde (ADR 0066, spec rolhek-effect AC-3): dezelfde
 * rolcontext als `decide`, met `ctx.read` als inhoud van vóór het commando. Een pad in `.git` is voor elke rol deny (R-ROL-03).
 * @param {{ rel: string, change: Change, agentType: string }} target
 * @param {Ctx} ctx
 * @returns {Decision}
 */
export function decideChange({ rel, change, agentType }, ctx) {
  /** @type {Decision} */
  const decision = { deny: [], ask: [], context: [] };
  if (inGitMap(rel)) {
    decision.deny.push(gitMapMelding(rel));
    return decision;
  }
  // Het archief verandert via Bash alleen door een verhuizing met dezelfde naam en inhoud (spec rolhek-vooraf-krimp AC-5, ADR 0080).
  if (/^docs\/(?:adr|specs)\/archief\//.test(rel) && change.verhuizing !== true) {
    decision.deny.push(`${rel}: ${ARCHIEF_MELDING}`);
    return decision;
  }
  const context = ['', 'developer', 'architect'].includes(agentType)
    ? ctx
    : { ...ctx, authority: null, onbekendeRol: !SUBAGENT_ROLES.has(agentType) };
  decideFile({ rel, change, role: roleOf(agentType) }, context, decision);
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

const PR_MERGE_EXACT = /^pnpm pr:merge [1-9]\d*$/;
// Elke andere manier om het mergescript te starten, als vangnet op de tekst zonder `\`, `'` en `"` (zoals bij gh): het
// scriptwoord `pr:merge` overal, en `pr-merge` naast elk programma dat geen bekend leesprogramma is (`/usr/bin/node …`,
// `sh -c "…"`, `env node …`). Vals positief (`grep pr:merge package.json`) is bewust geaccepteerd; lezen kan met de leestools.
const PR_MERGE_SCRIPT = /(?:^|[^\w.-])pr:merge(?=$|[^\w.-])/;
const PR_MERGE_BESTAND = /pr-merge/;
// Alleen programma's die niets starten; `rg --pre`, `less` (LESSOPEN) en een git-alias kunnen dat wel.
const PR_MERGE_LEZERS = new Set(['cat', 'head', 'tail', 'grep', 'wc', 'ls', 'diff', 'stat']);
const PR_MERGE_GIT = new Set(['log', 'show', 'diff', 'blame']);

/** Een segment dat alleen leest: een leesprogramma of `git log|show|diff|blame` zonder `-c`, zonder omgevingsvariabelen. @param {string[]} words */
function leestAlleen(words) {
  const { assignments, argv, pathWrappers } = splitCommand(words);
  const [woord = '', ...args] = argv;
  if (assignments.length + pathWrappers.length > 0) return false;
  if (programName(woord) !== 'git') return PR_MERGE_LEZERS.has(programName(woord));
  const { subcommand, config } = gitSubcommand(args);
  return PR_MERGE_GIT.has(subcommand) && config.length === 0;
}

/** Een glob-woord (`pr-mer*.mjs`, `scripts/kit/pr-*`) dat het mergescript of `pr:merge` kan raken. @param {string} woord */
function globRaaktMerge(woord) {
  if (!/[*?[]/.test(woord)) return false;
  const doelen = ['pr-merge.mjs', 'pr:merge', 'scripts/kit/pr-merge.mjs', './scripts/kit/pr-merge.mjs'];
  return doelen.some((doel) => path.matchesGlob(doel, woord) || path.matchesGlob(path.basename(doel), path.basename(woord)));
}

/** @param {string} command */
function startMergescript(command) {
  const tekst = command.replace(/[\\'"]/g, '');
  if (PR_MERGE_SCRIPT.test(tekst)) return true;
  const segmenten = parseCommands(command);
  if (segmenten.some(({ words }) => !leestAlleen(words) && words.some(globRaaktMerge))) return true;
  return PR_MERGE_BESTAND.test(tekst) && !segmenten.every(({ words }) => leestAlleen(words));
}

/**
 * `pnpm pr:merge <nr>` (ADR 0069 punt 4, spec agent-merge-niet-kritiek AC-4): alleen de hoofdsessie, alleen precies die vorm,
 * en zonder prompt alleen als modus en `MERGE_FILES` uit het anker kloppen; anders een weigering met de reden.
 * @param {{ command: string, role: string }} bash @param {Ctx} ctx @param {Decision} decision
 */
function decidePrMerge({ command, role }, ctx, decision) {
  const tekst = command.trim().replace(/ +/g, ' ');
  const exact = PR_MERGE_EXACT.test(tekst);
  if (!exact && !startMergescript(command)) return;
  if (role !== 'hoofdsessie') decision.deny.push('Mergen via pnpm pr:merge doet alleen de hoofdsessie (ADR 0069)');
  else if (!exact) decision.deny.push('Het mergescript draait alleen als precies `pnpm pr:merge <nummer>` (ADR 0069)');
  else if (decision.deny.length + decision.ask.length > 0) return;
  else if (ctx.cwd === ctx.root && mergeIsTrusted(ctx)) decision.allow = true;
  else
    decision.deny.push(
      'pnpm pr:merge alleen vanuit de repo-root, met modus "niet-kritiek" in het anker en scripts, rails en hostbestanden (package.json, .npmrc, …) gelijk aan het anker (ADR 0069)',
    );
}

/** @param {{ mergeTrusted?: boolean | (() => boolean) }} ctx */
function mergeIsTrusted(ctx) {
  const value = typeof ctx.mergeTrusted === 'function' ? ctx.mergeTrusted() : ctx.mergeTrusted;
  return value === true;
}

/**
 * Hoofdsessie zonder agent_type; een onbekende subagent krijgt de strengste rol, de reviewer (R-ROL-02): alleen lezen.
 * Schrijfwerk gaat via een benoemde rol uit .claude/agents.
 * @param {string} agentType
 */
export function roleOf(agentType) {
  if (agentType === '') return 'hoofdsessie';
  return SUBAGENT_ROLES.has(agentType) ? agentType : 'reviewer';
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
  // Een gearchiveerd ADR wijzigt en verdwijnt voor geen enkele rol, ook niet in een besluit-PR (framework §10).
  const a4Toegestaan = beslisrol && !isArchief(rel) &&
    (isHerschrijving(rel, basis, change.after) || adrMetEigenaarstatusWeg(rel, basis, change));
  const archiefWeg = isArchief(rel) && change.kind === 'delete';
  if (!a4Toegestaan && (['a4', 'herzien'].includes(overgang?.uitslag ?? '') || archiefWeg || adrMetEigenaarstatusWeg(rel, basis, change))) {
    decision.deny.push(`${rel}: ${A4_MELDING}`);
    return;
  }
  // ADR 0046 punt 6: architect en hoofdsessie schrijven de eigenaarstatus in het voorstel; de merge van de eigenaar beslist.
  // ADR 0062 punt 4: ook `gebouwd # #<PR>` zonder SHA in de PR met de implementatie; document-status toetst het PR-nummer.
  const inPrGebouwd = overgang?.uitslag === 'gebouwd' && builtReference(change.after ?? '')?.sha === undefined;
  const eigenaarstatus = beslisrol && (a4Toegestaan || inPrGebouwd || ['besluit', 'vrij'].includes(overgang?.uitslag ?? ''));
  if (!eigenaarstatus && statusZonderBesluit({ rel, change, role }, ctx, decision)) return;
  if (role === 'developer' && developerSpec(rel, change, basis)) {
    decision.deny.push(`${rel}: de developer schrijft geen spec; dat doet de architect (R-WERK-07, ADR 0068 punt 4)`);
    return;
  }
  if (matches(config.testpaden) && ctx.read(rel) !== null) existingTest({ rel, change, role }, ctx, decision);
  decideByRole({ rel, change, role }, ctx, decision);
}

/**
 * ADR 0068 punt 4: de developer maakt, wijzigt, verwijdert of hernoemt geen spec; alleen terugzetten naar de tekst van de
 * basis mag. Een status terug naar `voorstel` blijft bij architect en hoofdsessie (R-WERK-08).
 * @param {string} rel @param {Change} change @param {string | null} basis @returns {boolean} true als het geweigerd wordt
 */
function developerSpec(rel, change, basis) {
  if (!rel.startsWith('docs/specs/')) return false;
  return change.after === null || change.after !== basis;
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
 * Voor een rol die geen eigenaarstatus schrijft: alleen wat main al heeft, en `goedgekeurd` nooit zelf (ADR 0046 punt 6, ADR 0063).
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
 * Een statuswijziging mag alleen de statusregel terugzetten naar wat main al heeft.
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
  } else decision.context.push(`Status uit main: ${rel}: dezelfde status en inhoud als op main`);
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
  const risk = change.after === null ? null : testChangeRisk(before, change.after, rel);
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
  } else if (role === 'developer') {
    decision.deny.push(`${rel} is een bestaande test: de developer wijzigt hem niet; de hoofdsessie doet dat als spec of opdracht het gedrag verandert, de tester na akkoord van de eigenaar als hij fout lijkt (R-TEST-02, ADR 0068 punt 4)`);
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
  if (free || !config.gates.some((glob) => globMatch(glob, rel))) return;
  // ADR 0046 punt 28: buiten voorReview geen prompt, wel een melding; de eigenaar reviewt het in de PR.
  const voorReview = config.voorReview ?? config.gates;
  const melding = ctx.onbekendeRol !== true && (!voorReview.some((glob) => globMatch(glob, rel)) || inOnderhoud(rel, ctx));
  if (melding && isCoreUiSource(rel) && ctx.authority?.repository === TEMPLATE_REPOSITORY)
    decision.context.push(`${rel}: functionele UI (ADR 0056): geen voorafgaand besluit; toepasselijke mini-spec en scope worden in CI en door de eigenaar beoordeeld; beperkte fixes vragen geen nieuwe mini-spec (ADR 0058)`);
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

export { globMatch } from './padtabel.mjs';

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
  decision.deny.push(...staleBranchStart(command));
  // De inhoud van `$(…)` en backticks is zelf een commando; zo vallen ook geneste substituties onder dezelfde regels.
  for (const inner of substitutions(command)) decideBash({ command: inner, role }, ctx, decision);
  const setsGhEnv = zetGhOmgeving(parseCommands(command));
  // `cd .git && …` in hetzelfde commando: de zelfladende toets (AC-3) leest de woorden daarna vanuit die map.
  /** @type {string | null} null: een `cd` naar een map die pas bij het uitvoeren bekend is */
  let cwdNu = ctx.cwd;
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
    zelfladend({ argv, redirects: parsed.redirects, role }, { ...ctx, cwd: cwdNu ?? ctx.root, cwdOnbekend: cwdNu === null }, decision);
    cwdNu = volgendeMap({ argv, expanded: parsed.expanded ?? [] }, cwdNu, ctx.root);
    ghIssue(argv, { role, ctx, setsGhEnv }, decision);
    if (role === 'reviewer') reviewerBash({ assignments, argv, pathWrappers }, parsed.redirects, decision);
    const targets = writeTargets(parsed);
    for (const target of targets.writes) bashTarget({ file: target, kind: 'write', role }, ctx, decision);
    for (const target of targets.deletes) bashTarget({ file: target, kind: 'delete', role }, ctx, decision);
    const eigenDoelen = targets.indexOnly === true ? parsed.redirects : targets.writes;
    decision.deny.push(...archiefViaBash(argv, { writes: eigenDoelen, redirects: parsed.redirects.length }, ctx));
    for (const target of targets.trees ?? []) treeTarget({ file: target, kind: 'write', role }, ctx, decision);
    for (const target of targets.deletes) treeTarget({ file: target, kind: 'delete', role }, ctx, decision);
  }
}

/**
 * De map na `cd`/`pushd`. Een doel dat pas bij het uitvoeren bekend is (geen doel, `~`, `-`, `$`, backtick, substitutie):
 * null, en de zelfladende toets valt dicht (AC-3). `$(git rev-parse --show-toplevel)` is de root.
 * @param {{ argv: readonly string[], expanded: readonly string[] }} commando @param {string | null} cwd @param {string} root
 * @returns {string | null}
 */
function volgendeMap({ argv, expanded }, cwd, root) {
  if (!['cd', 'pushd'].includes(programName(argv[0] ?? ''))) return cwd;
  const doel = argv.slice(1).find((arg) => arg === '-' || !arg.startsWith('-'));
  if (doel === '$(git rev-parse --show-toplevel)') return root;
  // Zonder doel, `~` of `-`: de home-map of de vorige map, pas bij het uitvoeren bekend; net als `$`, backtick of substitutie.
  if (doel === undefined || doel === '-' || doel.startsWith('~') || expanded.includes(doel) || /[$`]/.test(doel)) return null;
  return cwd === null ? null : path.resolve(cwd, doel);
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

const ARCHIEF_MELDING = 'het archief is onwijzigbaar; via Bash alleen `git mv docs/adr/<naam> docs/adr/archief/` of `git mv docs/specs/<naam> docs/specs/archief/` met dezelfde naam (framework §10, R-CI-06)';
const VERPLAATSERS = new Set(['cp', 'mv', 'install', 'ln']);

/**
 * Een Bash-schrijfactie op een gearchiveerd ADR of gearchiveerde spec (ook een nieuw bestand of een map als doel) is voor elke rol
 * verboden; de enige uitzondering is `git mv` van één document naar een nog niet bestaand `archief/`-pad met dezelfde naam
 * (PR 5, ADR 0053, ADR 0080), en
 * alleen voor het doel van `git mv` zelf, nooit voor een redirect. Inhoud en status toetst CI.
 * @param {readonly string[]} argv
 * @param {{ writes: readonly string[], redirects: number }} targets `redirects`: zoveel eerste `writes` zijn redirect-doelen.
 * @param {Ctx} ctx
 */
function archiefViaBash(argv, { writes, redirects }, ctx) {
  const [word = '', ...args] = argv;
  const program = programName(word);
  const gitMv = program === 'git' && gitSubcommand(args).subcommand === 'mv';
  const operands = (gitMv ? gitSubcommand(args).rest : VERPLAATSERS.has(program) ? args : []).filter((arg) => !arg.startsWith('-'));
  return writes.flatMap((file, index) => {
    const rel = relative(ctx, file);
    if (rel === null) return [];
    const eigen = index >= redirects;
    const sources = operands.filter((operand) => operand !== file);
    // Ook `cp -t map`/`--target-directory=map`: het doel staat dan niet tussen de operanden.
    const isMap = eigen && sources.length > 0 && (file.endsWith('/') || ctx.isDir(rel));
    const doelen = isMap ? sources.map((source) => `${rel}/${path.basename(source)}`) : [rel];
    return doelen.filter((doel) => /^docs\/(?:adr|specs)\/archief\//.test(doel)).flatMap((doel) => {
      const verplaatsing = eigen && gitMv && sources.length === 1 && ctx.read(doel) === null &&
        relative(ctx, sources[0] ?? '') === archiefBron(doel);
      return verplaatsing ? [] : [`${doel}: ${ARCHIEF_MELDING}`];
    });
  });
}

/**
 * Een map als verwijder- of recursief schrijfdoel (`rm -r test`, `find . -delete`, `mv test x`, `cp -r x test`) telt voor elk
 * beschermd pad en document eronder (framework §8, R-ROL-08). Stopt bij de eerste weigering; meldingen alleen uniek.
 * @param {{ file: string, kind: 'write' | 'delete', role: string }} target
 * @param {Ctx} ctx
 * @param {Decision} decision
 */
function treeTarget({ file, kind, role }, ctx, decision) {
  if (ctx.files === undefined || inGitMap(file)) return;
  const scoped = scopedContext(ctx, file);
  const resolved = treeRoot(scoped, file);
  if (resolved === null) return;
  const { config } = scoped;
  const globs = [...config.gates, ...config.testpaden, ...config.migraties, ...config.gegenereerd, ...Object.keys(config.jsonGates)];
  const weigerGlobs = [...config.gegenereerd, ...config.migraties];
  /** @type {Decision} */
  const found = { deny: [], ask: [], context: [] };
  for (const rel of ctx.files(resolved)) {
    if (isArchief(rel)) found.deny.push(`${rel}: ${ARCHIEF_MELDING}`);
    if (found.deny.length > 0) break;
    if (!globs.some((glob) => globMatch(glob, rel)) && documentKind(rel) === null) continue;
    // Na een vraag telt alleen nog wat altijd weigert (gegenereerd, gecommitte migratie): elk bestand lezen kost te veel tijd.
    if (found.ask.length > 0 && !weigerGlobs.some((glob) => globMatch(glob, rel))) continue;
    decideFile({ rel, change: { kind, after: null }, role }, scoped, found);
  }
  const meer = found.context.length - MAX_TREE_MELDINGEN;
  if (meer > 0) found.context = [...found.context.slice(0, MAX_TREE_MELDINGEN), `… en ${String(meer)} meldingen meer onder ${file}`];
  for (const key of /** @type {const} */ (['deny', 'ask', 'context'])) {
    for (const message of found[key]) if (!decision[key].includes(message)) decision[key].push(message);
  }
}

const MAX_TREE_MELDINGEN = 5;

/**
 * De map onder de repo die een doel dekt: `''` als het doel de repo zelf of een map erboven is (`rm -rf ..`, `find / -delete`),
 * null als het geen map is of naast de repo ligt.
 * @param {Ctx} ctx
 * @param {string} file
 */
function treeRoot(ctx, file) {
  const absolute = path.resolve(ctx.cwd, file);
  const boven = path.relative(absolute, ctx.root);
  if (!boven.startsWith('..') && !path.isAbsolute(boven)) return '';
  const resolved = path.relative(ctx.root, absolute).split(path.sep).join('/');
  return resolved.startsWith('..') || path.isAbsolute(resolved) || !ctx.isDir(resolved) ? null : resolved;
}

const ALL = Number.POSITIVE_INFINITY;
const GIT_DIFF_FLAGS = ['--stat', '--shortstat', '--numstat', '--name-only', '--name-status', '--no-color', '-w', '--ignore-all-space'];
/**
 * Commando's van de reviewer met een vaste optielijst, op patroon van de kop (git, gh pr, pnpm-scripts, feiten); zelfde
 * vorm als REVIEWER_READS. Positionele woorden zijn refs, paden, PR-nummers of feitensecties; elke onbekende optie
 * (`--outputFile`, `-u`, `--config`, `--web`, `-R`) wordt geweigerd.
 * @type {{ pattern: RegExp, read: { flags: string[], values: string[], positional: number, paths?: boolean, count?: boolean } }[]}
 */
const REVIEWER_COMMANDS = [
  { pattern: /^pnpm (?:check:[a-z-]+|test(?::(?:unit|db|e2e))?|gate:(?:fast|slow))$/, read: { flags: [], values: [], positional: ALL, paths: true } },
  { pattern: /^git diff$/, read: { flags: [...GIT_DIFF_FLAGS, '--cached', '--staged', '--merge-base'], values: [], positional: ALL, paths: true } },
  { pattern: /^git log$/, read: { flags: [...GIT_DIFF_FLAGS, '--oneline', '-p', '--patch', '--no-merges', '--merges', '--first-parent', '--reverse', '--graph', '--decorate', '--follow'], values: ['-n', '--max-count', '--since', '--until', '--author', '--grep'], positional: ALL, paths: true, count: true } },
  { pattern: /^git show$/, read: { flags: [...GIT_DIFF_FLAGS, '--oneline', '--no-patch', '-s'], values: [], positional: ALL, paths: true } },
  { pattern: /^git status$/, read: { flags: ['--short', '-s', '--porcelain', '-b', '--branch'], values: [], positional: ALL, paths: true } },
  { pattern: /^gh pr view$/, read: { flags: ['--comments'], values: ['--json', '--jq'], positional: 1 } },
  { pattern: /^gh pr diff$/, read: { flags: ['--name-only', '--patch'], values: [], positional: 1 } },
  { pattern: /^gh pr checks$/, read: { flags: ['--required'], values: ['--json', '--jq'], positional: 1 } },
  // De feiten voor stap 1 van .claude/agents/reviewer.md (gates, specs, fase, hoofdstuk <n>); feiten.mjs schrijft niets.
  { pattern: /^node scripts\/kit\/feiten\.mjs$/, read: { flags: ['--alle', '--json'], values: [], positional: ALL } },
];

/**
 * Leescommando's van de reviewer met een vaste optielijst (spec rolhek-lezen/AC-1). `values`: opties die altijd het volgende
 * woord als waarde nemen (pflag), ook als dat met `-` begint; `positional`: hoeveel losse woorden; `paths`: paden na `--`.
 * @type {Record<string, { flags: string[], values: string[], positional: number, paths?: boolean, count?: boolean }>}
 */
const REVIEWER_READS = {
  'git ls-files': { flags: [], values: [], positional: 0, paths: true },
  'gh issue view': { flags: ['--comments'], values: ['--json', '--jq'], positional: 1 },
  'gh issue list': { flags: [], values: ['--label', '--state', '--limit', '--json', '--jq'], positional: 0 },
  'gh run view': { flags: ['--log', '--log-failed'], values: ['--json', '--jq', '--job'], positional: 1 },
  'gh run list': { flags: [], values: ['--branch', '--workflow', '--limit', '--json', '--jq'], positional: 0 },
  'pnpm leespad': { flags: ['--json'], values: ['--ref', '--basis'], positional: 0 },
  'pnpm meting': { flags: ['--json', '--pr-tabel', '--trend', '--help'], values: ['--branch', '--sessie'], positional: 0 },
};
// Geen `$`, backtick, `;`, spatie of aanhalingsteken: de shell van pnpm voert niets uit een waarde uit.
const SAFE_VALUE = /^[A-Za-z0-9_./,:-]+$/;
// Een positioneel woord mag ook een ref met `~` of `^` zijn (`HEAD~1`, `HEAD^:pad`).
const SAFE_REF = /^[A-Za-z0-9_./,:~^-]+$/;

/**
 * Een los woord of pad van de reviewer blijft binnen de repository (reviewer-opties/AC-3): niet `/` of `~` vooraan en geen
 * segment `..`, ook niet na `<ref>:`, en geen URL (`gh pr view <url>` leest een andere repo). Anders toont `git diff /dev/null .env` (impliciet --no-index) een bestand buiten de leesregels.
 * @param {string} word
 */
function insideRepo(word) {
  return SAFE_REF.test(word) && !/^[/~]/.test(word) && !word.includes('://') && !word.split(/[/:]/).includes('..');
}
// `--jq` alleen met paden (`.title`, `.a.b,.c`): geen jq-functies zoals `env`, die tokens uit de omgeving tonen.
const JQ_PATHS = /^\.[A-Za-z0-9_.]*(?:,\.[A-Za-z0-9_.]*)*$/;

/**
 * Waarom de reviewer dit commando niet mag, of null als het mag (framework §8, spec rolhek-lezen).
 * @param {readonly string[]} argv
 * @param {readonly string[]} redirects
 */
function reviewerRefusal(argv, redirects) {
  const head = argv[0] === 'gh' ? argv.slice(0, 3).join(' ') : argv.slice(0, 2).join(' ');
  const generic = `reviewer: alleen lezen (\`${argv.slice(0, 3).join(' ')}\` mag niet; framework §8); zoeken en tellen: gebruik de Grep-tool`;
  if (redirects.length > 0) return generic;
  const read = REVIEWER_READS[head] ?? REVIEWER_COMMANDS.find(({ pattern }) => pattern.test(head))?.read;
  if (read === undefined) return generic;
  if (readArgsAllowed(argv.slice(head.split(' ').length), read)) return null;
  const opties = [...read.flags, ...read.values.map((value) => `${value} <waarde>`)];
  const lijst = opties.length > 0 ? opties.join(', ') : 'geen opties; paden na --';
  return `reviewer: \`${head}\` alleen met: ${lijst}; waarden alleen [A-Za-z0-9_./,:-] (spec rolhek-lezen; framework §8)`;
}

/**
 * Pad-wrapper, variabele vóór het commando (`X=… cmd`, `env X=… cmd`) of een commando buiten de leeslijst (rolhek-lezen/AC-4).
 * @param {{ assignments: readonly string[], argv: readonly string[], pathWrappers: readonly string[] }} command
 * @param {readonly string[]} redirects
 * @param {Decision} decision
 */
function reviewerBash({ assignments, argv, pathWrappers }, redirects, decision) {
  if (pathWrappers.length > 0) decision.deny.push(`reviewer: een pad-wrapper (\`${pathWrappers[0] ?? ''}\`) is verboden; framework §8`);
  if (assignments.length > 0)
    decision.deny.push(`reviewer: geen variabele vóór het commando (\`${(assignments[0] ?? '').split('=')[0] ?? ''}\`); framework §8`);
  const refusal = reviewerRefusal(argv, redirects);
  if (refusal !== null) decision.deny.push(refusal);
}

/**
 * @param {readonly string[]} args
 * @param {{ flags: string[], values: string[], positional: number, paths?: boolean, count?: boolean }} read
 */
function readArgsAllowed(args, read) {
  let positional = 0;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    // Na `--` alleen paden: een woord met `-` vooraan geeft pnpm aan het script door, en dat kan het als optie lezen.
    if (arg === '--' && read.paths === true) return args.slice(index + 1).every((path) => insideRepo(path) && !path.startsWith('-'));
    if (read.values.includes(arg)) {
      index += 1;
      if (!SAFE_VALUE.test(args[index] ?? '') || (arg === '--jq' && !JQ_PATHS.test(args[index] ?? ''))) return false;
    } else if (arg.startsWith('-')) {
      // `-<n>` (git log -5) is een aantal, geen optie.
      if (!read.flags.includes(arg) && !(read.count === true && /^-\d+$/.test(arg))) return false;
    } else if (positional >= read.positional || !insideRepo(arg)) return false;
    else positional += 1;
  }
  return true;
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
 * `pnpm rolhek:overnemen` (ook via `run`) of het script rechtstreeks met node.
 * @param {string} program
 * @param {readonly string[]} args
 */
function isOvernemen(program, args) {
  if (program === 'pnpm') return pnpmCommand(args)[0] === 'rolhek:overnemen';
  return program === 'node' && args.some((arg) => /(?:^|\/)scripts\/kit\/rolhek-overnemen\.mjs$/.test(arg));
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
  if (program === 'git' && role === 'hoofdsessie') decision.ask.push(...gitPersistsProgram(args));
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
  if (isOvernemen(program, args)) {
    const melding = 'rolhek:overnemen heft een overtreding van de toets op effect op (spec rolhek-effect AC-5); de eigenaar beslist';
    if (role === 'hoofdsessie') decision.ask.push(melding);
    else decision.deny.push(`subagent: ${melding}`);
  }
  if (role !== 'hoofdsessie' && isNewResource(program, args))
    decision.deny.push('pnpm new:resource: alleen de hoofdsessie (ADR 0047 punt 6); wat hij schrijft, ziet het rolhek niet');
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
  found.push(...gitWriteOptions(subcommand, rest));
  if (role === 'hoofdsessie') return found;
  if (subcommand === 'push' || subcommand === 'merge' || subcommand === 'rebase')
    found.push(`subagent: git ${subcommand} doet de hoofdsessie`);
  if (subcommand === 'reset' && rest.includes('--hard')) found.push('subagent: git reset --hard is verboden');
  if (subcommand.startsWith('credential')) found.push('subagent: git credential geeft tokens vrij; verboden');
  found.push(...gitPersistsProgram(args));
  return found;
}

// `--output` en elke afkorting ervan (git accepteert een unieke prefix); `--op…` tot `--open-files-in-pager` bij git grep.
/**
 * `arg` is `full` of een afkorting ervan vanaf `min` tekens (git accepteert een unieke prefix), met of zonder `=waarde`.
 * @param {string} arg
 * @param {string} full
 * @param {number} min
 */
function abbreviates(arg, full, min) {
  const name = arg.split('=')[0] ?? '';
  return name.length >= min && full.startsWith(name);
}

// Git-subcommando's met de diff-optie `--output=<bestand>`.
const DIFF_OUTPUT = new Set(['diff', 'log', 'show', 'diff-tree', 'diff-index', 'diff-files', 'range-diff', 'whatchanged', 'reflog', 'stash']);

/**
 * Opties waarmee een leescommando een bestand schrijft of een programma start, voor elke rol (spec rolhek-lezen/AC-2):
 * `--output` bij de diff-familie (git staat daar geen afkorting toe; de afkortingen weigeren we defensief),
 * `git format-patch -o` (ook in een cluster, `-ko`)/`--output-directory`/`--output` en `git grep -O`/`--open-files-in-pager`, ook in een cluster (`-nOvim`).
 * Bekend vals-positief: `--output` als waarde van een andere optie (`git log -S --output`).
 * @param {string} subcommand
 * @param {readonly string[]} rest
 */
function gitWriteOptions(subcommand, rest) {
  if (DIFF_OUTPUT.has(subcommand) && rest.some((arg) => abbreviates(arg, '--output', 3)))
    return [`git ${subcommand} --output schrijft een bestand buiten het rolhek om; verboden, voor elke rol`];
  if (subcommand === 'format-patch' && rest.some((arg) => /^-[^-]*o/.test(arg) || abbreviates(arg, '--output-directory', 3)))
    return ['git format-patch -o/--output schrijft bestanden buiten het rolhek om; verboden, voor elke rol'];
  if (subcommand === 'grep' && grepOpensFiles(rest))
    return ['git grep -O/--open-files-in-pager start een programma; verboden, voor elke rol'];
  return [];
}

// Korte opties van git grep die een waarde nemen: de rest van het cluster of het volgende woord is die waarde.
const GREP_VALUE_FLAGS = 'efABCm';

/**
 * `-O` in een cluster (`-O`, `-nOvim`, `-iO`) of `--op…` tot `--open-files-in-pager`; `-eFOO` en `-e -O` zijn een patroon.
 * @param {readonly string[]} rest
 */
function grepOpensFiles(rest) {
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index] ?? '';
    if (arg === '--') return false;
    if (abbreviates(arg, '--open-files-in-pager', 4)) return true;
    const cluster = /^-[^-]/.test(arg) ? grepCluster(arg.slice(1)) : 'geen';
    if (cluster === 'open') return true;
    if (cluster === 'waarde-volgt') index += 1;
  }
  return false;
}

/**
 * Leest een cluster korte opties van git grep tot de eerste optie die een waarde neemt.
 * @param {string} cluster
 * @returns {'open' | 'waarde-volgt' | 'geen'}
 */
function grepCluster(cluster) {
  for (let at = 0; at < cluster.length; at += 1) {
    const flag = cluster[at] ?? '';
    if (flag === 'O') return 'open';
    if (GREP_VALUE_FLAGS.includes(flag)) return at === cluster.length - 1 ? 'waarde-volgt' : 'geen';
  }
  return 'geen';
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

// De hooks lezen besluiten en autoRunner uit de lokale ref origin/main (ADR 0046). Een eigen commit of een andere
// remote onder die naam zou bevoegdheid geven die nooit is toegekend; de CI-guard leest main bij GitHub en blijft de grens.
const TRUSTED_CONFIG = /^(?:remote\.origin\.|url\.|include\.|includeif\.)/i;
const TRUSTED_NAME = /^(?:refs\/(?:heads|tags)\/)?origin\/(?:main|HEAD)$/;
const TRUSTED_DESTINATION = /:\+?(?:refs\/remotes\/)?origin\/(?:main|HEAD|\*)$/;
// Omgevingsvariabelen die git een andere config, repository of werkmap geven (`GIT_CONFIG_COUNT`, `GIT_DIR`, ...).
const GIT_ENV = /^GIT_(?:CONFIG\w*|DIR|WORK_TREE|TEMPLATE_DIR)(?:=|$)/;
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

// `git config` dat alleen leest (allowlist): een leesactie, of de oude vorm met precies één sleutel. Elke andere optie of
// vorm telt als schrijven; een sleutel als core.fsmonitor of diff.external laat git later een programma starten, ook in
// de git-aanroepen van de hooks, die buiten de sandbox draaien.
const CONFIG_READ_ACTIONS = new Set(['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--get-color', '--get-colorbool', '--list', '-l']);
const CONFIG_READ_SUBCOMMANDS = new Set(['get', 'list']);
const CONFIG_READ_FLAGS = new Set(['--show-origin', '--show-scope', '--null', '-z', '--name-only', '--bool', '--int', '--bool-or-int', '--bool-or-str', '--path', '--expiry-date', '--no-type', '--global', '--system', '--local', '--worktree', '--includes', '--no-includes', '--fixed-value', '--all', '--regexp']);
const CONFIG_READ_VALUE_FLAGS = new Set(['--type', '-t', '--default', '--file', '-f', '--blob', '--url']);

const CONFIG_WRITE =
  'git config schrijft de git-configuratie; een sleutel als core.fsmonitor start later een programma buiten de sandbox. Subagent: alleen lezen (--get, --list, get, list); hoofdsessie: de eigenaar beslist (ADR 0045)';

/**
 * Git-aanroepen die blijvend een programma in de repository kunnen zetten dat de hooks later buiten de sandbox starten:
 * `git config` dat schrijft, een alias via `-c` (het rolhek ziet dan niet welk subcommando draait) en `git init` met een
 * template (zet hooks in .git/hooks). Subagent: weigeren; hoofdsessie: vragen.
 * @param {readonly string[]} args
 * @returns {string[]}
 */
export function gitPersistsProgram(args) {
  const { subcommand, rest, config } = gitSubcommand(args);
  /** @type {string[]} */
  const found = [];
  if (subcommand === 'config' && !configReadsOnly(rest)) found.push(CONFIG_WRITE);
  if (config.some((setting) => /^alias\./i.test(setting)))
    found.push('git -c alias.…: het rolhek ziet niet welk subcommando de alias start; roep het subcommando zelf aan');
  const template = rest.some((arg) => abbreviates(arg, '--template', 3)) || config.some((setting) => /^init\.templatedir/i.test(setting));
  if (subcommand === 'init' && template) found.push('git init met een template zet hooks in .git/hooks; verboden zonder de eigenaar');
  return found;
}

/**
 * Of `git config <rest>` alleen leest; onbekende opties en vormen tellen als schrijven (fail closed).
 * @param {readonly string[]} rest
 */
export function configReadsOnly(rest) {
  let action = false;
  let index = 0;
  // Git leest opties alleen vóór de eerste operand; alles erna is operand (`git config k v -l` zet k).
  for (; index < rest.length; index += 1) {
    const arg = rest[index] ?? '';
    const name = arg.split('=')[0] ?? '';
    if (arg === '--') {
      index += 1;
      break;
    }
    if (!arg.startsWith('-')) break;
    if (CONFIG_READ_ACTIONS.has(arg)) action = true;
    else if (CONFIG_READ_VALUE_FLAGS.has(name)) index += arg.includes('=') ? 0 : 1;
    else if (!CONFIG_READ_FLAGS.has(arg)) return false;
  }
  const operands = rest.slice(index);
  if (action) return true;
  const [first = ''] = operands;
  if (CONFIG_READ_SUBCOMMANDS.has(first)) return true;
  // De oude vorm leest met precies één sleutel; een sleutel heeft altijd een punt, de subcommando's (set, edit, …) niet.
  return operands.length === 1 && first.includes('.');
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
    // In een app heeft `pnpm app:init` de onderhoud-regel verwijderd; leerpunten gaan dan naar de template (ADR 0059).
    const reden = leerpuntAfwijking(args, ctx.config.onderhoud?.repository ?? TEMPLATE_REPOSITORY, setsGhEnv);
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
 * Voor elke rol, ook de hoofdsessie: zelfreview, PR-labels, mergen (WS-04), aliassen en onleesbare API-invoer.
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
  if (zetLabel(args)) found.push('een PR-label zet alleen de eigenaar, voor elke rol (R-ROL-08)');
  if (api !== null) found.push(...apiUnreadable(api, expanded));
  if (api !== null && apiWritesSelfReview(api)) found.push('gh api: labels, reviews en statussen zet alleen de eigenaar');
  if ((group === 'pr' && action === 'merge') || (api !== null && apiMerges(api)))
    found.push('mergen (ook auto-merge) doet alleen de eigenaar, voor elke rol (WS-04)');
  return found;
}

// `-l`, ook in een cluster (`-dl`, `-lbug`), en `--label`, `--add-label`, `--remove-label` (pflag kent geen afkortingen).
const PR_LABEL = /^(?:-[a-zA-Z]*l|--(?:label|add-label|remove-label)(?:=|$))/;
// `gh issue edit` labelt ook een PR (zelfde nummers); `gh issue create --label leerpunt` valt eronder niet (ADR 0059).
const ISSUE_LABEL = /^--(?:add-label|remove-label)(?:=|$)/;

/**
 * Zet of haalt het commando een label op een PR: `gh pr create|new|edit` of `gh issue edit` met een label-optie, waar die
 * ook staat (ook vóór de actie, `gh pr -l x create`). De actie komt uit `ghCommandWords`, zoals cobra hem vindt; een
 * optiewaarde die als woord meetelt (`-dl x`), maakt de toets alleen strenger.
 * @param {readonly string[]} args
 */
function zetLabel(args) {
  const [group = '', ...rest] = ghCommandWords(args);
  if (group === 'pr' && rest.some((word) => ['create', 'new', 'edit'].includes(word))) return args.some((arg) => PR_LABEL.test(arg));
  return group === 'issue' && rest.includes('edit') && args.some((arg) => ISSUE_LABEL.test(arg));
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
