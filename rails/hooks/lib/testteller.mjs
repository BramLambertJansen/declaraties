// Testteller (leerpunt #424): telt testgevallen en skips in een JS/TS-testbestand met een kleine lexer zonder
// dependency, zodat de guard (geen install, ADR 0045 punt 15–19) en het rolhek (alleen gecontroleerde code van main,
// R-ROL-09) hem kunnen draaien. Commentaar, strings, template-literals, regex-literals en JSX-tekst leveren geen
// tokens (expressies in `${…}` en JSX-`{…}` wel, in een eigen lijst); daarna telt een pass over aanroepketens (`test.each(t)(…)`, `ctx.skip()`). Eén geval per aanroepplek.

/** @typedef {{ soort: 'naam' | 'teken' | 'literal', tekst: string }} Token */

const NAAM_START = /[\p{ID_Start}$_]/u;
const NAAM_DEEL = /[\p{ID_Continue}$‌‍]/u;
const SLUIT_EXPRESSIE = new Set([')', ']', '}']);
/** Na deze woorden begint een expressie: `/` is dan een regex en `<` in .tsx een element. */
const EXPRESSIE_WOORDEN = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await',
]);

/** Na `)` van deze woorden begint een expressie (`if (ok) /re/.test(s)`). */
const CONTROLE_WOORDEN = new Set(['if', 'while', 'for', 'with']);

class Lexer {
  /** @param {string} bron @param {boolean} jsx */
  constructor(bron, jsx) {
    this.bron = bron;
    this.jsx = jsx;
    this.i = 0;
    /** @type {Token[]} */
    this.tokens = [];
    /** Tokens uit elke `${…}` en JSX-`{…}`: ze tellen mee, maar zetten geen keten van buiten voort. @type {Token[][]} */
    this.binnen = [];
    /** Per open `(`: volgt hij op if/while/for/with? @type {boolean[]} */
    this.haakjes = [];
    this.naControle = false;
  }

  /** Begint hier een expressie, zodat `/` een regex is en `<` in .tsx een element? */
  expressieStart() {
    const vorige = this.vorige();
    if (vorige === undefined) return true;
    if (vorige.soort === 'naam') return EXPRESSIE_WOORDEN.has(vorige.tekst);
    if (vorige.soort !== 'teken' || !SLUIT_EXPRESSIE.has(vorige.tekst)) return vorige.soort === 'teken';
    if (vorige.tekst === ')') return this.naControle;
    // Na `}` (blok of object) beslist de regel: een regex begint een nieuwe regel, een deling zelden.
    return vorige.tekst === '}' && /\n[ \t]*$/.test(this.bron.slice(Math.max(0, this.i - 200), this.i));
  }

  /** @param {string} c */
  teken(c) {
    const vorige = this.vorige();
    if (c === '(') this.haakjes.push(vorige?.soort === 'naam' && CONTROLE_WOORDEN.has(vorige.tekst));
    if (c === ')') this.naControle = this.haakjes.pop() ?? false;
    this.push('teken', c);
    this.i += 1;
  }

  /** @param {Token['soort']} soort @param {string} tekst */
  push(soort, tekst) {
    this.tokens.push({ soort, tekst });
  }

  vorige() {
    return this.tokens.at(-1);
  }

  /** Lext tot het einde, of tot de `}` die een `${`- of JSX-expressie sluit (die wordt overgeslagen). @param {boolean} binnen */
  expressie(binnen) {
    let diepte = 0;
    while (this.i < this.bron.length) {
      const c = this.bron[this.i] ?? '';
      if (binnen && c === '}' && diepte === 0) {
        this.i += 1;
        return;
      }
      if (c === '{') diepte += 1;
      if (c === '}') diepte -= 1;
      this.stap(c);
    }
  }

