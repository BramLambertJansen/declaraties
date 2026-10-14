// Diff-guard (framework §10, ADR 0011 punt 9, ADR 0017): raakt een PR een gate-pad, een bewaakte sleutel in een JSON-bestand
// (`package.json` → `scripts`) of een bestaande test, dan is hij alleen groen met het label `gate-wijziging` én als de laatste
// beslissende review van een goedkeurder (niet de auteur) APPROVED is op exact de head-SHA. Is de auteur zelf goedkeurder, dan
// kan geen onafhankelijke goedkeuring bestaan: uitslag `overgang`, groen met waarschuwing (OV-2), tot de agent als App pusht.
// Draait in .github/workflows/guard.yml vanuit main; de PR is alleen git-data (geen checkout, niets uitvoeren).
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globMatch } from '../../.claude/hooks/lib/rolhek.mjs';

const LABEL = 'gate-wijziging';
// Een review die de stand bepaalt; COMMENTED en PENDING laten de vorige beslissing staan.
const BESLISSEND = new Set(['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED']);
// Een bestaande test is gewijzigd bij deze statussen (OV-4); toevoegen (A) en kopiëren (C) zijn vrij.
const TEST_GEWIJZIGD = new Set(['M', 'D', 'R', 'T']);

/**
 * @typedef {{ status: string, pad: string, van?: string }} Wijziging  status is de letter (R100 → R); `van` bij R en C
 * @typedef {{ gates: string[], testpaden: string[], jsonGates: Record<string, string[]>, goedkeurders: string[] }} GuardConfig
 * @typedef {{ user: string, state: string, commitId: string, submittedAt: string }} Review
 * @typedef {{ wijzigingen: Wijziging[], json: Record<string, { voor: string | null, na: string | null }>, labels: string[],
 *   reviews: Review[], auteur: string, headSha: string }} Pr
 * @typedef {{ gates: string[], tests: string[], json: string[] }} Geraakt
 * @typedef {{ uitslag: 'groen' | 'overgang' | 'rood', redenen: string[], geraakt: Geraakt }} Oordeel
 */

/**
 * Uitvoer van `git diff --name-status -z --find-renames`: NUL-gesplitst, dus paden met spatie of regeleinde blijven heel.
 * @param {string} tekst
 * @returns {Wijziging[]}
 */
export function parseNameStatus(tekst) {
  const velden = tekst.split('\0');
  /** @type {Wijziging[]} */
  const wijzigingen = [];
  for (let i = 0; i < velden.length;) {
    const code = velden[i] ?? '';
    if (code === '') break;
    const status = code.charAt(0);
    if (status === 'R' || status === 'C') {
      wijzigingen.push({ status, van: velden[i + 1] ?? '', pad: velden[i + 2] ?? '' });
      i += 3;
    } else {
      wijzigingen.push({ status, pad: velden[i + 1] ?? '' });
      i += 2;
    }
  }
  return wijzigingen;
}

/** @param {string} tekst @returns {GuardConfig} */
export function leesConfig(tekst) {
  /** @type {unknown} */
  const ruw = JSON.parse(tekst);
  /** @param {string} sleutel */
  const lijst = (sleutel) => {
    const waarde =
      typeof ruw === 'object' && ruw !== null ? Object.entries(ruw).find(([k]) => k === sleutel)?.[1] : undefined;
    if (!Array.isArray(waarde) || !waarde.every((item) => typeof item === 'string'))
      throw new Error(`.claude/gates.json: ${sleutel} is geen lijst`);
    return waarde.map(String);
  };
  const json = typeof ruw === 'object' && ruw !== null && 'jsonGates' in ruw ? ruw.jsonGates : undefined;
  if (typeof json !== 'object' || json === null || Array.isArray(json))
    throw new Error('.claude/gates.json: jsonGates is geen object');
  return {
    gates: lijst('gates'),
    testpaden: lijst('testpaden'),
    goedkeurders: lijst('goedkeurders'),
    jsonGates: Object.fromEntries(
      Object.entries(json).map(([bestand, sleutels]) => [bestand, Array.isArray(sleutels) ? sleutels.map(String) : []]),
    ),
  };
}

/** @param {readonly string[]} globs @param {string} pad */
function past(globs, pad) {
  return globs.some((glob) => globMatch(glob, pad));
}

/**
 * Bewaakte sleutels die verschillen; onleesbare JSON telt als gewijzigd (faalt dicht).
 * @param {string | null} voor
 * @param {string | null} na
 * @param {readonly string[]} sleutels
 */
