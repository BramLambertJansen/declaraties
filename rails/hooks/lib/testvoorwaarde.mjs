// Voorwaardelijk geregistreerde tests (spec voorwaardelijke-tests, leerpunt #410): een pass over de tokens van
// testteller.mjs die per token zegt of een aanroep daar voorwaardelijk loopt (binnen `if`/`else`/`switch`/`catch`, na
// kortsluiting of een ternary, of na een `return`/`throw` in dezelfde of een omsluitende functie), en die `test` als waarde
// telt. Lussen en `try`/`finally` tellen niet (OV-2). Lexicaal, zonder dependency (ADR 0045 punt 15–19).

/** @typedef {{ soort: 'naam' | 'teken' | 'literal', tekst: string }} Token */
/** @typedef {{ soort: 'functie' | 'voorwaarde' | 'neutraal', naReturn: boolean }} Blok */

const VOORWAARDE_HAAKJES = new Set(['if', 'switch', 'catch']);
const LUS_HAAKJES = new Set(['for', 'while', 'with']);
const NEUTRAAL_WOORDEN = new Set(['try', 'finally', 'do']);
const TESTNAMEN = new Set(['test', 'it', 'describe', 'suite']);
/** Na deze woorden is de naam een declaratie, import of type, geen waarde (AC-2). */
const GEEN_WAARDE_NA = new Set([
  'const', 'let', 'var', 'function', 'typeof', 'export', 'import', 'as', 'of', 'in', 'type', 'interface', 'class',
]);
const DECLARATIE_LIJST = new Set(['import', 'export', 'const', 'let', 'var']);

/** @param {Token | undefined} token @param {string} tekst */
function teken(token, tekst) {
  return token?.soort === 'teken' && token.tekst === tekst;
}

/** @param {Token | undefined} token @param {string} tekst */
function naam(token, tekst) {
  return token?.soort === 'naam' && token.tekst === tekst;
}

/** Per `)` de bijbehorende `(`. @param {Map<number, number>} paren */
function openers(paren) {
  /** @type {Map<number, number>} */
  const open = new Map();
  for (const [o, s] of paren) open.set(s, o);
  return open;
}

/** Het woord vóór de `(` die bij de `)` op `index` hoort. @param {Token[]} tokens @param {number} index @param {Map<number, number>} open */
function haakjesWoord(tokens, index, open) {
  const o = open.get(index);
  const voor = o === undefined ? undefined : tokens[o - 1];
  return voor?.soort === 'naam' ? voor.tekst : null;
}

/** Soort van het blok dat met de `{` op `index` opent (AC-1c: elke andere `{` is een functiegrens). @param {Token[]} tokens @param {number} index @param {Map<number, number>} open @returns {Blok['soort']} */
function bloksoort(tokens, index, open) {
  const vorige = tokens[index - 1];
  if (naam(vorige, 'else') || naam(vorige, 'catch')) return 'voorwaarde';
  if (vorige?.soort === 'naam' && NEUTRAAL_WOORDEN.has(vorige.tekst)) return 'neutraal';
  if (!teken(vorige, ')')) return 'functie';
  const woord = haakjesWoord(tokens, index - 1, open);
  if (woord !== null && VOORWAARDE_HAAKJES.has(woord)) return 'voorwaarde';
  return woord !== null && LUS_HAAKJES.has(woord) ? 'neutraal' : 'functie';
}

/**
 * Typeargumenten vóór een aanroep (`test.each<[string, number]>(…)`): de index na de sluitende `>` als daar een `(` of
 * template volgt, anders null (dan was `<` een vergelijking).
 * @param {Token[]} tokens @param {number} start
 */
export function typeArgumenten(tokens, start) {
  let diepte = 0;
  const eind = Math.min(tokens.length, start + 500);
  for (let j = start; j < eind; j += 1) {
    const token = tokens[j];
    if (token?.soort !== 'teken') continue;
    if (token.tekst === '=') {
      // `=>` in een functietype mag; een losse `=` betekent dat `<` een vergelijking was.
      if (!teken(tokens[j + 1], '>')) return null;
      j += 1;
      continue;
    }
    diepte += hoekDelta(token.tekst);
    if (diepte === 0) return aanroepNaType(tokens, j);
  }
  return null;
}

/** @param {string} tekst */
function hoekDelta(tekst) {
  if (tekst === '<') return 1;
  return tekst === '>' ? -1 : 0;
}

/** De index na de sluitende `>` als daar een `(` of template volgt, anders null. @param {Token[]} tokens @param {number} j */
function aanroepNaType(tokens, j) {
  const na = tokens[j + 1];
  return teken(na, '(') || (na?.soort === 'literal' && na.tekst === '`') ? j + 1 : null;
}

/**
 * De laatste index van de aanroepketen vanaf `start` (`a.b<T>(…)(…)`, getagde template); begint hij met `(`, dan eerst die
 * groep (`ok && (test(…))`). @param {Token[]} tokens @param {number} start @param {Map<number, number>} paren
 */