  /** @param {string} c */
  stap(c) {
    const volgend = this.bron[this.i + 1] ?? '';
    if (/\s/.test(c)) this.i += 1;
    else if (c === '/' && volgend === '/') this.tot('\n', 2);
    else if (c === '/' && volgend === '*') this.tot('*/', 2);
    else if (c === "'" || c === '"') this.string(c);
    else if (c === '`') this.template();
    else if (c === '/' && this.expressieStart()) this.regex();
    else if (c === '<' && this.jsx && this.expressieStart() && this.element()) this.push('literal', '<>');
    else if (c === '?' && volgend === '.' && !/[0-9]/.test(this.bron[this.i + 2] ?? '')) {
      // `a?.b` en `a?.()` als `.`: een optionele keten blijft een keten (`ctx?.skip()`).
      this.push('teken', '.');
      this.i += 2;
    }
    else if (NAAM_START.test(c)) this.naam();
    else if (/[0-9]/.test(c)) this.getal();
    else this.teken(c);
  }

  /** Slaat over tot en met `einde` (commentaar). @param {string} einde @param {number} start */
  tot(einde, start) {
    const eind = this.bron.indexOf(einde, this.i + start);
    this.i = eind === -1 ? this.bron.length : eind + einde.length;
  }

  /** @param {string} quote */
  string(quote) {
    this.i += 1;
    while (this.i < this.bron.length) {
      const c = this.bron[this.i];
      this.i += c === '\\' ? 2 : 1;
      if (c === quote || c === '\n') break;
    }
    this.push('literal', quote);
  }

  template() {
    this.i += 1;
    while (this.i < this.bron.length) {
      const c = this.bron[this.i];
      if (c === '\\') this.i += 2;
      else if (c === '`') break;
      else if (c === '$' && this.bron[this.i + 1] === '{') this.binnenExpressie(2);
      else this.i += 1;
    }
    this.i += 1;
    this.push('literal', '`');
  }

  /** Lext een `${…}` of `{…}` in een eigen lijst, zodat de tokens erin geen keten van buiten voortzetten. @param {number} open */
  binnenExpressie(open) {
    const buiten = { tokens: this.tokens, haakjes: this.haakjes };
    this.tokens = [];
    this.haakjes = [];
    this.binnen.push(this.tokens);
    this.i += open;
    this.expressie(true);
    this.tokens = buiten.tokens;
    this.haakjes = buiten.haakjes;
  }

  regex() {
    let klasse = false;
    this.i += 1;
    while (this.i < this.bron.length) {
      const c = this.bron[this.i];
      if (c === '\n') break;
      this.i += c === '\\' ? 2 : 1;
      if (c === '[') klasse = true;
      else if (c === ']') klasse = false;
      else if (c === '/' && !klasse) break;
    }
    while (NAAM_DEEL.test(this.bron[this.i] ?? '')) this.i += 1;
    this.push('literal', '/');
  }

  naam() {
    const start = this.i;
    while (NAAM_DEEL.test(this.bron[this.i] ?? '')) this.i += 1;
    this.push('naam', this.bron.slice(start, this.i));
  }

  getal() {
    while (/[\w.]/.test(this.bron[this.i] ?? '')) this.i += 1;
    this.push('literal', '0');
  }

  /** Een JSX-element of -fragment vanaf `<`; false (en niets verbruikt) als het geen element is (`<T,>() =>`). */
  element() {
    const rest = this.bron.slice(this.i, this.i + 200);
    const naam = /^<\s*(?:>|([\p{ID_Start}$_][\p{ID_Continue}$.:-]*))/u.exec(rest);
    // Een generieke arrow-functie (`<Value,>(v) =>`, `<T extends U>`) is geen element; toets na de héle naam.
    if (naam === null || /^\s*(?:,|extends\b)/.test(rest.slice(naam[0].length))) return false;
    this.i += naam[0].length;
    if (naam[1] === undefined || !this.attributen()) this.kinderen();
    return true;
  }

