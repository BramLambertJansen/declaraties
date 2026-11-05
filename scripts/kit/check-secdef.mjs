// check:secdef (AGENTS.md "`security definer` alleen met `set search_path = ''`, volledig gekwalificeerde namen en eigenaar
// `app_definer`", framework §6): leest db/migrations op volgorde, zonder database. Elke `create function`/`create procedure` met
// `security definer`:
//  1. heeft in de kop `set search_path = ''` (of `to ''`), niets anders;
//  2. heeft zelf een schemanaam, en noemt in de body tabellen (na from, join, insert into, update, merge into, truncate, lock)
//     en functies (`naam(`) alleen met schema (`public.x`, `pg_catalog.y`). SQL-syntax als `exists (`, `coalesce(` en
//     typemodifiers als `numeric(` tellen niet; namen uit een eigen `with` ook niet;
//  3. is aan het eind van de migratie waarin hij ontstaat of wijzigt van `app_definer` (`alter function … owner to app_definer`).
//     `create or replace` houdt de eigenaar van de vorige versie, zoals Postgres;
//  4. heeft geen overload (over alle migraties heen), zodat koppelen op naam klopt.
// Fail-closed: `alter function … security definer` faalt, en `security definer` op een plek die de check niet als create leest
// (een do-blok, dynamische SQL) ook.
//
// Views (roadmap stuk 4): een view zonder `security_invoker = true` leest met de rechten van zijn eigenaar, net als een
// security definer-functie (zoals app.accounts, ADR 0043). Zo'n view:
//  5. heeft een schemanaam en `security_barrier` (het filter gaat vóór filters van de aanroeper);
//  6. noemt tabellen en functies alleen met schema (regel 2);
//  7. filtert op de actor: de `where` roept een functie uit schema app aan (bijv. `(select app.is_mfa_admin())`);
//  8. is aan het eind van zijn migratie van `app_definer` (`alter view … owner to app_definer`).
// Een view met `security_invoker` aan (een waarde die Postgres als waar leest) valt onder de RLS van de aanroeper en hoeft
// niets. Fail-closed: een materialized view (ook unlogged), view-opties wijzigen, hernoemen of verplaatsen via alter, een
// view of eigenaar wisselen in een do-blok of dynamische SQL, en een definer-view met union, except of intersect falen (dus
// ook een recursieve definer-view: maak die security_invoker).
// Het actorfilter (7) is een heuristiek: hij ziet een `app.`-functie na `where`, niet of die het echte filter is.
// De pgTAP-functiecatalogus (db/tests/functies.sql, in test:db) controleert eigenaar en search_path daarnaast in de database;
// deze check vangt het eerder (gate:fast) en controleert ook de namen. Twijfel telt als fout: herschrijf de SQL of vraag de eigenaar.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = 'db/migrations';
const EIGENAAR = 'app_definer';
const ID = String.raw`(?:"(?:[^"]|"")+"|[a-z_][\w$]*)`;
const NAAM = String.raw`${ID}(?:\s*\.\s*${ID})?`;
const CREATE = new RegExp(String.raw`^\s*create\s+(or\s+replace\s+)?(?:function|procedure)\s+(${NAAM})\s*\(`, 'i');
const ALTER = new RegExp(String.raw`^\s*alter\s+(?:function|procedure|routine)\s+(${NAAM})`, 'i');
const DROP = new RegExp(String.raw`^\s*drop\s+(?:function|procedure|routine)\s+(?:if\s+exists\s+)?(${NAAM})`, 'i');
const CREATE_VIEW = new RegExp(
  String.raw`^\s*create\s+(or\s+replace\s+)?(?:(?:temp|temporary|unlogged)\s+)?(recursive\s+)?(materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(${NAAM})`,
  'i',
);
const ALTER_VIEW = new RegExp(
  String.raw`^\s*alter\s+(?:materialized\s+)?(?:view|table)\s+(?:if\s+exists\s+)?(?:only\s+)?(${NAAM})`,
  'i',
);
const DROP_VIEW = new RegExp(
  String.raw`^\s*drop\s+(?:materialized\s+)?view\s+(?:if\s+exists\s+)?(${NAAM}(?:\s*,\s*${NAAM})*)`,
  'i',
);
// Ergens in een statement, ook in een body of string: een view maken, of een view of tabel van eigenaar of opties wisselen.
const VIEW_OVERAL =
  /\bcreate\s+(?:or\s+replace\s+)?(?:(?:temp|temporary|unlogged)\s+)?(?:recursive\s+)?(?:materialized\s+)?view\b/gi;