function ketenEind(tokens, start, paren) {
  let j = teken(tokens[start], '(') ? (paren.get(start) ?? tokens.length) + 1 : start + 1;
  for (let verder = ketenStap(tokens, j, paren); verder !== null; verder = ketenStap(tokens, j, paren)) j = verder;
  return j - 1;
}

/** Eén stap in de keten: de volgende index, of null als de keten op `j` eindigt. @param {Token[]} tokens @param {number} j @param {Map<number, number>} paren */
function ketenStap(tokens, j, paren) {
  const token = tokens[j];
  const volgende = tokens[j + 1];
  if (teken(token, '.') && volgende?.soort === 'naam') return j + 2;
  if (teken(token, '.')) return teken(volgende, '(') ? j + 1 : null;
  if (teken(token, '(')) return (paren.get(j) ?? tokens.length) + 1;
  if (teken(token, '<')) return typeArgumenten(tokens, j);
  return token?.soort === 'literal' && token.tekst === '`' ? j + 1 : null;
}

const OPEN = new Set(['(', '[', '{']);
const SLUIT = new Set([')', ']', '}']);

/** Is de `?` op `index` een ternary (geen `??`, geen optionele parameter `a?:`, `a?)`, `a?,`)? @param {Token[]} tokens @param {number} index */
function ternaryVraag(tokens, index) {
  const volgende = tokens[index + 1];
  if (teken(tokens[index - 1], '?') || teken(volgende, '?')) return false;
  return !(teken(volgende, ':') || teken(volgende, ')') || teken(volgende, ',') || teken(volgende, '='));
}

/** De indexen van elke `:` die bij een ternary hoort, niet bij een objectsleutel, case, label of type (AC-1b). @param {Token[]} tokens */
function ternaryDubbelepunten(tokens) {
  /** @type {Set<number>} */
  const uit = new Set();
  /** @type {number[]} */
  const open = [];
  let diepte = 0;
  tokens.forEach((token, index) => {
    if (token.soort !== 'teken') return;
    if (OPEN.has(token.tekst)) diepte += 1;
    else if (SLUIT.has(token.tekst)) diepte -= 1;
    else if (token.tekst === '?' && ternaryVraag(tokens, index)) open.push(diepte);
    else if (token.tekst === ':' && open.at(-1) === diepte) {
      open.pop();
      uit.add(index);
    }
  });
  return uit;
}

/**
 * Volgt de keten op kortsluiting (`&&`, `||`, `??`) of op `?`/`:` van een ternary (AC-1b)?
 * @param {Token[]} tokens @param {number} index @param {Set<number>} ternary de `:`-indexen van ternaries
 */
function naKortsluiting(tokens, index, ternary) {
  const vorige = tokens[index - 1];
  const ervoor = tokens[index - 2];
  if (teken(vorige, '&')) return teken(ervoor, '&');
  if (teken(vorige, '|')) return teken(ervoor, '|');
  return teken(vorige, '?') || ternary.has(index - 1);
}

/** Begint hier een keten of een groep `(…)` (geen aanroep: geen naam, `)` of `]` ervoor)? @param {Token[]} tokens @param {number} index */
function ketenStart(tokens, index) {
  const token = tokens[index];
  const vorige = tokens[index - 1];
  if (token?.soort === 'naam') return !teken(vorige, '.');
  return teken(token, '(') && vorige?.soort !== 'naam' && !teken(vorige, ')') && !teken(vorige, ']');
}

/** Begint op `index + 1` een body zonder accolades van `if (…)` of `else`? @param {Token[]} tokens @param {number} index @param {Map<number, number>} open */
function losseBody(tokens, index, open) {
  const token = tokens[index];
  const volgende = tokens[index + 1];
  if (naam(volgende, 'if') || (volgende?.soort !== 'naam' && !teken(volgende, '('))) return false;
  if (naam(token, 'else')) return true;
  return teken(token, ')') && haakjesWoord(tokens, index, open) === 'if';
}

/**
 * Per token: loopt een aanroep die hier begint voorwaardelijk (AC-1)?
 * @param {Token[]} tokens @param {Map<number, number>} paren @returns {boolean[]}
 */
export function voorwaardelijkeTokens(tokens, paren) {
  const open = openers(paren);
  const ternary = ternaryDubbelepunten(tokens);
  /** @type {Blok[]} */
  const blokken = [{ soort: 'functie', naReturn: false }];
  /** @type {Array<[number, number]>} */
  const bereiken = [];
  return tokens.map((_token, index) => {
    if (ketenStart(tokens, index) && naKortsluiting(tokens, index, ternary))
      bereiken.push([index, ketenEind(tokens, index, paren)]);
    const uitslag =
      blokken.some((blok) => blok.soort === 'voorwaarde' || blok.naReturn) ||
      bereiken.some(([van, tot]) => van <= index && index <= tot);
    stap({ tokens, index, open, paren }, blokken, bereiken);
    return uitslag;
  });
}