  /** Tot `>` (true als er kinderen volgen niet: `/>`). Strings in attributen zonder escapes, `{…}` als expressie. */
  attributen() {
    while (this.i < this.bron.length) {
      const c = this.bron[this.i];
      if (c === '/' && this.bron[this.i + 1] === '>') {
        this.i += 2;
        return true;
      }
      if (c === '>') {
        this.i += 1;
        return false;
      }
      if (c === '"' || c === "'") this.tot(c, 1);
      else if (c === '{') this.binnenExpressie(1);
      else this.i += 1;
    }
    return true;
  }

  /** JSX-tekst, geneste elementen en `{…}` tot de sluittag. */
  kinderen() {
    while (this.i < this.bron.length) {
      const c = this.bron[this.i];
      if (c === '<' && this.bron[this.i + 1] === '/') {
        this.tot('>', 2);
        return true;
      }
      if (c === '<') {
        if (!this.element()) this.i += 1;
      } else if (c === '{') this.binnenExpressie(1);
      else this.i += 1;
    }
    return true;
  }
}

/** Per `(` de index van de bijbehorende `)`; zonder partner het einde. @param {Token[]} tokens */
function haakjesParen(tokens) {
  /** @type {Map<number, number>} */
  const paren = new Map();
  /** @type {number[]} */
  const open = [];
  tokens.forEach((token, index) => {
    if (token.soort !== 'teken') return;
    if (token.tekst === '(') open.push(index);
    if (token.tekst === ')') paren.set(open.pop() ?? -1, index);
  });
  for (const index of open) paren.set(index, tokens.length);
  return paren;
}

/**
 * Typeargumenten vóór een aanroep (`test.each<[string, number]>(…)`): de index na de sluitende `>` als daar een `(` of
 * template volgt, anders null (dan was `<` een vergelijking).
 * @param {Token[]} tokens @param {number} start
 */
function typeArgumenten(tokens, start) {
  let diepte = 0;
  for (let j = start; j < Math.min(tokens.length, start + 500); j += 1) {
    const { soort, tekst } = tokens[j] ?? { soort: 'literal', tekst: '' };
    if (soort !== 'teken') continue;
    if (tekst === '=' && tokens[j + 1]?.tekst !== '>') return null;
    if (tekst === '=') j += 1;
    if (tekst === '<') diepte += 1;
    if (tekst === '>') diepte -= 1;
    if (diepte === 0) {
      const na = tokens[j + 1];
      return na?.tekst === '(' || (na?.soort === 'literal' && na.tekst === '`') ? j + 1 : null;
    }
  }
  return null;
}

/** @typedef {{ soort: 'eigenschap', naam: string } | { soort: 'aanroep' }} Schakel */

/** De aanroepketen vanaf een naam: `.naam`, `(…)` en een getagde template. @param {Token[]} tokens @param {number} start @param {Map<number, number>} paren */
function keten(tokens, start, paren) {
  /** @type {Schakel[]} */
  const schakels = [];
  let j = start + 1;
  for (;;) {
    const token = tokens[j];
    const volgende = tokens[j + 1];
    if (token?.tekst === '.' && token.soort === 'teken' && volgende?.tekst === '(' && volgende.soort === 'teken') {
      j += 1;
    } else if (token?.tekst === '.' && token.soort === 'teken' && volgende?.soort === 'naam') {
      schakels.push({ soort: 'eigenschap', naam: volgende.tekst });
      j += 2;
    } else if (token?.soort === 'teken' && token.tekst === '(') {
      schakels.push({ soort: 'aanroep' });
      j = (paren.get(j) ?? tokens.length) + 1;
    } else if (token?.soort === 'teken' && token.tekst === '<' && typeArgumenten(tokens, j) !== null) {
      j = typeArgumenten(tokens, j) ?? j;
    } else if (token?.soort === 'literal' && token.tekst === '`') {
      schakels.push({ soort: 'aanroep' });
      j += 1;
    } else return schakels;
  }
}