const ALTER_VIEW_OVERAL = /\balter\s+(?:materialized\s+)?(?:view|table)\b[^;]*?\b(?:owner\s+to|set\s*\(|reset\s*\()/gi;
// Waarden die Postgres (parse_bool) als waar leest; alles anders telt niet als aan.
const WAAR = new Set(['t', 'tr', 'tru', 'true', 'y', 'ye', 'yes', 'on', '1']);
const TOKEN = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"|\$(?:[A-Za-z_]\w*)?\$|[^-/'"$;]+|[\s\S]/y;
const TEKST = /'(?:[^']|'')*'/g;
const BODY = /\uE001[^\uE001\uE002]*\uE002/g;
// Gevolgd door `(` maar geen functieaanroep: SQL- en PL/pgSQL-syntax, en typemodifiers (typen vallen buiten deze check).
const SYNTAX = new Set(
  (
    'all and any array as atomic between by case cast check coalesce conflict cube default distinct do else elsif except ' +
    'exists extract filter for from greatest group having if ilike in include intersect into is join key lateral least ' +
    'like limit loop not nullif of offset on only or over overlay partition perform position raise return returns ' +
    'rollup row select set sets similar some substring table then to trim union unique using values when where while ' +
    'with within bit char character decimal float interval numeric time timestamp varbit varchar'
  ).split(' '),
);

// Typen van meer woorden: het eerste woord is dan geen argumentnaam.
const TYPE_BEGIN = new Set(['bit', 'char', 'character', 'double', 'interval', 'national', 'time', 'timestamp']);

/** @typedef {{ naam: string, sql: string }} Migratie */
/** @typedef {{ tekst: string, regel: number }} Statement */
/** @typedef {{ secdef: boolean, eigenaar: string | null, signaturen: Set<string> }} Functie */

/**
 * Haalt commentaar weg (regels blijven staan) en zet dollar-gequote bodies als code tussen \uE001 en \uE002.
 * Bovenaan wordt een `;` een \0, zodat statements te splitsen zijn; in een body blijft hij staan.
 * @param {string} sql
 * @param {boolean} boven
 * @returns {string}
 */
function schoon(sql, boven) {
  const token = new RegExp(TOKEN.source, 'y');
  let uit = '';
  for (let m = token.exec(sql); m !== null; m = token.exec(sql)) {
    const [t] = m;
    if (t.startsWith('--') || t.startsWith('/*')) uit += t.replace(/[^\n]/g, ' ');
    else if (t === ';') uit += boven ? '\0' : ';';
    else if (t.length > 1 && t.startsWith('$') && t.endsWith('$')) {
      const eind = sql.indexOf(t, token.lastIndex);
      const tot = eind === -1 ? sql.length : eind;
      uit += `\uE001${schoon(sql.slice(token.lastIndex, tot), false)}\uE002`;
      token.lastIndex = eind === -1 ? sql.length : eind + t.length;
    } else uit += t;
  }
  return uit;
}

/**
 * @param {string} sql
 * @returns {Statement[]}
 */
export function statements(sql) {
  let regel = 1;
  return schoon(sql, true)
    .split('\0')
    .map((tekst) => {
      const voor = /^\s*/.exec(tekst)?.[0] ?? '';
      const start = regel + (voor.match(/\n/g)?.length ?? 0);
      regel += tekst.match(/\n/g)?.length ?? 0;
      return { tekst, regel: start };
    })
    .filter(({ tekst }) => tekst.trim() !== '');
}