/**
 * Werkt blokken en bereiken bij na het token op `index`.
 * @param {{ tokens: Token[], index: number, open: Map<number, number>, paren: Map<number, number> }} plek
 * @param {Blok[]} blokken @param {Array<[number, number]>} bereiken
 */
function stap({ tokens, index, open, paren }, blokken, bereiken) {
  const token = tokens[index];
  if (teken(token, '{')) blokken.push({ soort: bloksoort(tokens, index, open), naReturn: false });
  else if (teken(token, '}') && blokken.length > 1) blokken.pop();
  else if ((naam(token, 'return') || naam(token, 'throw')) && !teken(tokens[index - 1], '.')) {
    const functie = blokken.findLast((blok) => blok.soort === 'functie');
    if (functie !== undefined) functie.naReturn = true;
  }
  if (!losseBody(tokens, index, open)) return;
  // `if (x) await test(…)`: de keten begint na `await`.
  const start = naam(tokens[index + 1], 'await') ? index + 2 : index + 1;
  bereiken.push([index + 1, ketenEind(tokens, start, paren)]);
}

/** Staat de naam in een import-, export- of destructuringlijst (`import { test } from …`)? @param {Token[]} tokens @param {number} index */
function inDeclaratieLijst(tokens, index) {
  let j = index - 1;
  while (tokens[j]?.soort === 'naam' || teken(tokens[j], ',') || teken(tokens[j], ':')) j -= 1;
  const voor = tokens[j - 1];
  return teken(tokens[j], '{') && voor?.soort === 'naam' && DECLARATIE_LIJST.has(voor.tekst);
}

/** Volgt op `index` een `=>`, eventueel na een returntype (`(it): string =>`)? @param {Token[]} tokens @param {number} index */
function pijlNa(tokens, index) {
  if (!teken(tokens[index], ':')) return teken(tokens[index], '=') && teken(tokens[index + 1], '>');
  let diepte = 0;
  for (let j = index + 1; j < Math.min(tokens.length, index + 200); j += 1) {
    const token = tokens[j];
    if (diepte === 0 && teken(token, '=')) return teken(tokens[j + 1], '>');
    if (diepte === 0 && EINDE_TYPE.has(token?.tekst ?? '') && token?.soort === 'teken') return false;
    diepte += typeDiepte(token);
  }
  return false;
}

const EINDE_TYPE = new Set([';', ',', ')']);

/** +1 bij een openend haakje of `<`, -1 bij een sluitend of `>`. @param {Token | undefined} token */
function typeDiepte(token) {
  if (token?.soort !== 'teken') return 0;
  if (OPEN.has(token.tekst) || token.tekst === '<') return 1;
  return SLUIT.has(token.tekst) || token.tekst === '>' ? -1 : 0;
}

/** Staat de naam in de parameterlijst van een arrow-functie (`(it) => it.id`)? @param {Token[]} tokens @param {number} index @param {Map<number, number>} paren */
function inArrowParameters(tokens, index, paren) {
  let diepte = 0;
  for (let j = index - 1; j >= 0; j -= 1) {
    if (teken(tokens[j], ')')) diepte += 1;
    if (teken(tokens[j], '(')) {
      if (diepte === 0) {
        return pijlNa(tokens, (paren.get(j) ?? tokens.length) + 1);
      }
      diepte -= 1;
    }
  }
  return false;
}

/** Staat er vóór de naam een `.` of een declaratiewoord (`const`, `typeof`, `import` …)? @param {Token | undefined} vorige */
function declaratieErvoor(vorige) {
  return teken(vorige, '.') || (vorige?.soort === 'naam' && GEEN_WAARDE_NA.has(vorige.tekst));
}

/** Wordt de naam aangeroepen, gevolgd door een eigenschap of typeargumenten, of als sleutel/parameter genoemd? @param {Token[]} tokens @param {number} index */
function aanroepOfSleutel(tokens, index) {
  const vorige = tokens[index - 1];
  const volgende = tokens[index + 1];
  if (teken(volgende, '.') || teken(volgende, '(') || teken(volgende, '<')) return true;
  if (volgende?.soort === 'literal' && volgende.tekst === '`') return true;
  if (teken(volgende, '=')) return !teken(tokens[index + 2], '=');
  const sleutel = teken(vorige, '(') || teken(vorige, ',') || teken(vorige, '{');
  return sleutel && (teken(volgende, ':') || (teken(volgende, '?') && teken(tokens[index + 2], ':')));
}

/** Aantal plekken waar `test`, `it`, `describe` of `suite` als waarde staat (AC-2). @param {Token[]} tokens @param {Map<number, number>} paren */
export function testAlsWaarde(tokens, paren) {
  let aantal = 0;
  tokens.forEach((token, index) => {
    if (token.soort !== 'naam' || !TESTNAMEN.has(token.tekst) || declaratieErvoor(tokens[index - 1])) return;
    if (aanroepOfSleutel(tokens, index)) return;
    if (inDeclaratieLijst(tokens, index) || inArrowParameters(tokens, index, paren)) return;
    aantal += 1;
  });
  return aantal;
}
