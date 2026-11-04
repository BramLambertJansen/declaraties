// De hook-gebeurtenissen van de toets op effect (ADR 0066, spec rolhek-effect AC-1 t/m AC-7).
import path from 'node:path';
import {
  agentOpnamen,
  legVast,
  legVensterVast,
  leesOpname,
  overtredingen,
  ruimOp,
  toets,
  toetsHoofdsessie,
  veranderdePaden,
  werkAgentBij,
  werkLijstBij,
  wisOpname,
} from './effect.mjs';
import { MAX_MS, momentopname } from './effect-snapshot.mjs';
import { meet, uitkomstVan } from './effect-meting.mjs';
import { decide } from './rolhek.mjs';

/**
 * @typedef {import('./effect.mjs').Repo} Repo
 * @typedef {import('./effect.mjs').Overtreding} Overtreding
 * @typedef {import('./effect-snapshot.mjs').Snapshot} Snapshot
 * @typedef {{ stdout?: string, stderr?: string, exit?: number }} Uitslag
 */

/** @param {unknown} payload @param {string} key */
export function veld(payload, key) {
  if (typeof payload !== 'object' || payload === null || !(key in payload)) return '';
  const value = /** @type {Record<string, unknown>} */ (payload)[key];
  return typeof value === 'string' ? value : '';
}

/** Wie het commando draait: de subagent (agent_id) of de hoofdsessie. @param {unknown} payload */
export function actorVan(payload) {
  const agentType = veld(payload, 'agent_type');
  const sessie = veld(payload, 'session_id');
  if (agentType === '') return { actor: `hoofd:${sessie}`, agentType, sessie };
  return { actor: veld(payload, 'agent_id') || `${sessie}:${agentType}`, agentType, sessie };
}

/** Zonder momentopname van vóór (AC-6): elk afwijkend pad telt. @param {Snapshot} na @returns {Snapshot} */
function zonderVoor(na) {
  const vast = Object.entries(na.paden).filter(([rel]) => VAST.some((voor) => rel === voor || rel.startsWith(`${voor}/`)));
  return { head: na.head, refs: na.refs, paden: Object.fromEntries(vast), index: na.index, genegeerd: na.genegeerd.filter((rel) => rel.endsWith('/')), teGroot: false };
}

// De vaste lijst van AC-1 wijkt altijd "af"; zonder vergelijkingspunt telt alleen wat echt afwijkt van HEAD.
const VAST = ['.git', '.claude/settings.local.json', '.claude/hooks/.cache'];

/** @param {readonly Overtreding[]} lijst */
export function lijstTekst(lijst) {
  return lijst
    .map((o) => `- ${o.rel ?? '(hele werkmap: de toets kwam niet rond)'} (${o.rol}): ${o.reden}${o.commando === '' ? '' : ` · ${o.commando.slice(0, 120)}`}`)
    .join('\n');
}

const UITWEG = 'De hook zet niets terug. Zet het pad terug naar de staat van vóór het commando, of laat de eigenaar de wijziging overnemen met `pnpm rolhek:overnemen <pad>` (spec rolhek-effect AC-5).';

/** Te groot of te traag (AC-7): een overtreding zonder pad. @param {{ actor: string, agentType: string, commando: string }} wie @returns {Overtreding} */
function nietRond(wie) {
  return { rel: null, actor: wie.actor, rol: wie.agentType || 'hoofdsessie', commando: wie.commando, reden: 'meer dan 5000 paden of langer dan 5 s: de toets valt dicht (AC-7)', voor: null };
}

/**
 * Vergelijkt `voor` met nu voor deze actor en werkt de lijst bij.
 * @param {Repo} repo @param {{ voor: Snapshot | null | undefined, start: number }} basis @param {{ actor: string, agentType: string, commando: string }} wie
 */
function vergelijk(repo, basis, wie) {
  const begin = repo.now();
  const na = momentopname(repo);
  if (na.teGroot || basis.voor === null || repo.now() - begin > MAX_MS)
    return { nieuw: [nietRond(wie)], meldingen: [], paden: [], lijst: werkLijstBij(repo, { nieuw: [nietRond(wie)], nu: null }) };
  const zonder = basis.voor === undefined;
  const uitslag = toets(repo, { voor: basis.voor ?? zonderVoor(na), na, start: basis.start }, wie);
  const meldingen = zonder ? ['rolhek-effect: geen momentopname van vóór het commando; elk afwijkend pad getoetst (AC-6)', ...uitslag.meldingen] : uitslag.meldingen;
  return { ...uitslag, meldingen, lijst: werkLijstBij(repo, { nieuw: uitslag.nieuw, nu: na }) };
}