function jsonVerschil(voor, na, sleutels) {
  try {
    /** @type {Record<string, unknown>} */
    const a = voor === null ? {} : JSON.parse(voor);
    /** @type {Record<string, unknown>} */
    const b = na === null ? {} : JSON.parse(na);
    return sleutels.filter((sleutel) => JSON.stringify(a[sleutel]) !== JSON.stringify(b[sleutel]));
  } catch {
    return [...sleutels];
  }
}

/**
 * @param {Pr} pr
 * @param {GuardConfig} config
 * @returns {Geraakt}
 */
export function geraakt(pr, config) {
  const json = Object.entries(config.jsonGates).flatMap(([bestand, sleutels]) => {
    const versies = pr.json[bestand];
    if (versies === undefined) return [];
    return jsonVerschil(versies.voor, versies.na, sleutels).map((sleutel) => `${bestand} → ${sleutel}`);
  });
  // Een nieuwe test is vrij, ook al staat het testpatroon tussen de gates; bij een hernoeming tellen beide paden.
  const paden = pr.wijzigingen.flatMap(({ status, pad, van }) =>
    [pad, ...(van === undefined ? [] : [van])].map((p) => ({ status, pad: p })),
  );
  const nieuweTest = (/** @type {{ status: string, pad: string }} */ { status, pad }) =>
    (status === 'A' || status === 'C') && past(config.testpaden, pad);
  const gates = paden.filter((p) => past(config.gates, p.pad) && !nieuweTest(p)).map(({ pad }) => pad);
  const tests = paden
    .filter(({ status, pad }) => TEST_GEWIJZIGD.has(status) && past(config.testpaden, pad))
    .map(({ pad }) => pad);
  return { gates: [...new Set(gates)].sort(), tests: [...new Set(tests)].sort(), json };
}

/**
 * De laatste beslissende review van een goedkeurder die niet de auteur is.
 * @param {Pr} pr
 * @param {Set<string>} goedkeurders  in kleine letters
 */
function laatsteBeslissing(pr, goedkeurders) {
  return pr.reviews
    .filter(
      ({ user, state }) =>
        BESLISSEND.has(state) && goedkeurders.has(user.toLowerCase()) && user.toLowerCase() !== pr.auteur.toLowerCase(),
    )
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    .at(-1);
}

/**
 * @param {Pr} pr
 * @param {GuardConfig} config
 * @returns {Oordeel}
 */
export function beoordeel(pr, config) {
  const g = geraakt(pr, config);
  if (g.gates.length + g.tests.length + g.json.length === 0)
    return { uitslag: 'groen', redenen: ['geen gate-pad, bewaakte sleutel of bestaande test geraakt'], geraakt: g };
  const goedkeurders = new Set(config.goedkeurders.map((naam) => naam.toLowerCase()));
  if (goedkeurders.has(pr.auteur.toLowerCase()))
    return {
      uitslag: 'overgang',
      redenen: [
        `${pr.auteur} is auteur én goedkeurder: een onafhankelijke goedkeuring kan niet (ADR 0017, OV-2); lees de geraakte paden hieronder`,
      ],
      geraakt: g,
    };
  /** @type {string[]} */
  const redenen = [];
  if (!pr.labels.includes(LABEL)) redenen.push(`het label ${LABEL} ontbreekt`);
  const beslissing = laatsteBeslissing(pr, goedkeurders);
  if (beslissing === undefined) redenen.push('geen goedkeuring van een goedkeurder die niet de auteur is');
  else if (beslissing.state !== 'APPROVED')
    redenen.push(`de laatste beslissende review van ${beslissing.user} is ${beslissing.state}`);
  else if (beslissing.commitId !== pr.headSha)
    redenen.push(
      `de goedkeuring van ${beslissing.user} geldt voor ${beslissing.commitId.slice(0, 7)}, niet voor de head ${pr.headSha.slice(0, 7)}`,
    );
  return { uitslag: redenen.length === 0 ? 'groen' : 'rood', redenen, geraakt: g };
}

const OVERGANG_UITLEG =
  'Overgang (ADR 0017, OV-2): de auteur is zelf goedkeurder. Label `gate-wijziging` en review worden in deze fase niet gevraagd en niet gecontroleerd. Lees de geraakte paden hieronder; de eigenaar merget zelf.';

