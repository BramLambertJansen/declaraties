// Ratchet op ESLint-onderdrukkingen (spec onderdrukkingen-ratchet): `eslint-suppressions.json` mag alleen kleiner worden
// tegenover `git merge-base origin/main HEAD`. ESLint bewaakt bij `pnpm lint` alleen het aantal per bestand en alleen zolang
// niemand het JSON-bestand wijzigt; deze check vangt de wijziging van dat bestand zelf (`--suppress-all`, `--suppress-rule`).
//  - Per paar (bestand, lintregel), niet per som (AC-1): opruimen in bestand A koopt geen nieuwe onderdrukking in B. Een
//    hernoeming die git als rename ziet, neemt het aantal van het oude pad mee.
//  - Een lintregel zonder onderdrukking op de basis is net zo streng (AC-2), behalve als deze PR de regel zelf invoert: de
//    naam staat dan in `eslint.config.js` en stond daar op de basis niet. Dan een melding.
//  - Zonder basis of met een ongeldige basis rood in CI, lokaal een melding (AC-3). Meldingen tonen stand en opruimwerk (AC-4).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** @typedef {{ key: string, message: string }} Violation */
/** @typedef {Map<string, Map<string, number>>} Onderdrukkingen bestand → lintregel → aantal */

export const BESTAND = 'eslint-suppressions.json';
const SPEC = 'spec onderdrukkingen-ratchet';

/**
 * Leest `eslint-suppressions.json` (AC-3): null-tekst is een leeg bestand; anders een fout per ongeldige plek.
 * @param {string | null} tekst @returns {{ onderdrukkingen: Onderdrukkingen, fouten: string[] }}
 */
export function leesOnderdrukkingen(tekst) {
  /** @type {Onderdrukkingen} */
  const onderdrukkingen = new Map();
  if (tekst === null) return { onderdrukkingen, fouten: [] };
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(tekst);
  } catch {
    return { onderdrukkingen, fouten: ['geen geldige JSON'] };
  }
  if (!isObject(data)) return { onderdrukkingen, fouten: ['geen object'] };
  /** @type {string[]} */
  const fouten = [];
  for (const [bestand, regels] of Object.entries(data)) {
    if (!isObject(regels)) {
      fouten.push(`${bestand}: geen object`);
      continue;
    }
    /** @type {Map<string, number>} */
    const perRegel = new Map();
    for (const [regel, waarde] of Object.entries(regels)) {
      const count = isObject(waarde) ? waarde['count'] : undefined;
      if (typeof count === 'number' && Number.isInteger(count) && count >= 0) perRegel.set(regel, count);
      else fouten.push(`${bestand} → ${regel}: count is geen geheel getal ≥ 0`);
    }
    onderdrukkingen.set(bestand, perRegel);
  }
  return { onderdrukkingen, fouten };
}

/** @param {unknown} waarde @returns {waarde is Record<string, unknown>} */
const isObject = (waarde) => typeof waarde === 'object' && waarde !== null && !Array.isArray(waarde);

/** Som per lintregel over alle bestanden (AC-1). @param {Onderdrukkingen} onderdrukkingen */
export function somPerRegel(onderdrukkingen) {
  /** @type {Map<string, number>} */
  const som = new Map();
  for (const perRegel of onderdrukkingen.values())
    for (const [regel, aantal] of perRegel) som.set(regel, (som.get(regel) ?? 0) + aantal);
  return som;
}

/** Is de basis ongeldig (AC-3)? @param {string | null | undefined} basis */
const basisOngeldig = (basis) => typeof basis === 'string' && leesOnderdrukkingen(basis).fouten.length > 0;

/** @param {string} detail @param {string} message @returns {Violation} */
const fout = (detail, message) => ({ key: `onderdrukkingen:${detail}`, message: `${message} (${SPEC})` });

// Bekende grens (delta-review van #457): de naam telt overal in de tekst, ook in commentaar of een melding. Een naam die
// alleen zo nieuw opduikt, maakt van de onderdrukkingen van die regel een melding; de grens daar is de eigenaarreview van
// eslint.config.js (gate-pad). Een naam die op de basis al als tekst voorkwam, telt nooit als ingevoerd: dat faalt veilig.
/** Staat de lintregel in de config? `rails/x` als `'x'`, andere met hun volle naam. @param {string} regel @param {string} config */
function inConfig(regel, config) {
  const naam = regel.startsWith('rails/') ? regel.slice('rails/'.length) : regel;
  return [`'${naam}'`, `"${naam}"`, `\`${naam}\``].some((vorm) => config.includes(vorm));
}