/** @param {string} reden @returns {Uitslag} */
const blok = (reden) => ({ stdout: JSON.stringify({ decision: 'block', reason: reden }) });

/** De vlag van AC-7: `uit`, `schaduw` of `aan`. @param {Repo} repo */
const modus = (repo) => repo.ctx.config.rolhekEffectHoofdsessie ?? 'uit';

/** Wat het rolhek vooraf over dit commando besliste, om naast de schaduwbeslissing te leggen (AC-7). @param {unknown} payload @param {Repo} repo */
function voorafUitkomst(payload, repo) {
  try {
    return uitkomstVan(decide({ tool_name: 'Bash', tool_input: objectVeld(payload, 'tool_input') ?? {} }, repo.ctx));
  } catch {
    return 'onbekend';
  }
}

/** Een blokkade op effect, geteld (AC-7). @param {Repo} repo @param {{ sessie: string, agentType: string }} wie @param {string} reden */
function telBlok(repo, wie, reden) {
  meet(repo, wie, { e: 'EffectBlokkade', n: 1 });
  return blok(reden);
}

/**
 * Haar venster altijd (AC-2); als dader alleen met de vlag `schaduw` of `aan` (AC-4, AC-7).
 * @param {Repo} repo @param {{ opname: ReturnType<typeof leesOpname>, start: number }} basis
 * @param {{ actor: string, agentType: string, sessie: string, commando: string, id: string, event: string, mislukt: boolean }} wie
 * @returns {Uitslag}
 */
function hoofdsessiePost(repo, { opname, start }, wie) {
  const voor = opname?.snap;
  const begin = repo.now();
  const na = momentopname(repo);
  const paden = voor === undefined || voor === null ? [] : veranderdePaden(repo, { voor, na, start });
  legVensterVast(repo, { actor: wie.actor, start, eind: repo.now(), paden });
  if (modus(repo) === 'uit') return {};
  const vooraf = voorafNaam(opname?.vooraf);
  // Geen opname van vóór (pre faalde open), te groot of te traag (rolhek-effect AC-7): in schaduw een teller, met `aan` dicht.
  if (voor === undefined || voor === null || na.teGroot || repo.now() - begin > MAX_MS) return hoofdsessieNietRond(repo, vooraf, wie);
  return hoofdsessieAchteraf(repo, { voor, na, vooraf }, wie);
}

/** @param {unknown} waarde @returns {'deny' | 'ask' | 'melding' | 'door' | 'onbekend'} */
const voorafNaam = (waarde) => (waarde === 'deny' || waarde === 'ask' || waarde === 'melding' || waarde === 'door' ? waarde : 'onbekend');

/**
 * De toets kwam niet rond voor de hoofdsessie: schaduw telt een `deny` zonder pad; `aan` zet een overtreding zonder pad op de
 * lijst en blokkeert (na een geslaagd commando).
 * @param {Repo} repo @param {'deny' | 'ask' | 'melding' | 'door' | 'onbekend'} vooraf
 * @param {{ actor: string, agentType: string, sessie: string, commando: string, id: string, event: string, mislukt: boolean }} wie
 * @returns {Uitslag}
 */
function hoofdsessieNietRond(repo, vooraf, wie) {
  meet(repo, wie, { e: 'Schaduw', id: wie.id, vooraf, achteraf: 'deny', paden: [] });
  const reden = `rolhek-effect: ${nietRond(wie).reden}`;
  if (modus(repo) === 'schaduw') return context(wie.event, [`rolhek-effect (schaduw, AC-4): ${nietRond(wie).reden}`]);
  werkLijstBij(repo, { nieuw: [nietRond(wie)], nu: null });
  return wie.mislukt ? context(wie.event, [reden]) : telBlok(repo, wie, `${reden}\n${UITWEG}`);
}

