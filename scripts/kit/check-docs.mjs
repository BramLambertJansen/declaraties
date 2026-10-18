// check-docs (framework §10, ADR 0011), via de ratchet (scripts/kit/ratchet.mjs): proza mag niet wijzen naar iets dat
// niet bestaat, en de gespiegelde lijsten mogen niet uit elkaar lopen.
//  1. Elk pad en elk `pnpm <script>` tussen backticks in AGENTS.md, CLAUDE.md en .claude/**/*.md bestaat
//     (een kale naam of relatief pad telt als een bestand in git erop eindigt; `/route` is een URL, geen pad).
//  2. Relatieve links in docs/**/*.md en README.md wijzen naar een bestaand bestand.
//  3. ADR- en spec-statussen komen uit de vaste woordenlijst; een goedgekeurde of gebouwde spec heeft "Hergebruik en UX".
//  4. CODEOWNERS noemt precies de gates en jsonGates uit .claude/gates.json (de bron, ADR 0011); `voorReview` valt daarbinnen,
//     `altijdVragen` valt binnen `voorReview`, en de Edit-regels in `ask` van .claude/settings.json zijn precies `altijdVragen`
//     (zonder die lijst: `voorReview`; ADR 0029 punt 8 en 9, ADR 0033 punt 4). `onderhoud` heeft de vorm { repository }.
//  5. `schrijfrecht` van een rol overlapt niet met `gates` (WS-02), op de uitzonderingen in SCHRIJFRECHT_VRIJ na.
//  6. Elk AC-id van een gebouwde spec heeft een testbestand met `<namespace>/AC-n`, of met het AC-id samen met de specnaam
//     of de namespace (sleutel `docs:ac:<spec>:<AC-n>`).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { onderhoudVan } from '../../rails/hooks/lib/rolhek.mjs';

/** @typedef {{ key: string, message: string }} Violation */

const ADR_STATUS = /^Status:\s*(voorgesteld|geaccepteerd|vervangen door \d{4}|vervallen)\b/m;
export const SPEC_STATUS = /^status:\s*(voorstel|goedgekeurd|gebouwd|vervallen)\b/m;
// Pakketbeheer-commando's van pnpm zelf, geen scripts uit package.json.
const PNPM_COMMANDS = new Set(['add', 'install', 'i', 'update', 'up', 'remove', 'rm', 'exec', 'dlx', 'run', 'why']);

/** @param {string} root */
function trackedFiles(root) {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
}

/**
 * @param {string} root
 * @returns {Promise<Violation[]>}
 */
export async function docsViolations(root = '.') {
  const files = trackedFiles(root);
  /** @param {string} file */
  const read = (file) => readFileSync(path.join(root, file), 'utf8');
  return Promise.resolve([
    ...identifierViolations(files, read),
    ...linkViolations(root, files, read),
    ...statusViolations(files, read),
    ...acViolations(files, read),
    ...mirrorViolations(files, read),
    ...(files.includes('.claude/gates.json') ? schrijfrechtViolations(read('.claude/gates.json')) : []),
    ...(files.includes('.claude/gates.json') ? werkmapNegeerViolations(files, read('.claude/gates.json')) : []),
  ]);
}

/**
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function identifierViolations(files, read) {
  const scripts = Object.keys(packageScripts(read('package.json')));
  const sources = [
    'AGENTS.md',
    'CLAUDE.md',
    ...files.filter((file) => file.startsWith('.claude/') && file.endsWith('.md')),
  ];
  return sources
    .filter((file) => files.includes(file))
    .flatMap((file) =>
      [...read(file).matchAll(/`([^`\n]+)`/g)].flatMap(([, id = '']) => {
        const script = /^pnpm ([\w:-]+)/.exec(id)?.[1];
        if (script !== undefined && !PNPM_COMMANDS.has(script) && !scripts.includes(script))
          return [
            {
              key: `docs:${file}:script:${script}`,
              message: `${file}: \`pnpm ${script}\` bestaat niet in package.json`,
            },
          ];
        if (!looksLikePath(id) || pathExists(id, files)) return [];
        return [{ key: `docs:${file}:pad:${id}`, message: `${file}: \`${id}\` bestaat niet in de repo` }];
      }),
    );
}

/** @param {string} text */
export function packageScripts(text) {
  /** @type {unknown} */
  const pkg = JSON.parse(text);
  if (
    typeof pkg !== 'object' ||
    pkg === null ||
    !('scripts' in pkg) ||
    typeof pkg.scripts !== 'object' ||
    pkg.scripts === null
  )
    return {};
  return { ...pkg.scripts };
}

