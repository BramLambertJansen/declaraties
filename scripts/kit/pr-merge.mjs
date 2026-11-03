// `pnpm pr:merge <nr>` (ADR 0069 punt 3, spec agent-merge-niet-kritiek AC-3): de enige route waarlangs de hoofdsessie een PR
// zelf merget. Alles wordt via de REST-API van GitHub gelezen, niet uit de lokale `origin/main`; elke ontbrekende voorwaarde
// geeft een eigen regel en exit 1 zonder schrijfactie. Pas als alles klopt: squash-merge met de head-SHA als voorwaarde.
// Onopgeloste review-threads houdt de ruleset op main tegen (`required_review_thread_resolution`); REST kent hun stand niet.
// Omvang en Codex-spoor: spec agent-merge-zonder-codex AC-3 tot en met AC-5; wachten op een lopende Codex-review: spec
// agent-merge-codex-wachten.
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { gitText, readAuthority } from '../../rails/hooks/lib/authority-context.mjs';
import { expectedCheckAppId } from '../../rails/hooks/lib/built-evidence.mjs';
import {
  OMVANG_ONLEESBAAR,
  agentMergeFouten,
  binairReden,
  leesAgentMerge,
  leesModus,
  teGroot,
} from './agent-merge.mjs';
import { parseCheckRun } from './github-evidence.mjs';
import { checkProgress, verifyEffect } from './pr-verify.mjs';

export const CODEX = 'chatgpt-codex-connector[bot]';
const GUARD = '.github/workflows/guard.yml';
const SHA = /^[0-9a-f]{40}$/;
// `pnpm run` zet `node_modules/.bin` vooraan in PATH: een daar geplante `gh` mag de GitHub-antwoorden niet leveren.
const ZONDER_BIN = {
  ...process.env,
  PATH: (process.env['PATH'] ?? '')
    .split(':')
    .filter((deel) => !/(?:^|\/)node_modules\/\.bin\/?$/.test(deel))
    .join(':'),
};

/** @typedef {(endpoint: string) => unknown} Api */

/** @param {unknown} waarde @param {string} sleutel @returns {unknown} */
function veld(waarde, sleutel) {
  return typeof waarde === 'object' && waarde !== null
    ? Object.entries(waarde).find(([k]) => k === sleutel)?.[1]
    : undefined;
}

/** @param {unknown} waarde @param {...string} sleutels */
function pad(waarde, ...sleutels) {
  return sleutels.reduce((huidig, sleutel) => veld(huidig, sleutel), waarde);
}

/** @param {unknown} waarde */
const tekst = (waarde) => (typeof waarde === 'string' ? waarde : '');

/** Een lijst over pagina's; `sleutel` als de items onder een veld staan. @param {Api} api @param {string} endpoint @param {string} [sleutel] */
function alle(api, endpoint, sleutel) {
  /** @type {unknown[]} */
  const items = [];
  for (let pagina = 1; pagina <= 10; pagina += 1) {
    const scheiding = endpoint.includes('?') ? '&' : '?';
    const antwoord = api(`${endpoint}${scheiding}per_page=100&page=${String(pagina)}`);
    const deel = sleutel === undefined ? antwoord : veld(antwoord, sleutel);
    if (!Array.isArray(deel)) throw new Error(`GitHub-antwoord is geen lijst: ${endpoint}`);
    items.push(...deel);
    if (deel.length < 100) return items;
  }
  throw new Error(`Te veel items: ${endpoint}`);
}