/**
 * De hoofdsessie na een Bash-commando (AC-4): in schaduwmodus alleen een melding en een teller; met `aan` een blokkade bij
 * `deny`, de open lijst bij `deny` en `ask`, en meldingen als context.
 * @param {Repo} repo @param {{ voor: Snapshot, na: Snapshot, vooraf: 'deny' | 'ask' | 'melding' | 'door' | 'onbekend' }} basis
 * @param {{ actor: string, agentType: string, sessie: string, commando: string, id: string, event: string, mislukt: boolean }} wie
 * @returns {Uitslag}
 */
function hoofdsessieAchteraf(repo, basis, wie) {
  const na = basis.na;
  const uitslag = toetsHoofdsessie(repo, { voor: basis.voor, na }, wie);
  const achteraf = uitslag.nieuw.some((o) => o.blokkeer) ? 'deny' : uitslag.nieuw.length > 0 ? 'ask' : uitslag.meldingen.length > 0 ? 'melding' : 'door';
  meet(repo, wie, { e: 'Schaduw', id: wie.id, vooraf: basis.vooraf, achteraf, paden: uitslag.nieuw.map((o) => o.rel ?? '') });
  const tekst = lijstTekst(uitslag.nieuw);
  if (modus(repo) === 'schaduw')
    return context(wie.event, uitslag.nieuw.length === 0 ? [] : [`rolhek-effect (schaduw, AC-4): met de vlag aan zou dit commando op de open lijst komen:\n${tekst}`]);
  werkLijstBij(repo, { nieuw: uitslag.nieuw.map((o) => ({ rel: o.rel, actor: o.actor, rol: o.rol, commando: o.commando, reden: o.reden, voor: o.voor })), nu: na });
  if (uitslag.nieuw.length === 0) return context(wie.event, uitslag.meldingen);
  const reden = `rolhek-effect: dit commando van de hoofdsessie veranderde paden buiten haar rol:\n${tekst}\n${UITWEG}`;
  return achteraf === 'deny' && !wie.mislukt ? telBlok(repo, wie, reden) : context(wie.event, [reden, ...uitslag.meldingen]);
}

/** @param {string} event @param {readonly string[]} meldingen @returns {Uitslag} */
function context(event, meldingen) {
  if (meldingen.length === 0) return {};
  return { stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: meldingen.join('\n') } }) };
}

/** PreToolUse (Bash): momentopname; de hoofdsessie krijgt de open lijst als context (AC-5). @param {unknown} payload @param {Repo} repo */
function pre(payload, repo) {
  const wie = actorVan(payload);
  const vooraf = wie.agentType === '' && modus(repo) !== 'uit' ? voorafUitkomst(payload, repo) : undefined;
  legVast(repo, { soort: 'pre', id: veld(payload, 'tool_use_id') }, vooraf === undefined ? wie : { ...wie, vooraf });
  const open = wie.agentType === '' ? overtredingen(repo) : [];
  return open.length === 0 ? {} : context('PreToolUse', [`rolhek-effect: open overtredingen van subagents:\n${lijstTekst(open)}\n${UITWEG}`]);
}

/**
 * PostToolUse en PostToolUseFailure (Bash): vergelijk met de momentopname van vóór. De hoofdsessie legt alleen haar venster
 * vast (AC-2); een subagent krijgt bij een overtreding `decision: block` (na een mislukt commando alleen context, AC-4).
 * @param {unknown} payload @param {{ repo: Repo, mislukt: boolean }} opties
 */
function post(payload, { repo, mislukt }) {
  const wie = { ...actorVan(payload), commando: veld(objectVeld(payload, 'tool_input'), 'command') };
  const id = veld(payload, 'tool_use_id');
  const opname = leesOpname(repo, 'pre', id);
  wisOpname(repo, id);
  const start = opname?.tijd ?? repo.now();
  const event = mislukt ? 'PostToolUseFailure' : 'PostToolUse';
  if (wie.agentType === '') return hoofdsessiePost(repo, { opname, start }, { ...wie, id, event, mislukt });
  const uitslag = vergelijk(repo, { voor: opname === null ? undefined : opname.snap, start }, wie);
  legVensterVast(repo, { actor: wie.actor, start, eind: repo.now(), paden: uitslag.paden });
  if (uitslag.nieuw.length === 0) return context(event, uitslag.meldingen);
  const reden = `rolhek-effect: dit commando veranderde paden buiten je rol:\n${lijstTekst(uitslag.nieuw)}\n${UITWEG}`;
  return mislukt ? context(event, [reden, ...uitslag.meldingen]) : telBlok(repo, wie, reden);
}