/** @param {string} naam */
function normaal(naam) {
  return naam
    .split(/\s*\.\s*/)
    .map((deel) => (deel.startsWith('"') ? deel.slice(1, -1).replace(/""/g, '"') : deel.toLowerCase()))
    .join('.');
}

/**
 * Zonder dollar-bodies, ook geneste (`execute $q$ … $q$` in een body).
 * @param {string} tekst
 * @returns {string}
 */
function zonderBodies(tekst) {
  const kaal = tekst.replace(BODY, ' ');
  return kaal === tekst ? kaal : zonderBodies(kaal);
}

/**
 * De kop van een create-statement: zonder dollar-body en zonder SQL-standaard-body (`return …`, `begin atomic`).
 * @param {string} tekst
 */
function kop(tekst) {
  const zonderBody = zonderBodies(tekst);
  const standaard = /\breturn\b|\bbegin\s+atomic\b/i.exec(zonderBody.replace(TEKST, "''"));
  return standaard === null ? zonderBody : zonderBody.slice(0, standaard.index);
}

/**
 * @param {string} kopTekst
 * @returns {string[]}
 */
function searchPathFouten(kopTekst) {
  const waarden = [
    ...kopTekst.matchAll(/\bset\s+search_path\s*(?:=|\bto\b)\s*('(?:[^']|'')*'|[^\s',]+(?:\s*,\s*[^\s',]+)*)/gi),
  ].map(([, waarde = '']) => waarde);
  if (/\bset\s+search_path\s+from\s+current\b/i.test(kopTekst)) waarden.push('from current');
  if (waarden.length === 0) return ["is security definer zonder `set search_path = ''`"];
  return waarden
    .filter((waarde) => waarde !== "''")
    .map((waarde) => `is security definer met search_path ${waarde}; gebruik \`set search_path = ''\``);
}

/**
 * De code waarin namen gekwalificeerd moeten zijn: na de functienaam, zonder tekst, met een eventuele body in quotes.
 * @param {string} tekst
 * @param {number} vanaf
 */
function code(tekst, vanaf) {
  const rest = tekst.slice(vanaf);
  const quoteBody = /\bas\s+'((?:[^']|'')*)'/i.exec(zonderBodies(rest))?.[1];
  const body = quoteBody === undefined ? '' : schoon(quoteBody.replace(/''/g, "'"), false);
  return `${rest} ${body}`.replace(TEKST, "''").replace(/[\uE001\uE002]/g, ' ');
}

/**
 * Namen zonder schema in de body: tabellen na from/join/insert into/… en functieaanroepen.
 * @param {string} body
 * @returns {string[]}
 */
function ongekwalificeerd(body) {
  const eigen = new Set(
    [
      ...body.matchAll(
        new RegExp(
          String.raw`(?:\bwith|,)\s+(?:recursive\s+)?(${ID})\s*(?:\([^()]*\)\s*)?as\s*(?:not\s+)?(?:materialized\s+)?\(`,
          'gi',
        ),
      ),
    ].map(([, naam = '']) => normaal(naam)),
  );
  // extract(epoch from x) en dergelijke: `from` daarin noemt geen tabel.
  const zonderSyntax = body.replace(/\b(?:extract|substring|trim|position|overlay)\s*\([^()]*\)/gi, ' x ');
  const tabel = new RegExp(
    String.raw`(\w+\s+)?\b(?:from|join|insert\s+into|merge\s+into|update|truncate(?:\s+table)?|lock(?:\s+table)?)\s+(?:only\s+)?(${NAAM}|\()`,
    'gi',
  );
  const tabellen = [...zonderSyntax.matchAll(tabel)]
    .filter(([, voor = '', naam = '']) => !/^(?:distinct|do|for|key|search_path)\s+$/i.test(voor) && naam !== '(')
    .map(([, , naam = '']) => naam)
    .filter((naam) => !naam.includes('.') && !eigen.has(normaal(naam)) && !SYNTAX.has(naam.toLowerCase()))
    .map((naam) => `noemt ${naam} zonder schema; schrijf <schema>.${naam} (bijv. public.user_roles)`);
  const aanroepen = [
    ...body.matchAll(
      new RegExp(String.raw`(?<![\w$."])(?<!\b(?:into|from|join|update|table|only|references)\s+)(${ID})\s*\(`, 'gi'),
    ),
  ]
    .map(([, naam = '']) => naam)
    .filter((naam) => !SYNTAX.has(naam.toLowerCase()) && !eigen.has(normaal(naam)))
    .map(
      (naam) =>
        `roept ${naam}() aan zonder schema; schrijf <schema>.${naam}() (bijv. app.current_user_id() of pg_catalog.now())`,
    );
  return [...new Set([...tabellen, ...aanroepen])];
}

