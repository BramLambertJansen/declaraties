// Diff-guard (framework §10, ADR 0011 punt 9, ADR 0017): raakt een PR een gate-pad, een bewaakte sleutel in een JSON-bestand
// (`package.json` → `scripts`) of een bestaande test, dan is hij alleen groen met het label `gate-wijziging` én als de laatste
// beslissende review van een goedkeurder (niet de auteur) APPROVED is op exact de head-SHA. Is de auteur zelf goedkeurder, dan
// kan geen onafhankelijke goedkeuring bestaan: uitslag `overgang`, groen met waarschuwing (OV-2), tot de agent als App pusht.
// Draait in .github/workflows/guard.yml vanuit main; de PR is alleen git-data (geen checkout, niets uitvoeren).
// De samenvatting eindigt met een Risico-overzicht (nieuwe of gewijzigde migraties, permissiesleutels in
// src/shared/permissions.ts, nieuwe dependencies en nieuwe defineRoute-aanroepen): puur tekstuele analyse van de voor- en
// na-versie, PR-code wordt nooit geïmporteerd of uitgevoerd.
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
 * @typedef {{ migraties: string[], permissies: string[], dependencies: string[], routes: string[] }} Risico
 * @typedef {{ uitslag: 'groen' | 'overgang' | 'rood', redenen: string[], geraakt: Geraakt }} Uitslag
 * @typedef {Uitslag & { risico: Risico }} Oordeel
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
  return { ...uitslagVan(pr, config), risico: risico(pr) };
}

/**
 * @param {Pr} pr
 * @param {GuardConfig} config
 * @returns {Uitslag}
 */