/** @param {Oordeel} oordeel */
export function samenvatting(oordeel) {
  const lijst = (/** @type {string} */ kop, /** @type {string[]} */ items) =>
    items.length === 0 ? [] : [`**${kop}**`, '', ...items.map((item) => `- \`${item.replaceAll('`', "'")}\``), ''];
  return [
    `## diff-guard: ${oordeel.uitslag}`,
    '',
    ...oordeel.redenen.map((reden) => `- ${reden}`),
    '',
    ...(oordeel.uitslag === 'overgang' ? [OVERGANG_UITLEG, ''] : []),
    ...lijst('Gate-paden', oordeel.geraakt.gates),
    ...lijst('Gewijzigde of verwijderde tests', oordeel.geraakt.tests),
    ...lijst('Bewaakte sleutels', oordeel.geraakt.json),
  ].join('\n');
}

// ---------- CI (guard.yml) ----------

/** @param {string} naam */
function env(naam) {
  const waarde = process.env[naam];
  if (waarde === undefined || waarde === '') throw new Error(`${naam} ontbreekt`);
  return waarde;
}

/** @param {readonly string[]} args */
function git(args) {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** @param {string} sha @param {string} bestand */
function versie(sha, bestand) {
  try {
    return git(['show', `${sha}:${bestand}`]);
  } catch {
    return null;
  }
}

/** @param {string} url @returns {Promise<unknown[]>} */
async function api(url) {
  /** @type {unknown[]} */
  const items = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    const antwoord = await globalThis.fetch(`${url}?per_page=100&page=${String(pagina)}`, {
      headers: { authorization: `Bearer ${env('GITHUB_TOKEN')}`, accept: 'application/vnd.github+json' },
    });
    if (!antwoord.ok) throw new Error(`${url}: HTTP ${String(antwoord.status)}`);
    /** @type {unknown} */
    const deel = await antwoord.json();
    if (!Array.isArray(deel)) throw new Error(`${url}: geen lijst`);
    items.push(...deel);
    if (deel.length < 100) return items;
  }
  throw new Error(`${url}: meer dan 1000 items`);
}

/** @param {unknown} waarde @param {string} sleutel */
function veld(waarde, sleutel) {
  if (typeof waarde !== 'object' || waarde === null) return undefined;
  return Object.entries(waarde).find(([k]) => k === sleutel)?.[1];
}

/** @param {unknown} waarde */
function tekst(waarde) {
  return typeof waarde === 'string' ? waarde : '';
}

/** @param {GuardConfig} config @returns {Promise<Pr>} */
async function leesPr(config) {
  const [base, head] = [env('BASE_SHA'), env('HEAD_SHA')];
  if (![base, head].every((sha) => /^[0-9a-f]{40}$/.test(sha)))
    throw new Error('BASE_SHA en HEAD_SHA moeten 40 tekens hex zijn');
  const splitsing = git(['merge-base', base, head]).trim();
  const wijzigingen = parseNameStatus(
    git(['diff', '--name-status', '-z', '--find-renames', '--no-ext-diff', '--no-textconv', splitsing, head]),
  );
  const json = Object.fromEntries(
    Object.keys(config.jsonGates)
      .filter((bestand) => wijzigingen.some(({ pad, van }) => pad === bestand || van === bestand))
      .map((bestand) => [bestand, { voor: versie(splitsing, bestand), na: versie(head, bestand) }]),
  );
  const pr = `https://api.github.com/repos/${env('REPO')}`;
  const nummer = env('PR_NUMBER');
  const labels = (await api(`${pr}/issues/${nummer}/labels`)).map((label) => tekst(veld(label, 'name')));
  const reviews = (await api(`${pr}/pulls/${nummer}/reviews`)).map((review) => ({
    user: tekst(veld(veld(review, 'user'), 'login')),
    state: tekst(veld(review, 'state')),
    commitId: tekst(veld(review, 'commit_id')),
    submittedAt: tekst(veld(review, 'submitted_at')),
  }));
  return { wijzigingen, json, labels, reviews, auteur: env('AUTHOR'), headSha: head };
}

async function main() {
  const config = leesConfig(readFileSync(path.join(import.meta.dirname, '../../.claude/gates.json'), 'utf8'));
  const oordeel = beoordeel(await leesPr(config), config);
  const tekstSamenvatting = samenvatting(oordeel);
  console.log(tekstSamenvatting);
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary !== undefined) appendFileSync(summary, `${tekstSamenvatting}\n`);
  if (oordeel.uitslag === 'overgang') console.log(`::warning title=diff-guard::${oordeel.redenen.join('; ')}`);
  if (oordeel.uitslag === 'rood') {
    console.log(`::error title=diff-guard::${oordeel.redenen.join('; ')}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await main();