/**
 * @param {Statement} statement
 * @param {RegExpExecArray} m de match van CREATE
 * @returns {string[]}
 */
function definitieFouten({ tekst }, m) {
  const naam = m[2] ?? '';
  const fouten = searchPathFouten(kop(tekst));
  if (!naam.includes('.')) fouten.push(`heeft geen schema; schrijf <schema>.${naam}`);
  return [...fouten, ...ongekwalificeerd(code(tekst, m.index + m[0].length - 1))];
}

/**
 * De argumenttypen tussen de haakjes vanaf `open`, zoals Postgres een functie herkent (zonder namen, defaults en OUT).
 * @param {string} tekst
 * @param {number} open de index van `(`
 * @returns {string}
 */
function signatuur(tekst, open) {
  const delen = [''];
  let diepte = 0;
  for (const teken of tekst.slice(open).replace(TEKST, "''")) {
    if (teken === '(') diepte += 1;
    if (teken === ')') diepte -= 1;
    if (diepte === 0) break;
    if (teken === ',' && diepte === 1) delen.push('');
    else delen[delen.length - 1] += teken;
  }
  return delen
    .map((deel, i) => (i === 0 ? deel.slice(1) : deel))
    .map((deel) =>
      deel
        .replace(/(?:\s+default\b|\s*=)[\s\S]*$/i, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' '),
    )
    .filter((deel) => deel !== '' && !/^out\s/.test(deel))
    .map((deel) => deel.replace(/^(?:in|inout|variadic)\s+/, '').split(' '))
    .map((woorden) => (woorden.length > 1 && !TYPE_BEGIN.has(woorden[0] ?? '') ? woorden.slice(1) : woorden).join(' '))
    .join(', ');
}

/**
 * @param {Statement} statement
 * @param {RegExpExecArray} create de match van CREATE
 * @param {Map<string, Functie>} functies
 * @returns {{ naam: string, fouten: string[] }}
 */
function verwerkCreate(statement, create, functies) {
  const naam = normaal(create[2] ?? '');
  const secdef = /\bsecurity\s+definer\b/i.test(kop(statement.tekst).replace(TEKST, "''"));
  const sig = signatuur(statement.tekst, create.index + create[0].length - 1);
  const vorige = functies.get(naam);
  const signaturen = new Set([...(vorige?.signaturen ?? []), sig]);
  const andere = [...signaturen].filter((andere) => andere !== sig);
  functies.set(naam, { secdef: secdef || (vorige?.secdef ?? false), eigenaar: vorige?.eigenaar ?? null, signaturen });
  const fouten = secdef ? definitieFouten(statement, create) : [];
  if (andere.length > 0 && (secdef || vorige?.secdef === true))
    fouten.push(
      `heeft een overload: (${sig}) naast ${andere.map((oud) => `(${oud})`).join(', ')}; een security definer-functie mag geen overload hebben`,
    );
  return { naam, fouten };
}

/**
 * @param {string} tekst
 * @param {Map<string, Functie>} functies
 */