const TEST_NAMEN = new Set(['test', 'it']);
const SUITE_NAMEN = new Set(['test', 'it', 'describe', 'suite']);
/** Laat een geval een geval: `test.concurrent(…)`, `test.each(t)(…)`. */
const GEVAL_MODIFIERS = new Set(['concurrent', 'sequential', 'each', 'for']);
const FABRIEKEN = new Set(['each', 'for']);
/** Zet een test (of andere tests) uit; `skip`/`todo`/`fixme` op elk object (`ctx.skip()`), de rest op test en suite. */
const SKIP_OVERAL = new Set(['skip', 'todo', 'fixme']);
const SKIP_SUITE = new Set(['only', 'fails', 'skipIf', 'runIf']);
const SKIP_FUNCTIES = new Set(['xit', 'xtest', 'xdescribe', 'skip']);

/** Aantal geregistreerde gevallen in één keten. @param {string} wortel @param {Schakel[]} schakels */
function gevallen(wortel, schakels) {
  if (!TEST_NAMEN.has(wortel)) return 0;
  let aantal = 0;
  let fabriek = false;
  for (const schakel of schakels) {
    if (schakel.soort === 'eigenschap') {
      if (!GEVAL_MODIFIERS.has(schakel.naam)) return aantal;
      fabriek = FABRIEKEN.has(schakel.naam);
    } else if (fabriek) fabriek = false;
    else aantal += 1;
  }
  return aantal;
}

/** 1 als de keten vanaf de wortel een skip aanroept (`xit(`, `test.skipIf(c)(`). @param {string} wortel @param {Schakel[]} schakels */
function skips(wortel, schakels) {
  if (SKIP_FUNCTIES.has(wortel) && schakels[0]?.soort === 'aanroep') return 1;
  if (!SUITE_NAMEN.has(wortel)) return 0;
  const aanroep = schakels.findLastIndex((schakel) => schakel.soort === 'aanroep');
  const uit = schakels
    .slice(0, aanroep === -1 ? 0 : aanroep)
    .some((s) => s.soort === 'eigenschap' && SKIP_SUITE.has(s.naam));
  return uit ? 1 : 0;
}

/**
 * `.skip`/`.todo`/`.fixme` met een aanroep verderop in de keten, op elke ontvanger: ook `(await p).skip()` en
 * `getCtx().skip()`, waar de keten niet bij een naam begint. @param {Token[]} tokens @param {number} index @param {Map<number, number>} paren
 */
function eigenschapSkip(tokens, index, paren) {
  const token = tokens[index];
  const vorige = tokens[index - 1];
  if (token === undefined || !SKIP_OVERAL.has(token.tekst) || vorige?.tekst !== '.' || vorige.soort !== 'teken') return 0;
  return keten(tokens, index, paren).some((schakel) => schakel.soort === 'aanroep') ? 1 : 0;
}

/** @param {string} bron @param {string} pad repo-pad; `.jsx`/`.tsx` zet JSX aan @returns {{ cases: number, skips: number }} */
export function telTests(bron, pad) {
  const lexer = new Lexer(bron, /\.[jt]sx$/.test(pad));
  lexer.expressie(false);
  const totaal = { cases: 0, skips: 0 };
  for (const tokens of [lexer.tokens, ...lexer.binnen]) {
    const deel = telLijst(tokens);
    totaal.cases += deel.cases;
    totaal.skips += deel.skips;
  }
  return totaal;
}

/** @param {Token[]} tokens */
function telLijst(tokens) {
  const paren = haakjesParen(tokens);
  const totaal = { cases: 0, skips: 0 };
  tokens.forEach((token, index) => {
    if (token.soort !== 'naam') return;
    const vorige = tokens[index - 1];
    totaal.skips += eigenschapSkip(tokens, index, paren);
    if (vorige?.soort === 'teken' && vorige.tekst === '.') return;
    const schakels = keten(tokens, index, paren);
    totaal.cases += gevallen(token.tekst, schakels);
    totaal.skips += skips(token.tekst, schakels);
  });
  return totaal;
}
