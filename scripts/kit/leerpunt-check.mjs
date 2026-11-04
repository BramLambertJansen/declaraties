// Issue-check voor leerpunten (ADR 0078 punt 3, spec leerlus-bewijs AC-5 en AC-6). Draait in de workflow `leerpunt` op
// `issues` en `issue_comment`, vanaf de default branch, met alleen `issues: write` en `pull-requests: read`. Zet of haalt de
// labels `leerpunt-onvolledig` en `leerpunt-zonder-bewijs` weg met één comment per soort; sluit, heropent of bewerkt niets.
// Alleen in de template-repo (`onderhoud.repository` in .claude/gates.json). Alleen `node:`- en relatieve imports.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  COMMENT_ZONDER_BEWIJS,
  commentOnvolledig,
  graphqlData,
  leesSjabloon,
  lijst,
  sluitOordeel,
  toetsBody,
  veld,
} from './leerpunt.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');
export const LABEL_ONVOLLEDIG = 'leerpunt-onvolledig';
export const LABEL_ZONDER_BEWIJS = 'leerpunt-zonder-bewijs';
const BOT = 'github-actions[bot]';
const MERK = { onvolledig: '<!-- leerpunt-check:onvolledig -->', bewijs: '<!-- leerpunt-check:zonder-bewijs -->' };

/** @typedef {{ naam: string, actie: string, nummer: number, open: boolean, body: string, labels: string[] }} Gebeurtenis */
/** @typedef {{ label: string, aan: boolean, comment: string | null, merk: string }} Stap */

/** @param {unknown} event @param {string} naam @returns {Gebeurtenis} */
export function leesGebeurtenis(event, naam) {
  const issue = veld(event, 'issue');
  return {
    naam,
    actie: String(veld(event, 'action') ?? ''),
    nummer: Number(veld(issue, 'number')),
    open: veld(issue, 'state') === 'open',
    body: String(veld(issue, 'body') ?? ''),
    labels: lijst(veld(issue, 'labels')).map((label) => String(veld(label, 'name'))),
  };
}

/**
 * Wat de check bij deze gebeurtenis moet nagaan (AC-5, AC-6): het sjabloon bij openen, bewerken, labelen en heropenen; het
 * sluitbewijs bij sluiten, bij labelen van een gesloten issue en bij een nieuwe comment erop; bij heropenen ook het bewijslabel weg.
 * @param {Gebeurtenis} g @returns {{ sjabloon: boolean, sluiten: boolean, heropend: boolean }}
 */
export function teToetsen(g) {
  if (!g.labels.includes('leerpunt')) return { sjabloon: false, sluiten: false, heropend: false };
  const sjabloon = g.naam === 'issues' && ['opened', 'edited', 'labeled', 'reopened'].includes(g.actie);
  const sluiten =
    (g.naam === 'issues' && (g.actie === 'closed' || (g.actie === 'labeled' && !g.open))) ||
    (g.naam === 'issue_comment' && !g.open);
  return { sjabloon, sluiten, heropend: g.naam === 'issues' && g.actie === 'reopened' };
}

/**
 * De labelstappen voor de toetsen (puur): per soort label aan of uit, met de comment als het label aan gaat.
 * @param {{ fouten: string[] | null, oordeel: string | null, heropend: boolean }} uitslag @returns {Stap[]}
 */
export function stappen({ fouten, oordeel, heropend }) {
  /** @type {Stap[]} */
  const uit = [];
  if (fouten !== null) {
    const aan = fouten.length > 0;
    uit.push({ label: LABEL_ONVOLLEDIG, aan, comment: aan ? commentOnvolledig(fouten) : null, merk: MERK.onvolledig });
  }
  if (heropend) uit.push({ label: LABEL_ZONDER_BEWIJS, aan: false, comment: null, merk: MERK.bewijs });
  else if (oordeel !== null) {
    const aan = oordeel === 'zonder-bewijs';
    uit.push({ label: LABEL_ZONDER_BEWIJS, aan, comment: aan ? COMMENT_ZONDER_BEWIJS : null, merk: MERK.bewijs });
  }
  return uit;
}

/** @param {string} tekst @returns {string | null} */
export function onderhoudRepo(tekst) {
  const repo = veld(veld(JSON.parse(tekst), 'onderhoud'), 'repository');
  return typeof repo === 'string' ? repo : null;
}

/** @param {string} naam */
function env(naam) {
  const waarde = process.env[naam];
  if (waarde === undefined || waarde === '') throw new Error(`${naam} ontbreekt`);
  return waarde;
}