function verwerkDrop(tekst, functies) {
  const drop = DROP.exec(tekst);
  if (drop === null) return;
  const naam = normaal(drop[1] ?? '');
  const functie = functies.get(naam);
  const open = drop.index + drop[0].length;
  if (functie !== undefined && /^\s*\(/.test(tekst.slice(open))) {
    functie.signaturen.delete(signatuur(tekst, tekst.indexOf('(', open)));
    if (functie.signaturen.size > 0) return;
  }
  functies.delete(naam);
}

/**
 * Verwerkt één statement: definities, eigenaren en drops in `functies`; fouten in de definitie terug.
 * @param {Statement} statement
 * @param {Map<string, Functie>} functies
 * @returns {{ naam: string | null, fouten: string[] }}
 */
function verwerk(statement, functies) {
  const { tekst } = statement;
  const create = CREATE.exec(tekst);
  if (create !== null) return verwerkCreate(statement, create, functies);
  const alter = ALTER.exec(tekst);
  const naam = normaal(alter?.[1] ?? '');
  const functie = functies.get(naam);
  if (alter === null || functie === undefined) {
    verwerkDrop(tekst, functies);
    return { naam: null, fouten: [] };
  }
  const eigenaar = /\bowner\s+to\s+("?[\w$]+"?)/i.exec(tekst)?.[1];
  if (eigenaar !== undefined) functie.eigenaar = normaal(eigenaar);
  if (/\bsecurity\s+definer\b/i.test(tekst))
    return { naam, fouten: ['wordt security definer via alter; zet het in create function, met de search_path'] };
  return { naam, fouten: [] };
}

/**
 * Fail-closed: `security definer` op een plek die de check niet als create leest (do-blok, dynamische SQL, tekst).
 * @param {string} tekst
 */
function onbewaakt(tekst) {
  const aantal = tekst.match(/\bsecurity\s+definer\b/gi)?.length ?? 0;
  const create = CREATE.test(tekst) && /\bsecurity\s+definer\b/i.test(kop(tekst).replace(TEKST, "''"));
  return aantal > (create ? 1 : 0);
}

/** @typedef {{ definer: boolean, eigenaar: string | null }} View */

/**
 * Of een view-optie aan staat: zonder waarde, of met een waarde die Postgres als waar leest (ook tussen quotes).
 * @param {string} tekst het create-statement
 * @param {RegExpExecArray} m de match van CREATE_VIEW
 * @param {string} sleutel bijv. security_invoker
 */
function optieAan(tekst, m, sleutel) {
  // Alleen direct na de naam (en een eventuele kolomlijst), zodat een string in de select nooit voor opties doorgaat.
  const rest = zonderBodies(tekst.slice(m.index + m[0].length));
  const opties = /^\s*(?:\([^)]*\)\s*)?with\s*\(([^)]*)\)\s*as\b/i.exec(rest)?.[1] ?? '';
  return opties.split(',').some((optie) => {
    const [naam = '', ...waarde] = optie.split('=');
    if (naam.trim().toLowerCase() !== sleutel) return false;
    if (waarde.length === 0) return true;
    return WAAR.has(
      waarde
        .join('=')
        .trim()
        .replace(/^(['"])(.*)\1$/, '$2')
        .toLowerCase(),
    );
  });
}

/**
 * Fouten in de definitie van een view die met de rechten van zijn eigenaar leest (regels 5–7). Het actorfilter is een
 * heuristiek (een `app.`-functie na `where`); de review en pgTAP blijven de echte grens.
 * @param {string} tekst
 * @param {RegExpExecArray} m de match van CREATE_VIEW
 * @returns {string[]}
 */
function definerViewFouten(tekst, m) {
  const naam = m[4] ?? '';
  const body = zonderBodies(tekst.slice(m.index + m[0].length)).replace(TEKST, "''");
  const select = body.slice(/\bas\b/i.exec(body)?.index ?? 0);
  const fouten = [];
  if (!naam.includes('.')) fouten.push(`heeft geen schema; schrijf <schema>.${naam}`);
  if (!optieAan(tekst, m, 'security_barrier')) {
    fouten.push('leest met de rechten van zijn eigenaar zonder `security_barrier`; schrijf `with (security_barrier)`');
  }
  if (/\b(?:union|except|intersect)\b/i.test(select)) {
    fouten.push(
      'combineert selects (union, except of intersect): de check ziet niet of elke tak een actorfilter heeft; splits de view of gebruik security_invoker',
    );
  }
  if (!/\bapp\s*\.\s*[a-z_]\w*\s*\(/i.test(/\bwhere\b([\s\S]*)$/i.exec(select)?.[1] ?? '')) {
    fouten.push(
      'filtert niet op de actor: de where roept geen functie uit schema app aan (bijv. `(select app.is_mfa_admin())`)',
    );
  }
  return [...fouten, ...ongekwalificeerd(select)];
}

/**
 * Fail-closed: een view maken, of eigenaar en opties van een view of tabel wisselen, op een plek die de check niet leest.
 * @param {string} tekst
 * @param {boolean} create het statement zelf is een create view die de check leest
 */
function viewOnbewaakt(tekst, create) {
  const views = tekst.match(VIEW_OVERAL)?.length ?? 0;
  const alters = tekst.match(ALTER_VIEW_OVERAL)?.length ?? 0;
  return views > (create ? 1 : 0) || alters > (ALTER_VIEW.test(tekst) ? 1 : 0);
}

/**
 * @param {string} tekst
 * @param {RegExpExecArray} create
 * @param {Map<string, View>} views
 */
function createView(tekst, create, views) {
  const naam = normaal(create[4] ?? '');
  if (create[3] !== undefined) {
    return {
      naam: null,
      fouten: [`${naam} is een materialized view: geen RLS en geen actor; gebruik een gewone view of tabel`],
    };
  }
  const invoker = optieAan(tekst, create, 'security_invoker');
  const vorige = views.get(naam);
  views.set(naam, { definer: !invoker, eigenaar: create[1] === undefined ? null : (vorige?.eigenaar ?? null) });
  return { naam, fouten: invoker ? [] : definerViewFouten(tekst, create).map((fout) => `${naam} ${fout}`) };
}

/**
 * @param {string} tekst
 * @param {Map<string, View>} views
 * @returns {{ naam: string | null, fouten: string[] }}
 */
function verwerkView(tekst, views) {
  const create = CREATE_VIEW.exec(tekst);
  if (viewOnbewaakt(tekst, create !== null)) {
    return {
      naam: null,
      fouten: [
        'maakt of wijzigt een view (of eigenaar en opties) op een plek die de check niet leest (bijv. in een do-blok of dynamische SQL); schrijf het als eigen statement',
      ],
    };
  }
  if (create !== null) return createView(tekst, create, views);
  const drop = DROP_VIEW.exec(tekst);
  if (drop !== null) {
    for (const [naam] of (drop[1] ?? '').matchAll(new RegExp(NAAM, 'gi'))) views.delete(normaal(naam));
    return { naam: null, fouten: [] };
  }
  return alterView(tekst, views);
}

/**
 * Eigenaar wisselen mag; opties, naam en schema van een gevolgde view alleen via drop en create (or replace).
 * @param {string} tekst
 * @param {Map<string, View>} views
 * @returns {{ naam: string | null, fouten: string[] }}
 */
function alterView(tekst, views) {
  const alter = ALTER_VIEW.exec(tekst);
  const naam = normaal(alter?.[1] ?? '');
  const view = views.get(naam);
  if (alter === null || view === undefined) return { naam: null, fouten: [] };
  const eigenaar = /\bowner\s+to\s+("?[\w$]+"?)/i.exec(tekst)?.[1];
  if (eigenaar !== undefined) view.eigenaar = normaal(eigenaar);
  if (/\b(?:set|reset)\s*\(/i.test(tekst)) {
    return {
      naam,
      fouten: [
        `${naam} wijzigt view-opties via alter; doe het met create or replace view (security_invoker aan, of een definer-view met barrier, actorfilter en eigenaar ${EIGENAAR})`,
      ],
    };
  }
  if (/\brename\s+to\b|\bset\s+schema\b/i.test(tekst)) {
    return {
      naam,
      fouten: [`${naam} wordt hernoemd of verplaatst; drop de view en maak hem opnieuw onder de nieuwe naam`],
    };
  }
  return { naam, fouten: [] };
}

/**
 * Views (regels 5–8), per migratie; de eigenaar telt aan het eind van de migratie.
 * @param {readonly Migratie[]} migraties op volgorde (versie)
 * @returns {string[]}
 */
export function viewRegels(migraties) {
  /** @type {Map<string, View>} */
  const views = new Map();
  return migraties.flatMap(({ naam: bestand, sql }) => {
    const pad = `${DIR}/${bestand}`;
    /** @type {Map<string, string>} */
    const geraakt = new Map();
    const fouten = statements(sql).flatMap((statement) => {
      const waar = `${pad}:${statement.regel}`;
      const { naam, fouten: eigen } = verwerkView(statement.tekst, views);
      if (naam !== null && !geraakt.has(naam)) geraakt.set(naam, waar);
      return eigen.map((fout) => `${waar}: ${fout}`);
    });
    const eigenaarFouten = [...geraakt]
      .filter(([naam]) => views.get(naam)?.definer === true && views.get(naam)?.eigenaar !== EIGENAAR)
      .map(
        ([naam, waar]) =>
          `${waar}: ${naam} leest met de rechten van zijn eigenaar, maar die is niet ${EIGENAAR}; zet \`alter view ${naam} owner to ${EIGENAAR}\` in dezelfde migratie`,
      );
    return [...fouten, ...eigenaarFouten];
  });
}

/**
 * @param {readonly Migratie[]} migraties op volgorde (versie)
 * @returns {string[]}
 */
export function secdefRegels(migraties) {
  /** @type {Map<string, Functie>} */
  const functies = new Map();
  return migraties.flatMap(({ naam: bestand, sql }) => {
    const pad = `${DIR}/${bestand}`;
    /** @type {Map<string, string>} */
    const geraakt = new Map();
    const fouten = statements(sql).flatMap((statement) => {
      const waar = `${pad}:${statement.regel}`;
      const { naam, fouten: eigen } = verwerk(statement, functies);
      if (naam !== null && !geraakt.has(naam)) geraakt.set(naam, waar);
      if (eigen.length === 0 && onbewaakt(statement.tekst))
        return [
          `${waar}: security definer buiten een create function of procedure die de check leest (bijv. in een do-blok of dynamische SQL); schrijf een eigen create function`,
        ];
      return eigen.map((fout) => `${waar}: ${naam ?? '?'} ${fout}`);
    });
    const eigenaarFouten = [...geraakt]
      .map(([naam, waar]) => ({ naam, waar, functie: functies.get(naam) }))
      .filter(({ functie }) => functie !== undefined && functie.secdef && functie.eigenaar !== EIGENAAR)
      .map(({ naam, waar, functie }) =>
        functie?.eigenaar === null || functie?.eigenaar === undefined
          ? `${waar}: ${naam} is security definer zonder eigenaar ${EIGENAAR}; zet \`alter function ${naam}(…) owner to ${EIGENAAR}\` in dezelfde migratie`
          : `${waar}: ${naam} is security definer met eigenaar ${functie.eigenaar}; de eigenaar is ${EIGENAAR}`,
      );
    return [...fouten, ...eigenaarFouten];
  });
}

/**
 * @param {string} [root]
 * @returns {string[]}
 */
export function secdefFouten(root = '.') {
  const dir = path.join(root, DIR);
  const migraties = readdirSync(dir)
    .filter((naam) => naam.endsWith('.sql'))
    .sort()
    .map((naam) => ({ naam, sql: readFileSync(path.join(dir, naam), 'utf8') }));
  return [...secdefRegels(migraties), ...viewRegels(migraties)];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const fouten = secdefFouten();
  if (fouten.length > 0) {
    console.error(`✗ check:secdef\n${fouten.map((fout) => `  - ${fout}`).join('\n')}`);
    process.exit(1);
  }
  console.info(
    `✓ check:secdef: elke security definer-functie in ${DIR} heeft search_path '', en elke security definer-functie en definer-view heeft namen met schema en eigenaar ${EIGENAAR}`,
  );
}