function uitslagVan(pr, config) {
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

// ---------- Risico-overzicht: PR-bestanden alleen als tekst ----------

const PERMISSIES = 'src/shared/permissions.ts';
const PAKKET = 'package.json';
const MIGRATIE = /^db\/migrations\/.+\.sql$/;
const BRON = /^src\/.+\.(?:[cm]?ts|tsx)$/;
const DEP_SECTIES = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
// Een sleutel tussen quotes met een object als waarde, zoals `'me:read': { roles: [...] }`.
const SLEUTEL = /(['"])([^'"\n]+)\1\s*:\s*\{/g;

/** Index na de string die op `i` begint; geen quote: `i + 1`. @param {string} bron @param {number} i */
function stringEinde(bron, i) {
  const quote = bron.charAt(i);
  if (quote !== "'" && quote !== '"' && quote !== '`') return i + 1;
  let j = i + 1;
  while (j < bron.length && bron.charAt(j) !== quote) j += bron.charAt(j) === '\\' ? 2 : 1;
  return Math.min(j + 1, bron.length);
}

/** Index na het commentaar dat op `i` begint; geen commentaar: `i`. @param {string} bron @param {number} i */
function commentaarEinde(bron, i) {
  const [regel, blok] = [bron.startsWith('//', i), bron.startsWith('/*', i)];
  if (!regel && !blok) return i;
  const eind = bron.indexOf(regel ? '\n' : '*/', i + 2);
  if (eind === -1) return bron.length;
  return regel ? eind : eind + 2;
}

/** De bron zonder regel- en blokcommentaar; strings blijven heel. @param {string} bron */
function zonderCommentaar(bron) {
  /** @type {string[]} */
  const delen = [];
  let i = 0;
  while (i < bron.length) {
    const naCommentaar = commentaarEinde(bron, i);
    const volgende = naCommentaar > i ? naCommentaar : stringEinde(bron, i);
    delen.push(naCommentaar > i ? ' ' : bron.slice(i, volgende));
    i = volgende;
  }
  return delen.join('');
}

/** Het gebalanceerde `{…}`- of `(…)`-blok dat op `start` begint; niet gesloten: tot het einde. @param {string} code @param {number} start */
function blokVanaf(code, start) {
  const open = code.charAt(start);
  const sluit = open === '{' ? '}' : ')';
  let diepte = 0;
  for (let i = start; i < code.length; i = stringEinde(code, i)) {
    const teken = code.charAt(i);
    if (teken === open) diepte += 1;
    if (teken === sluit) diepte -= 1;
    if (diepte === 0) return code.slice(start, i + 1);
  }
  return code.slice(start);
}

/** Zonder witruimte: opmaak telt niet als wijziging. @param {string} tekst */
function compact(tekst) {
  return tekst.replace(/\s+/g, '');
}

/** Permissiesleutel → compacte waarde. @param {string | null} bron @returns {Map<string, string>} */
function permissieSleutels(bron) {
  /** @type {Map<string, string>} */
  const sleutels = new Map();
  if (bron === null) return sleutels;
  const code = zonderCommentaar(bron);
  let vanaf = 0;
  for (const treffer of code.matchAll(SLEUTEL)) {
    if (treffer.index < vanaf) continue;
    const start = treffer.index + treffer[0].length - 1;
    const waarde = blokVanaf(code, start);
    sleutels.set(treffer[2] ?? '', compact(waarde));
    vanaf = start + waarde.length;
  }
  return sleutels;
}

/** @param {{ voor: string | null, na: string | null } | undefined} versies */
function gewijzigdePermissies(versies) {
  if (versies === undefined) return [];
  const voor = permissieSleutels(versies.voor);
  return [...permissieSleutels(versies.na)]
    .filter(([sleutel, waarde]) => voor.get(sleutel) !== waarde)
    .map(([sleutel]) => sleutel)
    .sort();
}

/** Pakketnaam → sectie; gooit bij onleesbare JSON. @param {string | null} bron @returns {Map<string, string>} */
function dependencies(bron) {
  /** @type {unknown} */
  const pakket = bron === null ? {} : JSON.parse(bron);
  return new Map(
    DEP_SECTIES.flatMap((sectie) => {
      const lijst = veld(pakket, sectie);
      return typeof lijst === 'object' && lijst !== null ? Object.keys(lijst).map((naam) => [naam, sectie]) : [];
    }),
  );
}

/** Nieuwe pakketnamen (in geen enkele sectie van de basis); onleesbaar telt als melding. @param {{ voor: string | null, na: string | null } | undefined} versies */
function nieuweDependencies(versies) {
  if (versies === undefined) return [];
  try {
    const voor = dependencies(versies.voor);
    return [...dependencies(versies.na)]
      .filter(([naam]) => !voor.has(naam))
      .map(([naam, sectie]) => `${naam} (${sectie})`)
      .sort();
  } catch {
    return [`${PAKKET} is onleesbaar; controleer de dependencies met de hand`];
  }
}

/** De compacte argumenten van elke `defineRoute(`-aanroep. @param {string | null} bron */
function routeAanroepen(bron) {
  if (bron === null) return [];
  const code = zonderCommentaar(bron);
  return [...code.matchAll(/\bdefineRoute\s*\(/g)].map((t) => compact(blokVanaf(code, t.index + t[0].length - 1)));
}

/** Het eerste argument van een compacte aanroep `(…)`, tot de eerste komma op het bovenste niveau. @param {string} aanroep */
function eersteArgument(aanroep) {
  let diepte = 0;
  for (let i = 0; i < aanroep.length; i = stringEinde(aanroep, i)) {
    const teken = aanroep.charAt(i);
    if ('([{'.includes(teken)) diepte += 1;
    if (')]}'.includes(teken)) diepte -= 1;
    if ((teken === ',' && diepte === 1) || diepte === 0) return aanroep.slice(1, i);
  }
  return aanroep.slice(1);
}

/**
 * Identiteit van een route: `METHOD path` als beide letterlijk staan, anders het eerste argument (het contract). Handler,
 * permission en schema's horen er niet bij: een bestaande route met een andere handler is niet nieuw.
 * @param {string} aanroep
 * @returns {{ letterlijk: boolean, id: string }}
 */
function routeIdentiteit(aanroep) {
  const method = /[({,]method:(['"])([A-Za-z]+)\1/.exec(aanroep)?.[2];
  const routePad = /[({,]path:(['"])([^'"]*)\1/.exec(aanroep)?.[2];
  if (method === undefined || routePad === undefined) return { letterlijk: false, id: eersteArgument(aanroep) };
  return { letterlijk: true, id: `${method.toUpperCase()} ${routePad}` };
}

/** Routes in `na` waarvan de identiteit (als multiset) niet in `voor` staat. @param {string} pad @param {{ voor: string | null, na: string | null }} versies */
function nieuweRoutes(pad, versies) {
  const oud = routeAanroepen(versies.voor).map((aanroep) => routeIdentiteit(aanroep).id);
  return routeAanroepen(versies.na)
    .map(routeIdentiteit)
    .filter(({ id }) => {
      const index = oud.indexOf(id);
      if (index !== -1) oud.splice(index, 1);
      return index === -1;
    })
    .map(({ letterlijk, id }) =>
      letterlijk ? `${pad}: ${id}` : `${pad}: method en path niet letterlijk (via contract)`,
    );
}

/** Nieuwe of gewijzigde migratie, of een hernoeming van of naar `db/migrations` (beide paden). @param {Wijziging} wijziging */
function migratieRegel({ status, pad, van }) {
  if (status === 'R' && van !== undefined && (MIGRATIE.test(pad) || MIGRATIE.test(van))) return [`${van} → ${pad}`];
  return (status === 'A' || status === 'M') && MIGRATIE.test(pad) ? [pad] : [];
}

/**
 * Risico-overzicht uit `pr.wijzigingen` en de voor/na-tekst in `pr.json`; alleen tekstuele analyse.
 * @param {Pr} pr
 * @returns {Risico}
 */
export function risico(pr) {
  const versies = new Map(Object.entries(pr.json));
  return {
    migraties: pr.wijzigingen.flatMap(migratieRegel).sort(),
    permissies: gewijzigdePermissies(versies.get(PERMISSIES)),
    dependencies: nieuweDependencies(versies.get(PAKKET)),
    routes: [...versies]
      .filter(([pad]) => BRON.test(pad) && pad !== PERMISSIES)
      .flatMap(([pad, v]) => nieuweRoutes(pad, v))
      .sort(),
  };
}

/** @param {Risico} risico */
function risicoTekst(risico) {
  /** @type {[string, string[]][]} */
  const categorieen = [
    ['Migraties (nieuw, gewijzigd of hernoemd)', risico.migraties],
    ['Permissiesleutels (nieuw of gewijzigd)', risico.permissies],
    ['Dependencies (nieuw)', risico.dependencies],
    ['Routes (nieuwe defineRoute)', risico.routes],
  ];
  return [
    '**Risico-overzicht**',
    '',
    ...categorieen.flatMap(([kop, items]) =>
      items.length === 0
        ? [`- ${kop}: geen`]
        : [`- ${kop}:`, ...items.map((item) => `  - \`${item.replaceAll('`', "'")}\``)],
    ),
    '',
  ];
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
    ...risicoTekst(oordeel.risico),
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

/**
 * Gewijzigde bestanden waarvan de guard de tekst nodig heeft: bewaakte JSON, permissies, package.json en bronbestanden onder
 * src/ buiten de tests (routes). Alleen als git-object gelezen, nooit uitgevoerd; `van` is het pad in de basis (bij een
 * hernoeming; een kopie is nieuw).
 * @param {GuardConfig} config
 * @param {readonly Wijziging[]} wijzigingen
 */
function teLezen(config, wijzigingen) {
  const vast = [...new Set([...Object.keys(config.jsonGates), PERMISSIES, PAKKET])];
  const geraakteVaste = vast
    .filter((bestand) => wijzigingen.some(({ pad, van }) => pad === bestand || van === bestand))
    .map((bestand) => ({ pad: bestand, van: bestand }));
  const bron = wijzigingen
    .filter(
      ({ status, pad }) => status !== 'D' && BRON.test(pad) && !vast.includes(pad) && !past(config.testpaden, pad),
    )
    .map(({ status, pad, van }) => ({ pad, van: status === 'R' ? (van ?? pad) : pad }));
  return [...geraakteVaste, ...bron];
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
    teLezen(config, wijzigingen).map(({ pad, van }) => [pad, { voor: versie(splitsing, van), na: versie(head, pad) }]),
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