/** @param {unknown} value @param {string} key @returns {unknown} */
function objectVeld(value, key) {
  return typeof value === 'object' && value !== null && key in value ? /** @type {Record<string, unknown>} */ (value)[key] : null;
}

/** PostToolUse (Edit, Write, MultiEdit, NotebookEdit): het venster van deze actor (AC-2). @param {unknown} payload @param {Repo} repo */
function editPost(payload, repo) {
  const input = objectVeld(payload, 'tool_input');
  const file = veld(input, 'file_path') || veld(input, 'notebook_path');
  const rel = path.relative(repo.root, path.resolve(repo.root, file)).split(path.sep).join('/');
  legVensterVast(repo, { actor: actorVan(payload).actor, start: repo.now(), eind: repo.now(), paden: [rel] });
  return {};
}

/** SubagentStart: momentopname onder de agent_id (AC-1). @param {unknown} payload @param {Repo} repo */
function subagentStart(payload, repo) {
  ruimOp(repo);
  const wie = actorVan(payload);
  legVast(repo, { soort: 'agent', id: wie.actor }, { sessie: wie.sessie, agentType: wie.agentType });
  return {};
}

/** SubagentStop: eindvergelijking met de stand bij de start; blokkeert één keer (AC-4). @param {unknown} payload @param {Repo} repo */
function subagentStop(payload, repo) {
  const wie = { ...actorVan(payload), commando: '' };
  const opname = leesOpname(repo, 'agent', wie.actor);
  const uitslag = vergelijk(repo, { voor: opname === null ? undefined : opname.snap, start: opname?.tijd ?? 0 }, wie);
  werkAgentBij(repo, wie.actor, { gestopt: repo.now() });
  const eigen = uitslag.lijst.filter((o) => o.actor === wie.actor);
  if (eigen.length === 0 || objectVeld(payload, 'stop_hook_active') === true) return {};
  return telBlok(repo, wie, `rolhek-effect: je veranderde paden buiten je rol:\n${lijstTekst(eigen)}\n${UITWEG} Meld dit in je overdracht.`);
}

/**
 * Stop van de hoofdsessie: de eindvergelijking opnieuw voor elke subagent van de sessie (ook schrijven na SubagentStop),
 * daarna één blokkade per stop zolang de lijst niet leeg is (AC-4, AC-5).
 * @param {unknown} payload @param {Repo} repo
 */
function stop(payload, repo) {
  if (objectVeld(payload, 'stop_hook_active') === true) return {};
  const lijst = nacontrole(repo, veld(payload, 'session_id'));
  return lijst.length === 0 ? {} : blok(`rolhek-effect: open overtredingen van subagents:\n${lijstTekst(lijst)}\n${UITWEG}`);
}

/**
 * De nacontrole van AC-4 voor de subagents van een sessie (null: alle sessies, voor pr:verify). Geeft de bijgewerkte lijst.
 * @param {Repo} repo @param {string | null} sessie
 */
export function nacontrole(repo, sessie) {
  const nieuw = agentOpnamen(repo, sessie).flatMap(({ id, opname }) =>
    vergelijk(repo, { voor: opname.snap, start: opname.tijd ?? 0 }, { actor: id, agentType: opname.agentType ?? 'reviewer', commando: '' }).nieuw);
  return werkLijstBij(repo, { nieuw, nu: momentopname(repo) });
}

/**
 * @param {string} event
 * @param {unknown} payload
 * @param {Repo} repo
 * @returns {Uitslag}
 */
export function handle(event, payload, repo) {
  switch (event) {
    case 'pre':
      return pre(payload, repo);
    case 'post':
      return post(payload, { repo, mislukt: false });
    case 'post-failure':
      return post(payload, { repo, mislukt: true });
    case 'edit-post':
      return editPost(payload, repo);
    case 'subagent-start':
      return subagentStart(payload, repo);
    case 'subagent-stop':
      return subagentStop(payload, repo);
    case 'stop':
      return stop(payload, repo);
    default:
      throw new Error(`onbekende gebeurtenis "${event}"`);
  }
}