/** @param {string} pad @param {{ method?: string, body?: unknown }} [opties] @returns {Promise<unknown>} */
async function api(pad, opties = {}) {
  const antwoord = await globalThis.fetch(`https://api.github.com/${pad}`, {
    method: opties.method ?? 'GET',
    headers: { authorization: `Bearer ${env('GITHUB_TOKEN')}`, accept: 'application/vnd.github+json' },
    ...(opties.body === undefined ? {} : { body: JSON.stringify(opties.body) }),
  });
  if (!antwoord.ok && !(opties.method === 'DELETE' && antwoord.status === 404))
    throw new Error(`${pad}: HTTP ${String(antwoord.status)}`);
  return antwoord.status === 204 || antwoord.status === 404 ? null : antwoord.json();
}

/** Alle comments van een issue, pagina voor pagina (hooguit 3000). @param {string} issue @returns {Promise<unknown[]>} */
async function alleComments(issue) {
  /** @type {unknown[]} */
  const alle = [];
  for (let pagina = 1; pagina <= 30; pagina++) {
    const deel = lijst(await api(`${issue}/comments?per_page=100&page=${String(pagina)}`));
    alle.push(...deel);
    if (deel.length < 100) return alle;
  }
  throw new Error(`${issue}: meer dan 3000 comments`);
}

const SLUIT_QUERY = `query($owner: String!, $name: String!, $nummer: Int!) {
  repository(owner: $owner, name: $name) { issue(number: $nummer) {
    closedByPullRequestsReferences(first: 20, includeClosedPrs: true) { nodes { merged body } }
  } }
}`;

/** @param {string} repo @param {number} nummer */
async function sluitBron(repo, nummer) {
  const [owner = '', name = ''] = repo.split('/');
  const data = await api('graphql', {
    method: 'POST',
    body: { query: SLUIT_QUERY, variables: { owner, name, nummer } },
  });
  const issue = veld(veld(graphqlData(data, ['repository', 'issue']), 'repository'), 'issue');
  const prs = lijst(veld(veld(issue, 'closedByPullRequestsReferences'), 'nodes')).map((pr) => ({
    merged: veld(pr, 'merged') === true,
    body: String(veld(pr, 'body') ?? ''),
  }));
  const comments = (await alleComments(`repos/${repo}/issues/${String(nummer)}`)).map((c) => ({
    body: String(veld(c, 'body') ?? ''),
    association: String(veld(c, 'author_association') ?? ''),
  }));
  return { prs, comments };
}

/** @param {string} repo @param {Gebeurtenis} g @param {Stap} stap */
async function voerUit(repo, g, stap) {
  const issue = `repos/${repo}/issues/${String(g.nummer)}`;
  if (stap.aan && !g.labels.includes(stap.label))
    await api(`${issue}/labels`, { method: 'POST', body: { labels: [stap.label] } });
  // Ook als de payload het label niet toont: een eerdere run kan het net gezet hebben (DELETE op 404 is goed).
  if (!stap.aan) await api(`${issue}/labels/${encodeURIComponent(stap.label)}`, { method: 'DELETE' });
  if (stap.comment === null) return;
  const tekst = `${stap.merk}\n${stap.comment}`;
  // Alleen een eigen comment: een ander kan het merk ook typen (dan zou de bot die comment overschrijven).
  const bestaand = (await alleComments(issue)).find(
    (c) => veld(veld(c, 'user'), 'login') === BOT && String(veld(c, 'body') ?? '').startsWith(stap.merk),
  );
  if (bestaand === undefined) await api(`${issue}/comments`, { method: 'POST', body: { body: tekst } });
  else
    await api(`repos/${repo}/issues/comments/${String(veld(bestaand, 'id'))}`, {
      method: 'PATCH',
      body: { body: tekst },
    });
}

async function main() {
  const repo = env('GITHUB_REPOSITORY');
  const onderhoud = onderhoudRepo(readFileSync(path.join(ROOT, '.claude/gates.json'), 'utf8'));
  if (onderhoud === null || onderhoud.toLowerCase() !== repo.toLowerCase()) return;
  const g = leesGebeurtenis(JSON.parse(readFileSync(env('GITHUB_EVENT_PATH'), 'utf8')), env('GITHUB_EVENT_NAME'));
  const toets = teToetsen(g);
  const velden = leesSjabloon(readFileSync(path.join(ROOT, '.github/ISSUE_TEMPLATE/leerpunt.yml'), 'utf8'));
  const fouten = toets.sjabloon ? toetsBody(g.body, velden) : null;
  const oordeel = toets.sluiten ? sluitOordeel(g.nummer, await sluitBron(repo, g.nummer)) : null;
  for (const stap of stappen({ fouten, oordeel, heropend: toets.heropend })) await voerUit(repo, g, stap);
}

if (import.meta.main) await main();
