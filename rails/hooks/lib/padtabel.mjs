// Padtabel (ADR 0079, spec padtabel): hoe zwaar een pad beschermd is, staat op één plek, `paden` in .claude/gates.json, per
// glob `schrijven` (gate, voorReview, altijdVragen; ontbrekend = vrij) en `besluit` (agent, eigenaar, besluit-pr; ontbrekend =
// eigenaar). Per kolom wint de strengste waarde over alle passende globs. Rolhek, diff-guard, lane, agent-merge, `pr:merge`
// en check-docs lezen de afgeleide lijsten uit `afgeleid()`. Puur: de aanroeper levert de geparste gates.json.
// De oude vorm (lijsten zonder `paden`) wordt doorgegeven zoals hij staat, met `OUDE_KRITIEK`; beide vormen tegelijk gooit.

/**
 * @typedef {'vrij' | 'gate' | 'voorReview' | 'altijdVragen'} Schrijven
 * @typedef {'agent' | 'eigenaar' | 'besluit-pr'} Besluit
 * @typedef {{ schrijven: Schrijven, besluit: Besluit }} Niveau
 * @typedef {{ schrijven: Schrijven, besluit: Besluit, bronnen: { schrijven: string[], besluit: string[] } }} PadNiveau
 * @typedef {{ toegestaan: string[] | undefined, kritiek: string[] | undefined }} AgentMergeLijsten
 * @typedef {{ gates: string[], voorReview: string[] | undefined, altijdVragen: string[] | undefined, kritiek: string[],
 *   agentMerge: AgentMergeLijsten }} Afgeleid
 */

// De `KRITIEK` van scripts/kit/lane.mjs op 30cc352 (ADR 0062 punt 2), bevroren voor de oude vorm (spec padtabel, Werking 4).
export const OUDE_KRITIEK = [
  'src/core/api/auth/**',
  'src/core/api/db/**',
  'db/init/**',
  'rails/hooks/**',
  'scripts/kit/check-document-status.mjs',
  'scripts/kit/lane.mjs',
  'scripts/kit/functional-ui-status.mjs',
  'scripts/kit/status-git.mjs',
  'scripts/kit/github-evidence.mjs',
  'scripts/kit/diff-guard.mjs',
  'scripts/kit/pr-verify.mjs',
  'scripts/kit/check-roadmap.mjs',
  'scripts/kit/roadmap-item.mjs',
  'scripts/kit/document-status.mjs',
  'scripts/kit/gates.mjs',
  'scripts/kit/agent-merge.mjs',
  'scripts/kit/pr-merge.mjs',
];

/** @type {readonly Schrijven[]} */
export const SCHRIJVEN = ['vrij', 'gate', 'voorReview', 'altijdVragen'];
/** @type {readonly Besluit[]} */
export const BESLUIT = ['agent', 'eigenaar', 'besluit-pr'];
/** @type {Niveau} */
const STANDAARD = { schrijven: 'vrij', besluit: 'eigenaar' };
/** @type {Niveau} */
export const STRENGST = { schrijven: 'altijdVragen', besluit: 'besluit-pr' };
const OUDE_LIJSTEN = ['gates', 'voorReview', 'altijdVragen'];
// De vloer (spec padtabel, Werking 6): elk van deze paden heeft in elke repo een eigen rij met altijdVragen en besluit-pr.
export const VLOER = [
  '.github/**',
  '.claude/hooks/**',
  '.claude/settings.json',
  '.claude/gates.json',
  '.claude/decisions.json',
  'package.json',
  'pnpm-lock.yaml',
];
export const OUDE_VORM_ZONDER_PADEN = '.claude/gates.json: oude vorm zonder paden; zet de lijsten om naar paden (ADR 0079)';
export const PADEN_NAAST_OUD = '.claude/gates.json: paden naast de oude lijsten';

/**
 * Glob-taal van de padtabel en het rolhek: `**\/` nul of meer mappen, `**` alles, `*` binnen één map, `?` één teken.
 * @param {string} glob @param {string} rel
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

/** @param {unknown} waarde @returns {waarde is Record<string, unknown>} */
const isObject = (waarde) => typeof waarde === 'object' && waarde !== null && !Array.isArray(waarde);

/** @param {unknown} ruw @param {string} sleutel */
function veld(ruw, sleutel) {
  return isObject(ruw) ? Object.entries(ruw).find(([k]) => k === sleutel)?.[1] : undefined;
}

