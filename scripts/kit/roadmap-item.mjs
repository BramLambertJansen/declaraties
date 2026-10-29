// B1 van spec taakmandaat-vervolg: binnen een taakmandaat mag in docs/roadmap.md alleen het vinkje van het item van de taak
// wijzigen. Eén gedeelde controle voor check-document-status (CI), statusOnlyDiff en `pnpm docs:status --roadmap`.
// Pure functies: geen git, geen fs; de aanroeper levert tekst en kader.
import { packageScripts } from './check-docs.mjs';
import { heeftBewijs, leesItems } from './check-roadmap.mjs';
import { gates } from './gates.mjs';

export const ROADMAP = 'docs/roadmap.md';

/** @typedef {import('./check-roadmap.mjs').Item} Item */
/** @typedef {{ scripts: Readonly<Record<string, unknown>>, testpaden: readonly string[], bestanden: readonly string[], register: ReadonlySet<string> }} Kader */
/** @typedef {{ regel: number, aangevinkt: boolean, tekst: string, regels: string[] }} Blok */

export const BUITEN =
  'docs/roadmap.md: buiten het taakmandaat; alleen het vinkje van het item van een spec met mandaat mag wijzigen';
/** @param {string} spec */
export const geenEenduidig = (spec) => `docs/roadmap.md: geen eenduidig open item dat ${spec} noemt; vraag de eigenaar`;
/** @param {number} regel */
const zonderBewijs = (regel) =>
  `docs/roadmap.md:${String(regel)}: vinkje zonder bewijs; zet er een testpad, checknaam (pnpm …) of PR-nummer (#…) achter`;

/**
 * Een package.json die geen JSON is, geeft geen checknamen.
 * @param {string | null} tekst
 * @returns {Record<string, unknown>}
 */
function leesScripts(tekst) {
  try {
    return packageScripts(tekst ?? '');
  } catch {
    return {};
  }
}

/**
 * @param {{ packageJson: string | null, bestanden: readonly string[], testpaden: readonly string[] }} bronnen
 * @returns {Kader}
 */
export function kaderVan({ packageJson, bestanden, testpaden }) {
  return {
    scripts: leesScripts(packageJson),
    testpaden,
    bestanden,
    register: new Set(gates.map((gate) => gate.script)),
  };
}

/** @param {string} tekst */
function normaal(tekst) {
  return tekst.replaceAll('\r\n', '\n');
}

/**
 * Item plus de regels die erbij horen, volgens dezelfde regel als `leesItems` (verder ingesprongen, tot een lege regel).
 * @param {string} tekst
 * @returns {Blok[]}
 */
function blokken(tekst) {
  const regels = tekst.split('\n');
  return leesItems(tekst).map((item) => {
    const begin = item.regel - 1;
    const inspring = /^\s*/.exec(regels[begin] ?? '')?.[0].length ?? 0;
    let eind = begin + 1;
    while (eind < regels.length) {
      const volgende = regels[eind] ?? '';
      if (volgende.trim() === '' || (/^\s*/.exec(volgende)?.[0].length ?? 0) <= inspring) break;
      eind += 1;
    }
    return { regel: item.regel, aangevinkt: item.aangevinkt, tekst: item.tekst, regels: regels.slice(begin, eind) };
  });
}

/**
 * Alles buiten de items, met één plaatshouder per item; twee teksten zijn gelijk buiten hun items als dit gelijk is.
 * @param {string} tekst
 * @param {Blok[]} lijst
 */
function skelet(tekst, lijst) {
  const regels = tekst.split('\n');
  const begin = new Map(lijst.map((blok) => [blok.regel - 1, blok.regels.length]));
  /** @type {string[]} */
  const uit = [];
  for (let index = 0; index < regels.length;) {
    const lengte = begin.get(index);
    if (lengte === undefined) {
      uit.push(regels[index] ?? '');
      index += 1;
    } else {
      uit.push('\0item');
      index += lengte;
    }
  }
  return uit;
}

/** @param {Blok} blok @param {string} spec */
const noemt = (blok, spec) => blok.tekst.includes(`\`${spec}\``);

/** Het item van basis na afvinken: alleen het vakje, de rest moet in head ongewijzigd beginnen. */
/** @param {Blok} blok */
function afgevinkt(blok) {
  const [eerste = '', ...rest] = blok.regels;
  return [eerste.replace(/^(\s*- )\[ \]/, '$1[x]'), ...rest].join('\n');
}

/**
 * @param {Blok} voor
 * @param {Blok} na
 */
function geldigeWijziging(voor, na) {
  return !voor.aangevinkt && na.aangevinkt && na.regels.join('\n').startsWith(afgevinkt(voor));
}

/**
 * Volgorde van meldingen: (1) hernoemd of verwijderd, (2) geen eenduidig open item, (3) een andere regel of een ander item
 * gewijzigd, (4) vinkje zonder bewijs. Geeft null als de wijziging is toegestaan.
 * @param {{ basis: string | null, head: string | null, specs: readonly string[], kader: Kader }} invoer
 * @returns {string | null}
 */
export function taakVinkje({ basis, head, specs, kader }) {
  if (basis === null || head === null) return BUITEN;
  const voor = normaal(basis);
  const na = normaal(head);
  const oud = blokken(voor);
  const nieuw = blokken(na);
  if (oud.length !== nieuw.length) return BUITEN;
  const gewijzigd = oud.flatMap((blok, index) =>
    blok.regels.join('\n') === nieuw[index]?.regels.join('\n') ? [] : [index],
  );
  const geraakt = specs.filter((spec) =>
    gewijzigd.some((index) => noemt(oud[index] ?? { regel: 0, aangevinkt: false, tekst: '', regels: [] }, spec)),
  );
  for (const spec of geraakt) {
    const treffers = oud.filter((blok) => noemt(blok, spec));
    if (treffers.filter((blok) => !blok.aangevinkt).length !== 1 || treffers.some((blok) => blok.aangevinkt))
      return geenEenduidig(spec);
  }
  if (skelet(voor, oud).join('\n') !== skelet(na, nieuw).join('\n')) return BUITEN;
  for (const index of gewijzigd) {
    const [was, is] = [oud[index], nieuw[index]];
    if (was === undefined || is === undefined || !specs.some((spec) => noemt(was, spec)) || !geldigeWijziging(was, is))
      return BUITEN;
  }
  const items = leesItems(na);
  for (const index of gewijzigd) {
    const item = items[index];
    if (item !== undefined && !heeftBewijs(item, kader)) return zonderBewijs(item.regel);
  }
  return null;
}

/**
 * Vinkt het ene open item af dat het pad van de spec noemt en zet ` (#<pr>)` achter de laatste regel van het item.
 * @param {{ tekst: string, spec: string, pr: number }} invoer
 * @returns {{ tekst: string } | { melding: string }}
 */
export function tikAf({ tekst, spec, pr }) {
  const lijst = blokken(normaal(tekst));
  const treffers = lijst.filter((blok) => noemt(blok, spec));
  const open = treffers.filter((blok) => !blok.aangevinkt);
  const doel = open[0];
  if (open.length !== 1 || doel === undefined || treffers.some((blok) => blok.aangevinkt))
    return { melding: geenEenduidig(spec) };
  const regels = tekst.split('\n');
  const begin = doel.regel - 1;
  const laatste = begin + doel.regels.length - 1;
  regels[begin] = (regels[begin] ?? '').replace(/^(\s*- )\[ \]/, '$1[x]');
  regels[laatste] = (regels[laatste] ?? '').replace(/(\r?)$/, ` (#${String(pr)})$1`);
  return { tekst: regels.join('\n') };
}