/**
 * Voert deze PR de lintregel in (AC-2)? Zijn naam staat nu in de config en op de basis niet.
 * @param {string} regel @param {{ basis: string, nu: string }} config
 */
export const ingevoerd = (regel, config) => inConfig(regel, config.nu) && !inConfig(regel, config.basis);

/**
 * @typedef {{ basis: string | null | undefined, nu: string | null, hernoemd?: ReadonlyMap<string, string>,
 *   config?: { basis: string, nu: string } }} Invoer
 * `basis` undefined: geen merge-base; null: het bestand ontbrak daar. `hernoemd`: nieuw pad → oud pad volgens git.
 */

/**
 * Overtredingen (AC-1, AC-2, AC-3): een ongeldig bestand in de werkmap, of een paar (bestand, lintregel) dat stijgt.
 * @param {Invoer} invoer @returns {Violation[]}
 */
export function onderdrukkingViolations({ basis, nu, hernoemd = new Map(), config = { basis: '', nu: '' } }) {
  const huidig = leesOnderdrukkingen(nu);
  const vorm = huidig.fouten.map((tekst) => fout(`vorm:${tekst}`, `${BESTAND}: ${tekst}`));
  // Zonder of met een ongeldige basis vergelijkt hij niet (AC-3); in CI maakt `onderdrukkingenUitGit` dat rood.
  if (basis === undefined || basisOngeldig(basis)) return vorm;
  const toen = leesOnderdrukkingen(basis).onderdrukkingen;
  /** @param {string} bestand @param {string} regel */
  const toegestaan = (bestand, regel) =>
    toen.get(bestand)?.get(regel) ?? toen.get(hernoemd.get(bestand) ?? '')?.get(regel) ?? 0;
  const stijging = [...huidig.onderdrukkingen].flatMap(([bestand, perRegel]) =>
    [...perRegel]
      .filter(([regel, aantal]) => aantal > toegestaan(bestand, regel) && !ingevoerd(regel, config))
      .map(([regel, aantal]) =>
        fout(
          `groei:${regel}:${bestand}`,
          `${BESTAND}: ${bestand} → ${regel} van ${String(toegestaan(bestand, regel))} naar ${String(aantal)}; los de nieuwe overtreding op in plaats van haar te onderdrukken. Komt nooit in .kit/baseline.json`,
        ),
      ),
  );
  return [...vorm, ...stijging];
}

/**
 * Meldingen (AC-2, AC-4): ingevoerde lintregels, de stand per lintregel en de onderdrukkingen in gewijzigde bestanden.
 * @param {{ basis: string | null, nu: string | null, gewijzigd: readonly string[], config?: { basis: string, nu: string } }} invoer
 * @returns {string[]}
 */
export function onderdrukkingMeldingen({ basis, nu, gewijzigd, config = { basis: '', nu: '' } }) {
  const huidig = leesOnderdrukkingen(nu).onderdrukkingen;
  const toen = somPerRegel(leesOnderdrukkingen(basis).onderdrukkingen);
  const som = somPerRegel(huidig);
  const nieuw = [...som]
    .filter(([regel, aantal]) => aantal > (toen.get(regel) ?? 0) && ingevoerd(regel, config))
    .map(
      ([regel, aantal]) =>
        `let op: ${BESTAND}: deze PR voert lintregel ${regel} in met ${String(aantal)} onderdrukkingen; noem ze per bestand in de PR (onderdrukkingen-ratchet/AC-2)`,
    );
  const stand = [...new Set([...som.keys(), ...toen.keys()])]
    .sort((a, b) => a.localeCompare(b))
    .map((regel) => `${regel} ${String(som.get(regel) ?? 0)} (basis ${String(toen.get(regel) ?? 0)})`);
  const opruimbaar = gewijzigd.flatMap((bestand) =>
    [...(huidig.get(bestand) ?? new Map())]
      .filter(([, aantal]) => aantal > 0)
      .map(([regel, aantal]) => `${bestand}: ${String(aantal)}× ${regel}`),
  );
  return [
    ...nieuw,
    ...(stand.length > 0 ? [`${BESTAND}: ${stand.join(', ')}; doel per lintregel in docs/roadmap.md`] : []),
    ...(opruimbaar.length > 0
      ? [`${BESTAND}: deze PR raakt bestanden met onderdrukkingen, ruim ze op als het kan: ${opruimbaar.join('; ')}`]
      : []),
  ];
}

