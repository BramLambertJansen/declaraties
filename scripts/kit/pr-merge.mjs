// `pnpm pr:merge <nr>` (ADR 0069 punt 3, spec agent-merge-niet-kritiek AC-3): de enige route waarlangs de hoofdsessie een PR
// zelf merget. Alles wordt via de REST-API van GitHub gelezen, niet uit de lokale `origin/main`; elke ontbrekende voorwaarde
// geeft een eigen regel en exit 1 zonder schrijfactie. Pas als alles klopt: squash-merge met de head-SHA als voorwaarde.
// Onopgeloste review-threads houdt de ruleset op main tegen (`required_review_thread_resolution`); REST kent hun stand niet.
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { gitText, readAuthority } from '../../rails/hooks/lib/authority-context.mjs';
import { expectedCheckAppId } from '../../rails/hooks/lib/built-evidence.mjs';
import { leesAgentMerge, leesModus } from './agent-merge.mjs';
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

/** De machineleesbare stand uit de Codex-samenvatting, of null. @param {string} body */
export function codexStand(body) {
  const gevonden = /<!-- codex-review-state:v1 (.+?) -->/s.exec(
    body.replaceAll('&#123;', '{').replaceAll('&#125;', '}'),
  );
  if (gevonden === null) return null;
  try {
    return veld(JSON.parse(gevonden[1] ?? ''), 'code_review');
  } catch {
    return null;
  }
}

/**
 * Codex beoordeelde precies de head en heeft geen open punten: de samenvatting zegt `completed` op de head zonder onopgeloste
 * bevindingen (de nieuwste samenvatting telt), of Codex gaf een 👍 op de PR nadat GitHub de head ontving. 👀 of een lopende review telt niet.
 * @param {{ comments: unknown[], reactions: unknown[], suites: unknown[] }} bronnen @param {string} head
 */
export function codexRedenen({ comments, reactions, suites }, head) {
  const stand = comments
    .filter((c) => pad(c, 'user', 'login') === CODEX)
    .map((c) => codexStand(tekst(veld(c, 'body'))))
    .filter((s) => s !== null && s !== undefined)
    .at(-1);
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
 * Alle voorwaarden uit ADR 0069 punt 3; een lege lijst betekent mergen.
 * @param {Api} api @param {{ repo: string, nummer: number, head: string }} doel
 */
export function voorwaarden(api, { repo, nummer, head }) {
  if (!SHA.test(head)) return ['geen geldige lokale HEAD'];
  const mainSha = tekst(pad(api(`repos/${repo}/branches/main`), 'commit', 'sha'));
  if (!SHA.test(mainSha)) return ['de kop van main is niet leesbaar'];
  const gates = bestandOp(api, { repo, sha: mainSha, bestand: '.claude/gates.json' });
  if (leesModus(gates) !== 'niet-kritiek') return ['de modus op main is niet "niet-kritiek": de eigenaar merget'];
  const vereist = requiredChecks(bestandOp(api, { repo, sha: mainSha, bestand: '.claude/decisions.json' }));
  const checks = alle(api, `repos/${repo}/commits/${head}/check-runs`, 'check_runs');
  const comments = alle(api, `repos/${repo}/issues/${String(nummer)}/comments`);
  const codex = leesAgentMerge(gates)?.codex !== false;
  return [
    ...prRedenen(api(`repos/${repo}/pulls/${String(nummer)}`), { repo, head }),
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
    ...(codex
      ? codexRedenen(
          {
            comments,
            reactions: alle(api, `repos/${repo}/issues/${String(nummer)}/reactions`),
            suites: alle(api, `repos/${repo}/commits/${head}/check-suites`, 'check_suites'),
          },
          head,
        )
      : []),
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
  const redenen = voorwaarden(gh, { repo, nummer, head });
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
  console.log(
    `PR #${String(nummer)} gemerged op ${head}. Meld PR en SHA in de thread en volg de CI op main (ADR 0069 punt 5).`,
  );
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