/** @param {unknown} ruw @param {string} sleutel */
const heeft = (ruw, sleutel) => isObject(ruw) && Object.keys(ruw).includes(sleutel);

/** @param {unknown} waarde @returns {waarde is string[]} */
const tekstLijst = (waarde) => Array.isArray(waarde) && waarde.every((item) => typeof item === 'string');

/** @param {unknown} waarde @returns {waarde is Schrijven} */
const isSchrijven = (waarde) => SCHRIJVEN.some((niveau) => niveau === waarde && niveau !== 'vrij');
/** @param {unknown} waarde @returns {waarde is Besluit} */
const isBesluit = (waarde) => BESLUIT.some((niveau) => niveau === waarde);

/** @param {unknown} waarde */
const weergave = (waarde) => (typeof waarde === 'string' ? waarde : JSON.stringify(waarde));

/**
 * Waarom een rij niet leesbaar is (de tekst na `paden.<glob>: `); `rij zonder kolom` bij `{}`, dat wel leesbaar is.
 * @param {unknown} rij @returns {string[]}
 */
export function rijFouten(rij) {
  if (!isObject(rij)) return [`onbekende waarde ${weergave(rij)}`];
  const fouten = Object.entries(rij).flatMap(([sleutel, waarde]) => {
    if (sleutel === 'schrijven') return isSchrijven(waarde) ? [] : [`onbekende waarde ${weergave(waarde)}`];
    if (sleutel === 'besluit') return isBesluit(waarde) ? [] : [`onbekende waarde ${weergave(waarde)}`];
    return [`onbekende sleutel ${sleutel}`];
  });
  return Object.keys(rij).length === 0 ? ['rij zonder kolom'] : fouten;
}

/**
 * Het niveau van één rij met per kolom of het uit de rij komt (niet uit de standaard); onleesbaar telt als het strengste.
 * @param {unknown} rij @returns {Niveau & { eigen: { schrijven: boolean, besluit: boolean } }}
 */
function rijNiveau(rij) {
  const leesbaar = isObject(rij) && rijFouten(rij).every((fout) => fout === 'rij zonder kolom');
  if (!leesbaar) return { ...STRENGST, eigen: { schrijven: true, besluit: true } };
  const schrijven = veld(rij, 'schrijven');
  const besluit = veld(rij, 'besluit');
  return {
    schrijven: isSchrijven(schrijven) ? schrijven : STANDAARD.schrijven,
    besluit: isBesluit(besluit) ? besluit : STANDAARD.besluit,
    eigen: { schrijven: isSchrijven(schrijven), besluit: isBesluit(besluit) },
  };
}

/**
 * `paden` uit de geparste gates.json, of null in de oude vorm. Gooit als `paden` geen object is of naast een oude lijst staat.
 * @param {unknown} ruw @returns {Record<string, unknown> | null}
 */
export function padenVan(ruw) {
  if (!heeft(ruw, 'paden')) return null;
  const paden = veld(ruw, 'paden');
  if (!isObject(paden)) throw new Error('.claude/gates.json: paden is geen object');
  const blok = veld(ruw, 'agentMerge');
  if (OUDE_LIJSTEN.some((sleutel) => heeft(ruw, sleutel)) || heeft(blok, 'toegestaan') || heeft(blok, 'kritiek'))
    throw new Error(PADEN_NAAST_OUD);
  return paden;
}

/** @param {readonly string[]} lijst @param {string} waarde */
const rang = (lijst, waarde) => lijst.indexOf(waarde);

/**
 * Het niveau van een pad volgens `paden`: per kolom de strengste waarde van alle passende rijen, met de globs die haar leveren
 * (`standaard` als de waarde uit de standaard komt). Gooit in de oude vorm.
 * @param {string} pad @param {unknown} ruw @returns {PadNiveau}
 */
export function padNiveau(pad, ruw) {
  const paden = padenVan(ruw);
  if (paden === null) throw new Error(OUDE_VORM_ZONDER_PADEN);
  const passend = Object.entries(paden)
    .filter(([glob]) => globMatch(glob, pad))
    .map(([glob, rij]) => ({ glob, ...rijNiveau(rij) }));
  const schrijven = SCHRIJVEN[Math.max(0, ...passend.map((rij) => rang(SCHRIJVEN, rij.schrijven)))] ?? 'vrij';
  const besluit = passend.length === 0 ? 'eigenaar' : (BESLUIT[Math.max(...passend.map((rij) => rang(BESLUIT, rij.besluit)))] ?? 'eigenaar');
  /** @param {'schrijven' | 'besluit'} kolom @param {string} waarde */
  const bronnen = (kolom, waarde) => {
    const globs = passend.filter((rij) => rij[kolom] === waarde && rij.eigen[kolom]).map((rij) => rij.glob);
    return globs.length === 0 ? ['standaard'] : globs;
  };
  return { schrijven, besluit, bronnen: { schrijven: bronnen('schrijven', schrijven), besluit: bronnen('besluit', besluit) } };
}