/** Een bestand op een commit van main, via de contents-API. @param {Api} api @param {{ repo: string, sha: string, bestand: string }} doel */
function bestandOp(api, { repo, sha, bestand }) {
  try {
    const inhoud = tekst(veld(api(`repos/${repo}/contents/${bestand}?ref=${sha}`), 'content'));
    return JSON.parse(Buffer.from(inhoud, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/** @param {unknown} decisions @returns {string[]} */
function requiredChecks(decisions) {
  const lijst = veld(decisions, 'requiredChecks');
  return Array.isArray(lijst) && lijst.every((naam) => typeof naam === 'string') ? lijst : [];
}

/**
 * De PR zelf: open, geen draft, basis main, geen fork, head gelijk aan de lokale HEAD.
 * @param {unknown} raw @param {{ repo: string, head: string }} doel
 */
export function prRedenen(raw, { repo, head }) {
  const redenen = [];
  if (tekst(veld(raw, 'state')) !== 'open') redenen.push('de PR is niet open');
  if (veld(raw, 'draft') !== false) redenen.push('de PR is een draft');
  if (tekst(pad(raw, 'base', 'ref')) !== 'main') redenen.push('de basis is niet main');
  if (tekst(pad(raw, 'head', 'repo', 'full_name')) !== repo)
    redenen.push('de head staat niet in deze repository (fork)');
  const prHead = tekst(pad(raw, 'head', 'sha'));
  if (prHead !== head)
    redenen.push(`de head van de PR (${prHead.slice(0, 7)}) is niet de lokale HEAD (${head.slice(0, 7)})`);
  return redenen;
}

/** Alle verplichte checks op de head: dezelfde toets als `pr:verify`. @param {unknown[]} ruw @param {{ names: string[], sha: string }} vereist */
export function checkRedenen(ruw, vereist) {
  if (vereist.names.length === 0) return ['requiredChecks op main is leeg of onleesbaar'];
  const voortgang = checkProgress(ruw.map(parseCheckRun), vereist);
  return voortgang.state === 'success' ? [] : [`verplichte checks niet groen: ${voortgang.lines.join(', ')}`];
}

/**
 * `main` is groen: elke verplichte check die op de kop van main draaide, is geslaagd, en er draaide er minstens één. De
 * guard-checks draaien alleen op PR's, dus ontbrekende namen tellen niet.
 * @param {unknown[]} ruw @param {{ names: string[], sha: string }} vereist
 */
export function mainRedenen(ruw, vereist) {
  const checks = ruw
    .map(parseCheckRun)
    .filter((check) => vereist.names.includes(check.name) && check.headSha === vereist.sha);
  const laatste = vereist.names
    .map((naam) => checks.filter((check) => check.name === naam).toSorted((a, b) => b.id - a.id)[0])
    .filter((check) => check !== undefined);
  if (laatste.length === 0) return ['geen verplichte check op de kop van main'];
  const fout = laatste.filter((check) => check.status !== 'completed' || check.conclusion !== 'success');
  return fout.length === 0
    ? []
    : [`main is niet groen: ${fout.map((c) => `${c.name} ${c.conclusion ?? c.status}`).join(', ')}`];
}

/**
 * Een run hoort bij deze PR als `pull_requests` haar nummer bevat; GitHub laat de lijst bij `pull_request_target` soms leeg
 * (gezien op #445), dan beslissen pad, event, app en head. Een lijst met alleen andere nummers telt niet.
 * @param {unknown} prs @param {number} nummer
 */
function hoortBij(prs, nummer) {
  const lijst = Array.isArray(prs) ? prs : [];
  return lijst.length === 0 || lijst.some((pr) => veld(pr, 'number') === nummer);
}

/**
 * De job `agent-merge` uit guard.yml (pull_request_target) voor déze PR is geslaagd op de head; een gelijknamige check uit een
 * andere workflow, een ander event of een run voor een andere PR met dezelfde head telt niet.
 * @param {Api} api @param {{ repo: string, checks: unknown[], head: string, nummer: number }} doel
 */
export function guardRedenen(api, { repo, checks, head, nummer }) {
  const kandidaten = checks
    .filter((raw) => tekst(veld(raw, 'name')) === 'agent-merge' && tekst(veld(raw, 'head_sha')) === head)
    .filter((raw) => pad(raw, 'app', 'id') === expectedCheckAppId('agent-merge'))
    .filter((raw) => {
      const suite = pad(raw, 'check_suite', 'id');
      if (typeof suite !== 'number') return false;
      const runs = veld(api(`repos/${repo}/actions/runs?check_suite_id=${String(suite)}`), 'workflow_runs');
      return (
        Array.isArray(runs) &&
        runs.some(
          (run) =>
            veld(run, 'path') === GUARD &&
            veld(run, 'event') === 'pull_request_target' &&
            hoortBij(veld(run, 'pull_requests'), nummer),
        )
      );
    })
    .toSorted((a, b) => Number(veld(b, 'id')) - Number(veld(a, 'id')));
  const laatste = kandidaten[0];
  if (laatste === undefined)
    return ['geen job agent-merge uit guard.yml (pull_request_target) op de head: oordeel nee of nog bezig'];
  return veld(laatste, 'conclusion') === 'success'
    ? []
    : [`agent-merge is ${tekst(veld(laatste, 'conclusion')) || 'nog bezig'}`];
}

/** Een PR-commentaar `Review <head>: geen blokkerende bevindingen` (ADR 0069: een afspraak). @param {unknown[]} comments @param {string} head */
export function reviewRedenen(comments, head) {
  const regel = `Review ${head}: geen blokkerende bevindingen`;
  return comments.some((c) =>
    tekst(veld(c, 'body'))
      .split('\n')
      .some((r) => r.trim() === regel),
  )
    ? []
    : [`geen commentaar "${regel}" (verse review op deze head)`];
}

/** De marker `codex-review-state:v1` als regex-treffer, of null. @param {string} body */
const marker = (body) =>
  /<!-- codex-review-state:v1 (.+?) -->/s.exec(body.replaceAll('&#123;', '{').replaceAll('&#125;', '}'));

/** De machineleesbare stand uit de Codex-samenvatting, of null. @param {string} body */
export function codexStand(body) {
  const gevonden = marker(body);
  if (gevonden === null) return null;
  try {
    return veld(JSON.parse(gevonden[1] ?? ''), 'code_review');
  } catch {
    return null;
  }
}

/** De stand uit de nieuwste Codex-samenvatting met marker, of undefined. @param {unknown[]} comments */
function nieuwsteStand(comments) {
  return comments
    .filter((c) => pad(c, 'user', 'login') === CODEX)
    .map((c) => codexStand(tekst(veld(c, 'body'))))
    .filter((s) => s !== null && s !== undefined)
    .at(-1);
}

/**
 * Codex beoordeelde precies de head en heeft geen open punten: de samenvatting zegt `completed` op de head zonder onopgeloste
 * bevindingen (de nieuwste samenvatting telt), of Codex gaf een 👍 op de PR nadat GitHub de head ontving. Een 👀 of een
 * lopende review is geen afronding; die geeft in `codexVoorwaarde()` de wachtreden `CODEX_LOOPT` (spec
 * agent-merge-codex-wachten AC-3).
 * @param {{ comments: unknown[], reactions: unknown[], suites: unknown[] }} bronnen @param {string} head
 */
export function codexRedenen({ comments, reactions, suites }, head) {
  const stand = nieuwsteStand(comments);
  if (
    veld(stand, 'status') === 'completed' &&
    veld(stand, 'commit_sha') === head &&
    veld(stand, 'has_unresolved_findings') === false
  )
    return [];
  if (veld(stand, 'commit_sha') === head && veld(stand, 'has_unresolved_findings') === true)
    return ['Codex heeft open punten op de head; een 👍 telt dan niet'];
  const ontvangen = suites
    .map((s) => tekst(veld(s, 'created_at')))
    .filter(Boolean)
    .toSorted()[0];
  const duim = reactions.some(
    (r) =>
      pad(r, 'user', 'login') === CODEX &&
      veld(r, 'content') === '+1' &&
      ontvangen !== undefined &&
      tekst(veld(r, 'created_at')) > ontvangen,
  );
  return duim ? [] : ['Codex heeft deze head niet afgerond beoordeeld zonder open punten'];
}

/**
 * Omvang via REST (spec agent-merge-zonder-codex AC-3): `additions + deletions` uit `pulls/<nr>` hoogstens `maxRegels`, en elk
 * bestand uit `pulls/<nr>/files` heeft een `patch`, behalve een zuivere hernoeming (`renamed`, `changes: 0`). Zonder `patch`
 * zijn: een binair bestand, een nieuw of verwijderd leeg bestand, een diff die GitHub te groot vindt en een wijziging van
 * alleen de bestandsmodus. Alle worden geweigerd met de letterlijke spectekst `binairReden` (faalt dicht), ook als het
 * bestand niet binair is; de diff-guard geeft bij het lege bestand en de moduswijziging wel `ja` (numstat `0 0`). Een
 * hernoemde binary, zuiver of ook gewijzigd, lijkt hier een zuivere hernoeming en komt door; die vangt de job `agent-merge`
 * (numstat `-`, `nee`).
 * @param {unknown} pull @param {unknown[]} files @param {number} maxRegels
 */
export function omvangRedenen(pull, files, maxRegels) {
  const [erbij, eraf] = [veld(pull, 'additions'), veld(pull, 'deletions')];
  const regels = Number.isInteger(erbij) && Number.isInteger(eraf) ? Number(erbij) + Number(eraf) : Number.NaN;
  const zonderPatch = files
    .filter((f) => typeof veld(f, 'patch') !== 'string')
    .filter((f) => !(veld(f, 'status') === 'renamed' && veld(f, 'changes') === 0))
    .map((f) => binairReden(tekst(veld(f, 'filename'))));
  if (!(regels >= 0)) return [OMVANG_ONLEESBAAR, ...zonderPatch];
  return [...(regels > maxRegels ? [teGroot(regels, maxRegels)] : []), ...zonderPatch];
}

/** @param {unknown} item */
const vanCodex = (item) => pad(item, 'user', 'login') === CODEX;

export const CODEX_LOOPT = 'Codex-review loopt nog op deze PR: wacht of laat de eigenaar mergen';

/** @param {unknown} item */
const codexOog = (item) => vanCodex(item) && veld(item, 'content') === 'eyes';

/**
 * Codex is bezig op een PR (spec agent-merge-codex-wachten AC-1), op welke SHA of welk moment ook: een 👀 van Codex op de PR,
 * een 👀 van Codex op een issue-commentaar (alleen gelezen als de rollup `reactions.eyes` een geheel getal ≥ 1 is, OV-4), of
 * de nieuwste samenvatting met marker heeft een status anders dan `completed` of `failed`, ook leeg, ontbrekend of onbekend
 * (OV-3; een marker met onleesbare JSON of zonder `code_review` ook). Een onleesbare reactielijst of een commentaar met een
 * 👀-rollup zonder geldig `id` gooit (geen merge).
 * @param {Api} api @param {{ repo: string, comments: unknown[], reactions: unknown[] }} bronnen
 */
export function codexBezig(api, { repo, comments, reactions }) {
  // Elke Codex-body met marker telt mee, ook met onleesbare JSON of zonder `code_review`: dan is de status onbekend (OV-3).
  const laatste = comments.filter((c) => vanCodex(c) && marker(tekst(veld(c, 'body'))) !== null).at(-1);
  const status = veld(codexStand(tekst(veld(laatste, 'body'))), 'status');
  if (laatste !== undefined && status !== 'completed' && status !== 'failed') return true;
  if (reactions.some(codexOog)) return true;
  return comments.some((c) => {
    const ogen = pad(c, 'reactions', 'eyes');
    if (!(Number.isInteger(ogen) && Number(ogen) >= 1)) return false;
    const id = veld(c, 'id');
    if (!(Number.isInteger(id) && Number(id) > 0)) throw new Error('issue-commentaar met 👀 zonder geldig id');
    return alle(api, `repos/${repo}/issues/comments/${String(id)}/reactions`).some(codexOog);
  });
}

/**
 * Een spoor van Codex op PR `nummer` (spec agent-merge-zonder-codex AC-4, agent-merge-codex-wachten AC-2): een samenvatting
 * met `code_review.status` `completed`, een PR-review, een inline-reviewcommentaar of een 👍, op welke SHA ook, of Codex is
 * bezig (`codexBezig()`: een 👀 van Codex of een samenvatting die nog bezig is). Een marker `failed`, een commentaar zonder
 * marker, een 👍 op een commentaar en alles van een ander account tellen niet. Een onleesbare lijst gooit (geen merge). Met
 * `bezig` (al bepaald door de aanroeper) leest het `codexBezig()` niet opnieuw.
 * @param {Api} api @param {{ repo: string, nummer: number, comments?: unknown[], reactions?: unknown[], bezig?: boolean }} doel
 */
export function codexSpoorOp(api, { repo, nummer, comments, reactions, bezig }) {
  const nr = String(nummer);
  const lijst = comments ?? alle(api, `repos/${repo}/issues/${nr}/comments`);
  const reacties = reactions ?? alle(api, `repos/${repo}/issues/${nr}/reactions`);
  return (
    lijst.some((c) => vanCodex(c) && veld(codexStand(tekst(veld(c, 'body'))), 'status') === 'completed') ||
    reacties.some((r) => vanCodex(r) && veld(r, 'content') === '+1') ||
    alle(api, `repos/${repo}/pulls/${nr}/reviews`).some(vanCodex) ||
    alle(api, `repos/${repo}/pulls/${nr}/comments`).some(vanCodex) ||
    (bezig ?? codexBezig(api, { repo, comments: lijst, reactions: reacties }))
  );
}

/**
 * De andere PR's van dezelfde head-branch die open zijn of zonder merge gesloten (`merged_at` null); een gemergde telt niet.
 * @param {Api} api @param {{ repo: string, nummer: number, pull: unknown }} doel
 */
function branchPrs(api, { repo, nummer, pull }) {
  const eigenaar = repo.split('/')[0] ?? '';
  const branch = encodeURIComponent(tekst(pad(pull, 'head', 'ref')));
  return (
    alle(api, `repos/${repo}/pulls?head=${eigenaar}:${branch}&state=all`)
      // Alleen een leesbare `merged_at` sluit uit: ontbreekt het veld, dan telt de PR mee (faalt dicht).
      .filter((p) => tekst(veld(p, 'merged_at')) === '' && veld(p, 'number') !== nummer)
      .map((p) => Number(veld(p, 'number')))
      .filter((n) => Number.isInteger(n) && n > 0)
  );
}

/**
 * De Codex-voorwaarde (spec agent-merge-zonder-codex AC-4, AC-5): `uit` bij `codex: false`; bij `true` geldt `codexRedenen()`
 * (`voldaan` betekent: de voorwaarde geldt, de redenen zeggen of ze vervuld is); bij `"indien-aanwezig"` alleen met een spoor
 * op deze PR of een niet-gemergde PR van dezelfde branch, anders `verviel`. Is Codex bezig op deze PR, dan komt daar de
 * wachtreden `CODEX_LOOPT` bij (spec agent-merge-codex-wachten AC-3); bezig op alleen een andere PR geeft geen wachtreden.
 * @param {Api} api
 * @param {{ repo: string, nummer: number, head: string, pull: unknown, comments: unknown[], codex: import('./agent-merge.mjs').CodexModus }} doel
 * @returns {{ stand: 'voldaan' | 'verviel' | 'uit', redenen: string[] }}
 */
export function codexVoorwaarde(api, { repo, nummer, head, pull, comments, codex }) {
  if (codex === false) return { stand: 'uit', redenen: [] };
  const reactions = alle(api, `repos/${repo}/issues/${String(nummer)}/reactions`);
  const bezig = codexBezig(api, { repo, comments, reactions });
  const spoor =
    codex === true ||
    bezig ||
    codexSpoorOp(api, { repo, nummer, comments, reactions, bezig }) ||
    branchPrs(api, { repo, nummer, pull }).some((n) => codexSpoorOp(api, { repo, nummer: n }));
  if (!spoor) return { stand: 'verviel', redenen: [] };
  const suites = alle(api, `repos/${repo}/commits/${head}/check-suites`, 'check_suites');
  return {
    stand: 'voldaan',
    redenen: [...codexRedenen({ comments, reactions, suites }, head), ...(bezig ? [CODEX_LOOPT] : [])],
  };
}

/**
 * Alle voorwaarden uit ADR 0069 punt 3 plus de stand van de Codex-voorwaarde; geen redenen betekent mergen. Is `agentMerge`
 * op main onleesbaar (AC-3), dan één reden per fout (`agentMergeFouten`): de omvangreden `OMVANG_ONLEESBAAR` bij een
 * ongeldige `maxRegels`, "agentMerge ontbreekt of is onleesbaar" bij een ontbrekend blok of een ongeldige lijst.
 * @param {Api} api @param {{ repo: string, nummer: number, head: string }} doel
 * @returns {{ redenen: string[], codex: 'voldaan' | 'verviel' | 'uit' | null }}
 */
export function beoordeelMerge(api, { repo, nummer, head }) {
  if (!SHA.test(head)) return { redenen: ['geen geldige lokale HEAD'], codex: null };
  const mainSha = tekst(pad(api(`repos/${repo}/branches/main`), 'commit', 'sha'));
  if (!SHA.test(mainSha)) return { redenen: ['de kop van main is niet leesbaar'], codex: null };
  const gates = bestandOp(api, { repo, sha: mainSha, bestand: '.claude/gates.json' });
  if (leesModus(gates) !== 'niet-kritiek')
    return { redenen: ['de modus op main is niet "niet-kritiek": de eigenaar merget'], codex: null };
  const agentMerge = leesAgentMerge(gates);
  if (agentMerge === null) return { redenen: agentMergeFouten(gates), codex: null };
  const vereist = requiredChecks(bestandOp(api, { repo, sha: mainSha, bestand: '.claude/decisions.json' }));
  const checks = alle(api, `repos/${repo}/commits/${head}/check-runs`, 'check_runs');
  const comments = alle(api, `repos/${repo}/issues/${String(nummer)}/comments`);
  const pull = api(`repos/${repo}/pulls/${String(nummer)}`);
  const codex = codexVoorwaarde(api, { repo, nummer, head, pull, comments, codex: agentMerge.codex });
  const redenen = [
    ...prRedenen(pull, { repo, head }),
    ...omvangRedenen(pull, alle(api, `repos/${repo}/pulls/${String(nummer)}/files`), agentMerge.maxRegels),
    ...(veld(api(`repos/${repo}/compare/${mainSha}...${head}`), 'behind_by') === 0
      ? []
      : ['de PR bevat de kop van main niet: eerst git merge origin/main']),
    ...checkRedenen(checks, { names: vereist, sha: head }),
    ...guardRedenen(api, { repo, checks, head, nummer }),
    ...mainRedenen(alle(api, `repos/${repo}/commits/${mainSha}/check-runs`, 'check_runs'), {
      names: vereist,
      sha: mainSha,
    }),
    ...reviewRedenen(comments, head),
    ...codex.redenen,
  ];
  return { redenen, codex: codex.stand };
}

/** Alle voorwaarden uit ADR 0069 punt 3; een lege lijst betekent mergen. @param {Api} api @param {{ repo: string, nummer: number, head: string }} doel */
export function voorwaarden(api, doel) {
  return beoordeelMerge(api, doel).redenen;
}

export const STEEKPROEF_VERVIEL =
  'Geen Codex-spoor op deze PR of zijn branch: de Codex-voorwaarde verviel (indien-aanwezig). Meld deze merge als steekproef (ADR 0069 punt 5).';
export const STEEKPROEF_UIT =
  'Geen Codex-voorwaarde (agentMerge.codex: false). Meld deze merge als steekproef (ADR 0069 punt 5).';

/**
 * De slotregels na een geslaagde merge; zonder Codex-oordeel een steekproefregel (spec agent-merge-zonder-codex AC-5). Het
 * script telt niet: de eigenaar telt (ADR 0069 punt 5).
 * @param {number} nummer @param {string} head @param {'voldaan' | 'verviel' | 'uit' | null} codex
 */
export function slotRegels(nummer, head, codex) {
  return [
    `PR #${String(nummer)} gemerged op ${head}. Meld PR en SHA in de thread en volg de CI op main (ADR 0069 punt 5).`,
    ...(codex === 'verviel' ? [STEEKPROEF_VERVIEL] : []),
    ...(codex === 'uit' ? [STEEKPROEF_UIT] : []),
  ];
}

/** @param {string} endpoint @returns {unknown} */
function gh(endpoint) {
  try {
    return JSON.parse(
      execFileSync('gh', ['api', endpoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: ZONDER_BIN }),
    );
  } catch {
    throw new Error(`GitHub is niet leesbaar: ${endpoint}`);
  }
}

/** @param {string[]} args */
export function nummerUit(args) {
  if (args.length !== 1 || !/^[1-9]\d*$/.test(args[0] ?? '')) throw new Error('Gebruik: pnpm pr:merge <nummer>');
  return Number(args[0]);
}

function main() {
  const root = process.cwd();
  const nummer = nummerUit(process.argv.slice(2));
  verifyEffect(root);
  const base = gitText(root, ['rev-parse', 'origin/main'])?.trim();
  const authority = base === undefined ? null : readAuthority({ root, base });
  const head = gitText(root, ['rev-parse', 'HEAD'])?.trim() ?? '';
  if (authority === null) throw new Error('Geen leesbare vertrouwde basis');
  const repo = authority.repository;
  const { redenen, codex } = beoordeelMerge(gh, { repo, nummer, head });
  if (redenen.length > 0) throw new Error(`Geen merge (ADR 0069):\n${redenen.map((r) => `- ${r}`).join('\n')}`);
  execFileSync(
    'gh',
    [
      'api',
      '-X',
      'PUT',
      `repos/${repo}/pulls/${String(nummer)}/merge`,
      '-f',
      'merge_method=squash',
      '-f',
      `sha=${head}`,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'], env: ZONDER_BIN },
  );
  console.log(slotRegels(nummer, head, codex).join('\n'));
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