/** @param {string} id */
export function looksLikePath(id) {
  if (id.startsWith('/') || /[*<>{}…\s]/.test(id)) return false;
  return /^[\w.#-]*\/[\w.\-/]*$/.test(id) || /^[\w.-]+\.(md|ts|tsx|mjs|js|json|yaml|yml|sql|sh|css|toml)$/.test(id);
}

/**
 * Het pad waarnaar een verwijzing wijst: aliasstap (`#core/…` naar `src/core/…`) en de afsluitende `/` weg.
 * @param {string} id
 */
export function doelPad(id) {
  return id
    .replace(/^#(core|web|shared|api)\//, 'src/$1/')
    .replace(/^#core\//, 'src/core/')
    .replace(/\/$/, '');
}

/**
 * @param {string} id
 * @param {readonly string[]} files
 */
export function pathExists(id, files) {
  const target = doelPad(id);
  return files.some(
    (file) =>
      file === target || file.endsWith(`/${target}`) || file.startsWith(`${target}/`) || file.includes(`/${target}/`),
  );
}

/**
 * @param {string} root
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function linkViolations(root, files, read) {
  return files
    .filter((file) => (file.startsWith('docs/') || file === 'README.md') && file.endsWith('.md'))
    .flatMap((file) =>
      [...read(file).matchAll(/\]\(([^)\s]+)\)/g)].flatMap(([, link = '']) => {
        if (/^(https?:|mailto:|#)/.test(link)) return [];
        const target = path.join(path.dirname(file), decodeURIComponent(link.split('#')[0] ?? ''));
        if (existsSync(path.join(root, target))) return [];
        return [{ key: `docs:${file}:link:${link}`, message: `${file}: link naar ${link} wijst naar niets` }];
      }),
    );
}

/**
 * Twee branches kiezen onafhankelijk hetzelfde volgende nummer; git merget dat zonder conflict (twee bestandsnamen).
 * @param {readonly string[]} adrs
 * @returns {Violation[]}
 */
function duplicateAdrNumbers(adrs) {
  /** @type {Map<string, string[]>} */
  const byNumber = new Map();
  for (const file of adrs) {
    const number = /^docs\/adr\/(\d{4})-/.exec(file)?.[1] ?? '';
    byNumber.set(number, [...(byNumber.get(number) ?? []), file]);
  }
  return [...byNumber]
    .filter(([, files]) => files.length > 1)
    .map(([number, files]) => ({
      key: `docs:adr:${number}:dubbel`,
      message: `ADR-nummer ${number} komt in meer dan één bestand voor: ${files.join(', ')}`,
    }));
}

/**
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function statusViolations(files, read) {
  const adrs = files.filter((file) => /^docs\/adr\/\d{4}-[^/]+\.md$/.test(file));
  const specs = files.filter((file) => /^docs\/specs\/[^_/][^/]*\.md$/.test(file));
  return [
    ...duplicateAdrNumbers(adrs),
    ...adrs
      .filter((file) => !ADR_STATUS.test(read(file)))
      .map((file) => ({
        key: `docs:${file}:status`,
        message: `${file}: status niet uit voorgesteld | geaccepteerd | vervangen door NNNN | vervallen`,
      })),
    ...specs.flatMap((file) => {
      const text = read(file);
      const status = SPEC_STATUS.exec(text)?.[1];
      if (status === undefined)
        return [
          {
            key: `docs:${file}:status`,
            message: `${file}: status niet uit voorstel | goedgekeurd | gebouwd | vervallen`,
          },
        ];
      const reuse = /^## Hergebruik en UX\n+(?!##)\S/m.test(text);
      if ((status === 'goedgekeurd' || status === 'gebouwd') && !reuse)
        return [
          {
            key: `docs:${file}:hergebruik`,
            message: `${file}: ${status}, maar de sectie "Hergebruik en UX" ontbreekt of is leeg`,
          },
        ];
      return sjabloonViolations(file, text);
    }),
  ];
}

const MINI_KOPPEN = ['Doel', 'Rollen en wie wat ziet', 'Routes en foutcodes', 'Acceptatiecriteria', 'Hergebruik en UX'];

/**
 * ADR 0029 punt 5: `sjabloon: mini` is de marker van de mini-spec (`docs/specs/_mini.md`); die heeft vaste koppen.
 * @param {string} file @param {string} text
 * @returns {Violation[]}
 */
function sjabloonViolations(file, text) {
  const waarde = /^sjabloon:[ \t]*(.*?)\s*$/m.exec(text.split(/^---\s*$/m)[1] ?? '')?.[1];
  if (waarde === undefined) return [];
  const key = `docs:${file}:sjabloon`;
  if (waarde !== 'mini') return [{ key, message: `${file}: sjabloon is "${waarde}"; alleen "mini" bestaat` }];
  const ontbreekt = MINI_KOPPEN.filter((kop) => !new RegExp(`^## ${kop}\\s*$`, 'm').test(text));
  return ontbreekt.length === 0
    ? []
    : [{ key, message: `${file}: mini-spec mist de koppen ${ontbreekt.map((kop) => `"${kop}"`).join(', ')}` }];
}

// Testpaden uit .claude/gates.json (`testpaden`): `*.test.*`, `*.spec.*`, `db/tests/**`, `e2e/**`, `test/**`.
const TESTBESTAND = /(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$|^(?:db\/tests|e2e|test)\//;
// Een AC-id als heel woord, met een optioneel voorvoegsel `<naam>/` (groep 1); groep 2 is het id.
const AC_ID = /(?<![\w/-])(?:([\w.-]+)\/)?(AC-\d+)(?![\w-])/g;

/** Regex die `naam` als heel woord vindt (geen woordteken of `-` ervoor of erna). @param {string} naam */
function heelWoord(naam) {
  return new RegExp(`(?<![\\w-])${naam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
}

/**
 * Is `ac` van deze spec gedekt door de tekst van één testbestand?
 * @param {string} tekst
 * @param {{ naam: string, namespace: string | undefined }} spec
 * @param {string} ac
 */
function dekt(tekst, spec, ac) {
  const namen = [spec.naam, ...(spec.namespace === undefined ? [] : [spec.namespace])];
  if (namen.some((naam) => heelWoord(`${naam}/${ac}`).test(tekst))) return true;
  return heelWoord(ac).test(tekst) && namen.some((naam) => heelWoord(naam).test(tekst));
}

/**
 * Regel 6: AC-traceerbaarheid van gebouwde specs naar testbestanden.
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function acViolations(files, read) {
  const gebouwd = files
    .filter((file) => /^docs\/specs\/[^_/][^/]*\.md$/.test(file))
    .map((file) => ({ file, text: read(file) }))
    .filter(({ text }) => SPEC_STATUS.exec(text)?.[1] === 'gebouwd');
  if (gebouwd.length === 0) return [];
  const tests = files.filter((file) => TESTBESTAND.test(file)).map(read);
  return gebouwd.flatMap(({ file, text }) => {
    const spec = { naam: path.basename(file, '.md'), namespace: /^namespace:\s*(\S+)\s*$/m.exec(text)?.[1] };
    const eigen = new Set([spec.naam, spec.namespace]);
    // Een AC met het voorvoegsel van een andere spec (`accounts/AC-42`) is een kruisverwijzing, geen eigen AC.
    const ids = [...text.matchAll(AC_ID)]
      .filter(([, voor]) => voor === undefined || eigen.has(voor))
      .map(([, , id = '']) => id);
    const acs = [...new Set(ids)].sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
    return acs
      .filter((ac) => !tests.some((tekst) => dekt(tekst, spec, ac)))
      .map((ac) => ({
        key: `docs:ac:${spec.naam}:${ac}`,
        message: `${file}: ${ac} heeft geen testbestand met ${spec.namespace ?? spec.naam}/${ac} of met ${ac} en de specnaam of namespace`,
      }));
  });
}

/**
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function mirrorViolations(files, read) {
  if (!files.includes('.github/CODEOWNERS') || !files.includes('.claude/settings.json')) return [];
  const owners = new Set(
    read('.github/CODEOWNERS')
      .split('\n')
      .map((line) => line.trim().split(/\s+/)[0] ?? '')
      .filter((entry) => entry !== '' && !entry.startsWith('#'))
      .map((entry) => entry.replace(/^\//, '').replace(/\/$/, '/**')),
  );
  if (!files.includes('.claude/gates.json')) return [];
  const gates = read('.claude/gates.json');
  return [
    ...gatesViolations(owners, gates),
    ...voorReviewViolations(gates, askEditPaths(read('.claude/settings.json'))),
  ];
}

/**
 * `voorReview` ⊆ gates + jsonGates, `altijdVragen` ⊆ `voorReview`, Edit-regels in `ask` = `altijdVragen` (ADR 0033 punt 4).
 * @param {string} text
 * @param {readonly string[]} askPaths
 * @returns {Violation[]}
 */
function voorReviewViolations(text, askPaths) {
  /** @type {unknown} */
  const config = JSON.parse(text);
  const entry = (/** @type {string} */ key) =>
    typeof config === 'object' && config !== null
      ? Object.entries(config).find(([name]) => name === key)?.[1]
      : undefined;
  const list = (/** @type {unknown} */ value) => (Array.isArray(value) ? value.map(String) : []);
  const jsonGates = entry('jsonGates');
  const gates = new Set([
    ...list(entry('gates')),
    ...(typeof jsonGates === 'object' && jsonGates !== null ? Object.keys(jsonGates) : []),
  ]);
  const voorReview = new Set(list(entry('voorReview')));
  const altijd = entry('altijdVragen') === undefined ? null : new Set(list(entry('altijdVragen')));
  return [
    ...[...voorReview]
      .filter((path) => !gates.has(path))
      .map((path) => ({
        key: `docs:spiegel:voorreview-gates:${path}`,
        message: `voorReview noemt ${path}, gates en jsonGates in .claude/gates.json niet`,
      })),
    ...[...(altijd ?? [])]
      .filter((path) => !gedektDoor(path, voorReview))
      .map((path) => ({
        key: `docs:spiegel:altijdvragen-voorreview:${path}`,
        message: `altijdVragen noemt ${path}, voorReview in .claude/gates.json dekt het niet`,
      })),
    ...askViolations(altijd ?? voorReview, altijd === null ? 'voorReview' : 'altijdVragen', new Set(askPaths)),
    ...onderhoudViolations(entry('onderhoud')),
  ];
}

/** Een pad staat letterlijk in de lijst of valt onder een `<map>/**` ervan. @param {string} path @param {ReadonlySet<string>} lijst */
function gedektDoor(path, lijst) {
  return lijst.has(path) || [...lijst].some((glob) => glob.endsWith('/**') && path.startsWith(glob.slice(0, -2)));
}

/**
 * De Edit-regels in `ask` zijn precies `altijdVragen`, of `voorReview` zolang die ontbreekt (ADR 0033 punt 4, ADR 0029 punt 9).
 * @param {ReadonlySet<string>} bron @param {string} naam @param {ReadonlySet<string>} ask
 * @returns {Violation[]}
 */
function askViolations(bron, naam, ask) {
  return [
    ...[...bron]
      .filter((path) => !ask.has(path))
      .map((path) => ({
        key: `docs:spiegel:ask:${path}`,
        message: `${naam} noemt ${path}, \`ask\` in .claude/settings.json niet`,
      })),
    ...[...ask]
      .filter((path) => !bron.has(path))
      .map((path) => ({
        key: `docs:spiegel:voorreview:${path}`,
        message: `\`ask\` noemt ${path}, ${naam} in .claude/gates.json niet`,
      })),
  ];
}

/** `onderhoud` is ontbrekend of precies `{ "repository": "<owner>/<repo>" }` (ADR 0033 punt 2); dezelfde vormcheck als het rolhek. @param {unknown} value @returns {Violation[]} */
function onderhoudViolations(value) {
  try {
    onderhoudVan(value);
    return [];
  } catch (error) {
    return [{ key: 'docs:gates:onderhoud', message: error instanceof Error ? error.message : String(error) }];
  }
}

/**
 * CODEOWNERS = gates + jsonGates uit .claude/gates.json.
 * @param {ReadonlySet<string>} owners
 * @param {string} text
 * @returns {Violation[]}
 */
function gatesViolations(owners, text) {
  /** @type {unknown} */
  const config = JSON.parse(text);
  const entry = (/** @type {string} */ key) =>
    typeof config === 'object' && config !== null
      ? Object.entries(config).find(([name]) => name === key)?.[1]
      : undefined;
  const gates = entry('gates');
  const jsonGates = entry('jsonGates');
  const expected = new Set([
    ...(Array.isArray(gates) ? gates.map(String) : []),
    ...(typeof jsonGates === 'object' && jsonGates !== null ? Object.keys(jsonGates) : []),
  ]);
  return [
    ...[...expected]
      .filter((path) => !owners.has(path))
      .map((path) => ({
        key: `docs:spiegel:codeowners-gates:${path}`,
        message: `.claude/gates.json noemt ${path}, CODEOWNERS niet`,
      })),
    ...[...owners]
      .filter((path) => !expected.has(path))
      .map((path) => ({
        key: `docs:spiegel:gates:${path}`,
        message: `CODEOWNERS noemt ${path}, .claude/gates.json niet`,
      })),
  ];
}

/**
 * `werkmapNegeer` (ADR 0031 besluit 5): een lijst paden onder `.claude/`, zonder `..`, waarvan niets getrackt is.
 * @param {readonly string[]} files
 * @param {string} text
 * @returns {Violation[]}
 */
function werkmapNegeerViolations(files, text) {
  /** @type {unknown} */
  const config = JSON.parse(text);
  const lijst =
    typeof config === 'object' && config !== null
      ? Object.entries(config).find(([n]) => n === 'werkmapNegeer')?.[1]
      : undefined;
  if (lijst === undefined) return [];
  const key = 'docs:werkmapNegeer';
  if (!Array.isArray(lijst) || !lijst.every((pad) => typeof pad === 'string'))
    return [{ key, message: '.claude/gates.json: werkmapNegeer moet een lijst met tekst zijn' }];
  return lijst.flatMap((pad) => {
    const buiten = !pad.startsWith('.claude/') || pad === '.claude/' || pad.split('/').includes('..');
    if (buiten) return [{ key: `${key}:${pad}`, message: `werkmapNegeer: ${pad} valt niet onder .claude/` }];
    const getrackt = files.some((file) => (pad.endsWith('/') ? file.startsWith(pad) : file === pad));
    return getrackt ? [{ key: `${key}:${pad}`, message: `werkmapNegeer: ${pad} is getrackt` }] : [];
  });
}

/**
 * De paden uit `Edit(…)` in `permissions.ask`.
 * @param {string} text
 * @returns {string[]}
 */
function askEditPaths(text) {
  /** @type {unknown} */
  const settings = JSON.parse(text);
  const permissions =
    typeof settings === 'object' && settings !== null && 'permissions' in settings ? settings.permissions : undefined;
  const ask = typeof permissions === 'object' && permissions !== null && 'ask' in permissions ? permissions.ask : [];
  return (Array.isArray(ask) ? ask : [])
    .map((entry) => (typeof entry === 'string' ? /^Edit\((.+)\)$/.exec(entry)?.[1] : undefined))
    .filter((entry) => entry !== undefined);
}

// Uitzonderingen op check 5 (besluit eigenaar, 2026-10-12). Architect en tester schrijven bewust in een gate: specs en ADR's
// (status `goedgekeurd` bewaakt check-spec-approval) en testpaden (bestaande tests bewaakt het rolhek). Developer en hoofdsessie
// zijn vrijgesteld: voor hen handelt het rolhek gates af met ask/deny (rails/hooks/lib/rolhek.mjs, decideByRole).
/** @type {Record<string, (config: { testpaden: string[] }) => string[]>} */
const SCHRIJFRECHT_VRIJ = {
  architect: () => ['docs/adr/**', 'docs/specs/**'],
  tester: (config) => config.testpaden,
};
const SCHRIJFRECHT_ALLES = new Set(['developer', 'hoofdsessie']);

/**
 * Check 5: een rol mag niet zonder ask/deny in een gate schrijven. Alleen de bestandsnaam-gates uit `testpaden`
 * (beginnend met `**\/`, zoals `**\/*.test.*`) tellen niet: die overlappen met elke map, ook `docs/reviews/**`, en een
 * bestaand testbestand bewaakt het rolhek (existingTest). Map-gates (`test/**`, `e2e/**`, `db/tests/**`) tellen wel: daar
 * schrijft alleen de tester (SCHRIJFRECHT_VRIJ).
 * @param {string} text
 * @returns {Violation[]}
 */
function schrijfrechtViolations(text) {
  /** @type {unknown} */
  const raw = JSON.parse(text);
  const entry = (/** @type {string} */ key) =>
    typeof raw === 'object' && raw !== null ? Object.entries(raw).find(([name]) => name === key)?.[1] : undefined;
  const strings = (/** @type {unknown} */ value) => (Array.isArray(value) ? value.map(String) : []);
  const testpaden = strings(entry('testpaden'));
  const naamGates = testpaden.filter((glob) => glob.startsWith('**/'));
  const gates = strings(entry('gates')).filter((gate) => !naamGates.includes(gate));
  const rollen = entry('schrijfrecht');
  if (typeof rollen !== 'object' || rollen === null) return [];
  return Object.entries(rollen)
    .filter(([rol]) => !SCHRIJFRECHT_ALLES.has(rol))
    .flatMap(([rol, globs]) => {
      const vrij = SCHRIJFRECHT_VRIJ[rol]?.({ testpaden }) ?? [];
      return strings(globs)
        .filter((glob) => !vrij.includes(glob))
        .flatMap((glob) => gates.filter((gate) => globsOverlap(glob, gate)).map((gate) => ({ rol, glob, gate })));
    })
    .map(({ rol, glob, gate }) => ({
      key: `docs:schrijfrecht:${rol}:${glob}:${gate}`,
      message: `.claude/gates.json: schrijfrecht van ${rol} (${glob}) overlapt met gate ${gate}`,
    }));
}

/**
 * Glob als NFA-stappen (zelfde taal als globMatch in rails/hooks/lib/rolhek.mjs): `*`, `**`, `**\/` en `?`.
 * Een stap leest één teken: een letterlijk teken, 'segment' (geen `/`) of 'alles'.
 * @typedef {{ from: number, to: number, read: string | null }} Step
 * @param {string} glob
 * @returns {{ steps: Step[], end: number }}
 */
function globNfa(glob) {
  /** @type {Step[]} */
  const steps = [];
  let state = 0;
  let extra = glob.length + 1;
  for (let index = 0; index < glob.length; index += 1) {
    const next = state + 1;
    if (glob.startsWith('**/', index)) {
      const middle = extra++;
      steps.push({ from: state, to: next, read: null }, { from: state, to: middle, read: 'alles' });
      steps.push({ from: middle, to: middle, read: 'alles' }, { from: middle, to: next, read: '/' });
      index += 2;
    } else if (glob.startsWith('**', index)) {
      steps.push({ from: state, to: next, read: null }, { from: state, to: state, read: 'alles' });
      index += 1;
    } else if (glob[index] === '*') {
      steps.push({ from: state, to: next, read: null }, { from: state, to: state, read: 'segment' });
    } else steps.push({ from: state, to: next, read: glob[index] === '?' ? 'segment' : (glob[index] ?? '') });
    state = next;
  }
  return { steps, end: state };
}

/**
 * Of twee leesstappen hetzelfde teken kunnen lezen.
 * @param {string} a
 * @param {string} b
 */
function readsMeet(a, b) {
  if (a === 'alles' || b === 'alles') return true;
  if (a === 'segment') return b !== '/';
  if (b === 'segment') return a !== '/';
  return a === b;
}

/**
 * Echte overlap: bestaat er een pad dat beide globs matcht (`docs/**` en `docs/framework.md`: ja)? Zoekt in het product
 * van de twee NFA's een weg van begin naar eind.
 * @param {string} left
 * @param {string} right
 */
export function globsOverlap(left, right) {
  const a = globNfa(left);
  const b = globNfa(right);
  const seen = new Set(['0,0']);
  const queue = [[0, 0]];
  for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
    const [x = 0, y = 0] = item;
    if (x === a.end && y === b.end) return true;
    const moves = [
      ...a.steps.filter((s) => s.from === x && s.read === null).map((s) => [s.to, y]),
      ...b.steps.filter((s) => s.from === y && s.read === null).map((s) => [x, s.to]),
      ...a.steps
        .filter((s) => s.from === x && s.read !== null)
        .flatMap((s) =>
          b.steps
            .filter((t) => t.from === y && t.read !== null && readsMeet(s.read ?? '', t.read))
            .map((t) => [s.to, t.to]),
        ),
    ];
    for (const move of moves) {
      if (!seen.has(move.join(','))) {
        seen.add(move.join(','));
        queue.push(move);
      }
    }
  }
  return false;
}