/**
 * `agentMerge.toegestaan` en `agentMerge.kritiek`: in de nieuwe vorm afgeleid (toegestaan = besluit agent én schrijven vrij,
 * kritiek = elke andere rij), in de oude vorm zoals ze staan (geen lijst blijft undefined). Gooit zoals `padenVan`.
 * @param {unknown} ruw @returns {AgentMergeLijsten}
 */
export function agentMergeLijsten(ruw) {
  const paden = padenVan(ruw);
  if (paden === null) {
    const blok = veld(ruw, 'agentMerge');
    const toegestaan = veld(blok, 'toegestaan');
    const kritiek = veld(blok, 'kritiek');
    return { toegestaan: tekstLijst(toegestaan) ? toegestaan : undefined, kritiek: tekstLijst(kritiek) ? kritiek : undefined };
  }
  const rijen = Object.entries(paden).map(([glob, rij]) => ({ glob, ...rijNiveau(rij) }));
  const agent = (/** @type {Niveau} */ rij) => rij.besluit === 'agent' && rij.schrijven === 'vrij';
  return {
    toegestaan: rijen.filter((rij) => agent(rij)).map((rij) => rij.glob),
    kritiek: rijen.filter((rij) => !agent(rij)).map((rij) => rij.glob),
  };
}

/**
 * De oude vorm: de lijsten zoals ze staan (`voorReview` en `altijdVragen` mogen ontbreken), `kritiek` = `OUDE_KRITIEK` plus
 * `altijdVragen ?? voorReview ?? gates`. Gooit als `gates` geen lijst is (zoals de lezers nu).
 * @param {unknown} ruw @returns {Afgeleid}
 */
function oudeVorm(ruw) {
  const gates = veld(ruw, 'gates');
  if (!tekstLijst(gates)) throw new Error('.claude/gates.json: gates is geen lijst');
  /** @param {string} sleutel */
  const optioneel = (sleutel) => {
    const waarde = veld(ruw, sleutel);
    if (waarde === undefined) return undefined;
    if (!tekstLijst(waarde)) throw new Error(`.claude/gates.json: ${sleutel} is geen lijst`);
    return waarde;
  };
  const voorReview = optioneel('voorReview');
  const altijdVragen = optioneel('altijdVragen');
  const kritiek = [...OUDE_KRITIEK, ...(altijdVragen ?? voorReview ?? gates)];
  return { gates, voorReview, altijdVragen, kritiek, agentMerge: agentMergeLijsten(ruw) };
}

/**
 * De afgeleide lijsten (spec padtabel, Werking 2–4). Nieuwe vorm: `gates` = schrijven ≥ gate behalve een sleutel die een
 * bestand in `jsonGates` is, `voorReview` = schrijven ≥ voorReview, `altijdVragen` = schrijven altijdVragen, `kritiek` =
 * besluit-pr ∪ schrijven altijdVragen; een lege lijst is leeg (geen terugval). Oude vorm: zie `oudeVorm`.
 * @param {unknown} ruw @returns {Afgeleid}
 */
export function afgeleid(ruw) {
  const paden = padenVan(ruw);
  if (paden === null) return oudeVorm(ruw);
  const json = veld(ruw, 'jsonGates');
  const jsonBestanden = isObject(json) ? Object.keys(json) : [];
  const rijen = Object.entries(paden).map(([glob, rij]) => ({ glob, ...rijNiveau(rij) }));
  /** @param {(rij: Niveau) => boolean} toets */
  const globs = (toets) => rijen.filter((rij) => toets(rij)).map((rij) => rij.glob);
  return {
    gates: globs((rij) => rang(SCHRIJVEN, rij.schrijven) >= 1).filter((glob) => !jsonBestanden.includes(glob)),
    voorReview: globs((rij) => rang(SCHRIJVEN, rij.schrijven) >= 2),
    altijdVragen: globs((rij) => rij.schrijven === 'altijdVragen'),
    kritiek: globs((rij) => rij.besluit === 'besluit-pr' || rij.schrijven === 'altijdVragen'),
    agentMerge: agentMergeLijsten(ruw),
  };
}