/** @param {string} root @param {readonly string[]} args @returns {string | null} */
function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

const CONFIG = 'eslint.config.js';

/** Hernoemingen volgens `git diff -M --name-status -z`: nieuw pad → oud pad. @param {string} uit */
export function leesHernoemingen(uit) {
  /** @type {Map<string, string>} */
  const hernoemd = new Map();
  const delen = uit.split('\0');
  for (let i = 0; i < delen.length; i += 1) {
    const status = delen[i] ?? '';
    if (/^[RC]\d*$/.test(status)) {
      if (status.startsWith('R')) hernoemd.set(delen[i + 2] ?? '', delen[i + 1] ?? '');
      i += 2;
    } else if (status !== '') i += 1;
  }
  return hernoemd;
}

/** @param {string} root @param {string} file */
const lees = (root, file) => (existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : null);

/**
 * De stand uit git: de tekst op de merge-base (undefined zonder merge-base, null als het bestand daar ontbrak), in de
 * werkmap, de hernoemingen en de gewijzigde bestanden tegenover de basis, en de config op beide plekken.
 * @param {string} root
 */
function uitGit(root) {
  const basis = git(root, ['merge-base', 'origin/main', 'HEAD'])?.trim() ?? '';
  const nu = lees(root, BESTAND);
  const configNu = lees(root, CONFIG) ?? '';
  if (basis === '')
    return { basis: undefined, nu, gewijzigd: [], hernoemd: new Map(), config: { basis: '', nu: configNu } };
  const gewijzigd = (git(root, ['diff', '--name-only', '-z', basis]) ?? '').split('\0').filter((f) => f !== '');
  const hernoemd = leesHernoemingen(git(root, ['diff', '-M', '--name-status', '-z', basis]) ?? '');
  // Geen config op de basis: dan telt niets als ingevoerd (AC-2), anders zou elke regel een melding worden.
  const config = { basis: git(root, ['show', `${basis}:${CONFIG}`]) ?? configNu, nu: configNu };
  return { basis: git(root, ['show', `${basis}:${BESTAND}`]), nu, gewijzigd, hernoemd, config };
}

/**
 * Strikt kanaal van `pnpm ratchet` (AC-1 t/m AC-3); zonder of met ongeldige basis in CI rood (`GITHUB_ACTIONS`, zoals
 * `zonderBasis` in leesbudget.mjs).
 * @param {string} root @param {boolean} inCi @returns {Violation[]}
 */
export function onderdrukkingenUitGit(root, inCi) {
  const stand = uitGit(root);
  const ci = [
    ...(stand.basis === undefined
      ? [fout('geen-basis', `geen merge-base met origin/main; de ratchet op ${BESTAND} toetst niets`)]
      : []),
    ...(basisOngeldig(stand.basis)
      ? [fout('ongeldige-basis', `${BESTAND} op de merge-base is ongeldig; de ratchet toetst niets`)]
      : []),
  ];
  return [...(inCi ? ci : []), ...onderdrukkingViolations(stand)];
}

/** Meldingen voor `pnpm ratchet` (AC-2, AC-3, AC-4). @param {string} root @returns {string[]} */
export function onderdrukkingMeldingenUitGit(root) {
  const stand = uitGit(root);
  if (stand.basis === undefined)
    return [
      `let op: geen merge-base met origin/main; de ratchet op ${BESTAND} toetst niets (onderdrukkingen-ratchet/AC-3)`,
    ];
  return [
    ...(basisOngeldig(stand.basis)
      ? [`let op: ${BESTAND} op de merge-base is ongeldig; de ratchet toetst niets (onderdrukkingen-ratchet/AC-3)`]
      : []),
    ...onderdrukkingMeldingen(stand),
  ];
}
