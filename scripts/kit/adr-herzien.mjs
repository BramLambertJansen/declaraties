// Herzieningsregels voor gewijzigde ADR's (ADR 0074, spec adr-herzien-markering): wijzigt een geaccepteerd ADR B in zijn
// kop (`Wijzigt`, `Herziet`, `Vervangt`) een ander geaccepteerd ADR A, dan heeft A een herzieningsregel die B noemt, met de
// puntnummers die B noemt. Puur; `check-docs` roept `adrHerzienViolations` aan in `docsKrimp`, nooit via de baseline.

import { nieuweHerzieningsregels } from '../../rails/hooks/lib/document-state.mjs';

/** @typedef {{ key: string, message: string }} Violation */
/** @typedef {{ doel: string, punten: number[] }} Clausule */

const ADR_PAD = /^docs\/adr\/(\d{4})-[^/]+\.md$/;
const GEACCEPTEERD = /^Status:\s*geaccepteerd\b/m;
const LINK = /\[[^\]]*\]\((\d{4}-[^)\s/#]+\.md)(?:#[^)\s]*)?\)/g;
const CLAUSULE_START = /\b(?:Wijzigt|Herziet|Vervangt)\b/g;
// Een herzieningsblok eindigt ook bij een regel die een nieuwe kopzin begint (geen lege regel ertussen, zoals in 0069).
const KOPZIN = /^(?:Wijzigt|Herziet|Vervangt|Vult|Drempel)\b/;

/** Alles vóór de eerste `## `-kop. @param {string} text */
export function kop(text) {
  const regels = text.replaceAll('\r\n', '\n').split('\n');
  const einde = regels.findIndex((regel) => regel.startsWith('## '));
  return (einde === -1 ? regels : regels.slice(0, einde)).join('\n');
}

/** De herzieningsblokken van een kop: een `Herzien:`-regel met vervolgregels. @param {string} kopTekst */
function herzieningsblokken(kopTekst) {
  // De vorm en de datum van een herzieningsregel komen uit document-state (dezelfde regel als de A4-guard).
  const geldig = new Set(nieuweHerzieningsregels('', kopTekst));
  /** @type {string[][]} */
  const blokken = [];
  /** @type {string[] | null} */
  let huidig = null;
  for (const regel of kopTekst.split('\n')) {
    if (geldig.has(regel)) {
      huidig = [regel];
      blokken.push(huidig);
    } else if (regel.trim() === '' || KOPZIN.test(regel) || regel.startsWith('Herzien:')) huidig = null;
    else if (huidig !== null) huidig.push(regel);
  }
  return blokken.map((blok) => blok.join(' '));
}

/** De kop zonder herzieningsblokken. @param {string} kopTekst */
function zonderHerzieningen(kopTekst) {
  /** @type {string[]} */
  const rest = [];
  let inBlok = false;
  for (const regel of kopTekst.split('\n')) {
    if (regel.startsWith('Herzien:')) inBlok = true;
    else if (regel.trim() === '' || KOPZIN.test(regel)) inBlok = false;
    if (!inBlok) rest.push(regel);
  }
  return rest.join('\n');
}

/**
 * Een puntreeks aan het begin van `tekst` (na witruimte): `punt N`, lijsten met `,` en `en`, bereiken `N–M`/`N-M`, herhaald
 * `punt`. Eindigt bij het eerste andere woord. @param {string} tekst @returns {number[]}
 */
export function puntreeks(tekst) {
  const tokens = tekst.replaceAll(',', ' , ').trim().split(/\s+/);
  if (tokens[0] !== 'punt') return [];
  /** @type {number[]} */
  const punten = [];
  for (const token of tokens) {
    const bereik = /^(\d+)[–-](\d+)$/.exec(token);
    if (bereik !== null) punten.push(...vanTot(Number(bereik[1]), Number(bereik[2])));
    else if (/^\d+$/.test(token)) punten.push(Number(token));
    else if (token !== 'punt' && token !== ',' && token !== 'en') break;
  }
  return punten;
}

/** @param {number} van @param {number} tot */
function vanTot(van, tot) {
  return tot < van ? [] : Array.from({ length: tot - van + 1 }, (_, i) => van + i);
}

/** Alle puntreeksen in een tekst (elke reeks die met het woord `punt` begint). @param {string} tekst */
function allePuntreeksen(tekst) {
  return [...tekst.matchAll(/\bpunt\b/g)].flatMap((match) => puntreeks(tekst.slice(match.index)));
}

/**
 * Waar de clausule vanaf `start` eindigt: de eerste `;` of `.` met witruimte of einde erna, buiten links en backticks.
 * @param {string} tekst @param {number} start
 */
function clausuleEinde(tekst, start) {
  let inCode = false;
  let diepte = 0;
  for (let i = start; i < tekst.length; i += 1) {
    const teken = tekst[i];
    if (teken === '`') inCode = !inCode;
    else if (!inCode && teken === '(' && tekst[i - 1] === ']') diepte += 1;
    else if (!inCode && teken === ')' && diepte > 0) diepte -= 1;
    else if (!inCode && diepte === 0 && (teken === ';' || (teken === '.' && /\s/.test(tekst[i + 1] ?? ' ')))) return i;
  }
  return tekst.length;
}

/** De gewijzigde ADR's met hun punten uit de kop van B. @param {string} kopTekst @returns {Clausule[]} */
export function clausules(kopTekst) {
  const tekst = zonderHerzieningen(kopTekst).replaceAll('\n', ' ');
  return [...tekst.matchAll(CLAUSULE_START)].flatMap((start) => {
    const deel = tekst.slice(start.index, clausuleEinde(tekst, start.index));
    const links = [...deel.matchAll(LINK)];
    return links.map((link, i) => {
      const na = deel.slice(link.index + link[0].length, links[i + 1]?.index ?? deel.length);
      return { doel: link[1] ?? '', punten: puntreeks(na) };
    });
  });
}

/** Het viercijferige nummer van een ADR-bestandsnaam. @param {string} bestand */
function nummer(bestand) {
  return /^(\d{4})-/.exec(bestand)?.[1] ?? '';
}

/**
 * De punten die een blok voor `bron` noemt: bij hoogstens één ADR-link alle reeksen, anders het stuk na de link naar `bron`
 * tot de volgende link of `;`. @param {string} blok @param {string} bron @returns {number[]}
 */
function blokPunten(blok, bron) {
  const links = [...blok.matchAll(LINK)];
  if (links.length <= 1) return allePuntreeksen(blok);
  return links.flatMap((link, i) => {
    if (link[1] !== bron) return [];
    const na = blok.slice(link.index + link[0].length, links[i + 1]?.index ?? blok.length);
    return allePuntreeksen(na.split(';')[0] ?? '');
  });
}

/**
 * Of de herzieningsregels in de kop van A het ADR `bron` noemen, en welke punten.
 * @param {string} kopTekst @param {string} bron @returns {{ genoemd: boolean, punten: number[] }}
 */
export function herzieningsPunten(kopTekst, bron) {
  const nr = nummer(bron);
  const noemt = (/** @type {string} */ blok) =>
    [...blok.matchAll(LINK)].some((link) => link[1] === bron) || (nr !== '' && new RegExp(`\\b${nr}\\b`).test(blok));
  const blokken = herzieningsblokken(kopTekst).filter(noemt);
  const punten = [...new Set(blokken.flatMap((blok) => blokPunten(blok, bron)))].sort((a, b) => a - b);
  return { genoemd: blokken.length > 0, punten };
}

/**
 * Per geaccepteerd ADR B en elk geaccepteerd ADR A dat B in een clausule noemt: een herzieningsregel in A die B noemt,
 * met de punten van B. @param {readonly string[]} files @param {(file: string) => string} read @returns {Violation[]}
 */
export function adrHerzienViolations(files, read) {
  const geaccepteerd = new Set(files.filter((file) => ADR_PAD.test(file) && GEACCEPTEERD.test(read(file))));
  return [...geaccepteerd].flatMap((bPad) => {
    const bron = bPad.slice('docs/adr/'.length);
    return samengevoegd(clausules(kop(read(bPad))))
      .filter(({ doel }) => geaccepteerd.has(`docs/adr/${doel}`) && doel !== bron)
      .flatMap(({ doel, punten }) => overtreding(`docs/adr/${doel}`, bron, { punten, read }));
  });
}

/** Clausules per doel samengevoegd (AC: twee clausules naar hetzelfde ADR). @param {Clausule[]} lijst */
function samengevoegd(lijst) {
  /** @type {Map<string, Set<number>>} */
  const perDoel = new Map();
  for (const { doel, punten } of lijst) perDoel.set(doel, new Set([...(perDoel.get(doel) ?? []), ...punten]));
  return [...perDoel].map(([doel, punten]) => ({ doel, punten: [...punten] }));
}

/**
 * @param {string} aPad @param {string} bron
 * @param {{ punten: number[], read: (file: string) => string }} opties
 * @returns {Violation[]}
 */
function overtreding(aPad, bron, { punten, read }) {
  const gevonden = herzieningsPunten(kop(read(aPad)), bron);
  const key = `docs:adr-herzien:${aPad}:${bron}`;
  const nr = nummer(bron);
  if (!gevonden.genoemd)
    return [
      {
        key,
        message: `${aPad}: herzieningsregel voor ${nr} ontbreekt${punten.length > 0 ? ` (punt ${punten.join(', ')})` : ''}; ${nr} wijzigt dit ADR (R-CI-05, ADR 0074)`,
      },
    ];
  const missend = punten.filter((punt) => !gevonden.punten.includes(punt));
  if (missend.length === 0) return [];
  return [
    {
      key,
      message: `${aPad}: herzieningsregel voor ${nr} noemt punt ${missend.join(', ')} niet; ${nr} wijzigt die punten (R-CI-05, ADR 0074)`,
    },
  ];
}
