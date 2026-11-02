// check-docs (framework §10, ADR 0045), via de ratchet (scripts/kit/ratchet.mjs): proza mag niet wijzen naar iets dat
// niet bestaat, en de gespiegelde lijsten mogen niet uit elkaar lopen.
//  1. Elk pad en elk `pnpm <script>` tussen backticks in AGENTS.md, CLAUDE.md en .claude/**/*.md bestaat
//     (een kale naam of relatief pad telt als een bestand in git erop eindigt; `/route` is een URL, geen pad).
//  2. Relatieve links in docs/**/*.md en README.md wijzen naar een bestaand bestand.
//  3. ADR- en spec-statussen komen uit de vaste woordenlijst; een goedgekeurde of gebouwde spec heeft "Hergebruik en UX".
//  4. CODEOWNERS noemt precies de gates en jsonGates uit .claude/gates.json (de bron, ADR 0045); `voorReview` valt daarbinnen,
//     `altijdVragen` valt binnen `voorReview`, en de Edit-regels in `ask` van .claude/settings.json zijn precies `altijdVragen`
//     (zonder die lijst: `voorReview`; ADR 0046 punt 27 en 28, ADR 0045 punt 9). `onderhoud` heeft de vorm { repository }.
//  5. `schrijfrecht` van een rol overlapt niet met `gates` (WS-02), op de uitzonderingen in SCHRIJFRECHT_VRIJ na.
//  6. Elk AC-id van een gebouwde spec heeft een testbestand met `<namespace>/AC-n`, of met het AC-id samen met de specnaam
//     of de namespace (sleutel `docs:ac:<spec>:<AC-n>`).
//  7. Spec-discipline: geen lijstitem met `⚠ open` in "Open vragen" bij goedgekeurd of gebouwd (`:open-vraag`); elk pad in
//     "Kopieer de vorm van" bestaat bij voorstel of goedgekeurd (`:vorm`).
//  8. `framework §N` buiten §1–§12, §11a en de `## <n>.`-koppen van het regelboek (niet in docs/adr/); 9. backtick-paden in
//     het regelboek; 10. R-id's in .claude/rules/* en het regelboek; 11. harde grenzen alleen op `AGENTS.md` (9 KB, 100
//     regels) en `CLAUDE.md` (50 regels), sleutels `docs:AGENTS.md:budget:<bytes>` en `docs:<bestand>:regels:<n>`, zodat
//     de ratchet groei en krimp ziet (ADR 0065, scripts/kit/leesbudget.mjs). Hoofdstuk, regelboek, spec en ADR zijn een
//     meting in `pnpm leespad`, nooit een overtreding. `docsMeldingen` geeft "let op" vanaf 85 % van een grens;
//     `docsKrimp` de krimpcheck (AC-6), die de ratchet buiten de baseline houdt.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { onderhoudVan } from '../../rails/hooks/lib/rolhek.mjs';
import { adrNumber, duplicateAdrNumbers, invalidAdrNames } from './adr-numbers.mjs';
import { grensMeldingen, grensViolations, krimpUitGit, krimpZonderBasis } from './leesbudget.mjs';

export { krimpViolations } from './leesbudget.mjs';

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
    ...paragraafViolations(files, read),
    ...(files.includes(REGELBOEK) ? regelboekPadViolations(root, read(REGELBOEK), files) : []),
    ...rIdViolations(files, read),
    ...grensViolations((file) => (files.includes(file) ? read(file) : null)),
  ]);
}

/**
 * Meldingen vanaf 85 % van een harde grens (leesbudget/AC-2); nooit een overtreding.
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function docsMeldingen(root = '.') {
  const files = trackedFiles(root);
  const grens = grensMeldingen((file) => (files.includes(file) ? readFileSync(path.join(root, file), 'utf8') : null));
  return Promise.resolve([...grens, ...krimpZonderBasis(root)]);
}

/**
 * Krimp van bindende documenten tegenover `git merge-base origin/main HEAD` (leesbudget/AC-6); nooit in de baseline.
 * @param {string} root
 * @returns {Promise<Violation[]>}
 */
export async function docsKrimp(root = '.') {
  const boek = path.join(root, REGELBOEK);
  const rIds = existsSync(boek) ? [...readFileSync(boek, 'utf8').matchAll(R_ID)].map(([id]) => id) : [];
  return Promise.resolve(krimpUitGit(root, rIds));
}

const REGELBOEK = 'docs/framework.md';
const ADR_MAP = 'docs/adr/';
const ARCHIEF = 'docs/adr/archief/';
// Regel 2: specs in docs/specs/ en docs/template/specs/ (framework §10); `_template.md` en dergelijke tellen niet.
const SPEC_BESTAND = /^docs\/(?:template\/)?specs\/[^_/][^/]*\.md$/;

/** Regelnummer (1-based) van een positie in een tekst. @param {string} text @param {number} index */
function regelVan(text, index) {
  return text.slice(0, index).split('\n').length;
}

/**
 * Regel 8: `framework §N` of `framework.md §N` wijst naar een bestaande paragraaf: de ankers §1–§12 en §11a, of een
 * `## <n>.`-kop van het regelboek (§13, §8a; ADR 0065 punt 3). ADR's (ook het archief) vallen erbuiten: ze wijzigen
 * niet, hun ankers blijven.
 * @param {readonly string[]} files @param {(file: string) => string} read @returns {Violation[]}
 */
function paragraafViolations(files, read) {
  const koppen = new Set(
    files.includes(REGELBOEK) ? [...read(REGELBOEK).matchAll(/^## (\d+[a-z]?)\./gm)].map(([, n = '']) => n) : [],
  );
  const anker = (/** @type {string} */ n) => n === '11a' || (/^\d+$/.test(n) && Number(n) >= 1 && Number(n) <= 12);
  const geldig = (/** @type {string} */ n) => anker(n) || koppen.has(n);
  return files
    .filter((file) => file.endsWith('.md') && !file.startsWith(ADR_MAP))
    .flatMap((file) => {
      const text = read(file);
      const fout = [...text.matchAll(/\bframework(?:\.md)?`?\s?§(\d+[a-z]?)/g)].filter(([, n = '']) => !geldig(n));
      return fout.map((match) => ({
        key: `docs:${file}:paragraaf:§${match[1] ?? ''}`,
        message: `${file}:${String(regelVan(text, match.index))}: framework §${match[1] ?? ''} bestaat niet; het regelboek kent §1–§12, §11a en zijn eigen \`## <n>.\`-koppen (framework §9)`,
      }));
    });
}

/**
 * Een pad in het regelboek heeft een extensie of eindigt op `/`. Zo tellen `origin/main`, `application/json` en een
 * lintregel als `rails/klassen` niet als pad.
 * @param {string} id
 */
function regelboekPad(id) {
  return looksLikePath(id) && /(?:\.\w+|\/)$/.test(id);
}

/**
 * Begint een pad met een getrackte topmap of een getrackt topbestand, met `./` of met een alias (`#core/…`), dan telt alleen
 * een match vanaf de hoofdmap. Een kale naam of relatief pad (`queries.ts`, `features/`) telt als een getrackt bestand erop
 * eindigt, zoals regel 1.
 * @param {string} id @param {readonly string[]} files
 */
function regelboekPadGetrackt(id, files) {
  const pad = id.replace(/^\.\//, '');
  const top = pad.split('/')[0] ?? '';
  const vanafRoot =
    id.startsWith('./') || id.startsWith('#') || files.some((file) => file === top || file.startsWith(`${top}/`));
  if (!vanafRoot) return pathExists(pad, files);
  const doel = doelPad(pad);
  return files.some((file) => file === doel || file.startsWith(`${doel}/`));
}

/**
 * Getrackt (of een map met getrackte bestanden), of een runtime-artefact dat git niet trackt: een pad dat `.gitignore`
 * negeert, ook als het niet bestaat (`.claude/hooks/.cache/`), of een pad achter een symlink (`node_modules/.bin` in een
 * kopie met `node_modules` als link). De afsluitende `/` blijft staan: zo matcht een map-regel ook zonder de map.
 * Alleen een getrackte `.gitignore` telt: `.git/info/exclude` en de globale `core.excludesFile` verschillen per machine
 * (leerpunt #390). `-v -z` geeft bron, regel, patroon en pad; een negatie (`!…`) negeert niet.
 * @param {string} root @param {string} id @param {readonly string[]} files
 */
function regelboekPadBestaat(root, id, files) {
  const pad = id.replace(/^\.\//, '');
  if (regelboekPadGetrackt(id, files)) return true;
  const { status, stdout, stderr } = spawnSync('git', ['check-ignore', '-v', '-z', '--stdin', '--no-index'], {
    cwd: root,
    input: `${pad}\0`,
    encoding: 'utf8',
    // Git vertaalt zijn meldingen; de C-locale houdt "beyond a symbolic link" taalonafhankelijk.
    env: { ...process.env, LC_ALL: 'C' },
  });
  if (status === 128) return stderr.includes('beyond a symbolic link');
  const [bron = '', , patroon = ''] = stdout.split('\0');
  return status === 0 && path.basename(bron) === '.gitignore' && files.includes(bron) && !patroon.startsWith('!');
}

/**
 * Regel 9: elk backtick-pad in het regelboek bestaat, of staat direct gevolgd door `(nog niet gebouwd)`; die markering bij
 * een bestaand pad is ook een fout.
 * @param {string} root @param {string} text @param {readonly string[]} files @returns {Violation[]}
 */
function regelboekPadViolations(root, text, files) {
  return [...text.matchAll(/`([^`\n]+)`( \(nog niet gebouwd\))?/g)].flatMap((match) => {
    const [, id = '', markering] = match;
    if (!regelboekPad(id)) return [];
    const bestaat = regelboekPadBestaat(root, id, files);
    if (bestaat === (markering === undefined)) return [];
    const plek = `${REGELBOEK}:${String(regelVan(text, match.index))}`;
    return bestaat
      ? [
          {
            key: `docs:${REGELBOEK}:markering:${id}`,
            message: `${plek}: \`${id}\` bestaat, haal "(nog niet gebouwd)" weg (framework §9)`,
          },
        ]
      : [
          {
            key: `docs:${REGELBOEK}:pad:${id}`,
            message: `${plek}: \`${id}\` bestaat niet; zet er "(nog niet gebouwd)" direct achter (framework §9)`,
          },
        ];
  });
}

const R_ID = /\bR-[A-Z]+-\d+(?![\d-])/g;

/**
 * Regel 10: een R-id in `.claude/rules/*` staat letterlijk in het regelboek, en het regelboek definieert elk R-id één keer
 * (een definitie begint de regel, eventueel na een opsommingsteken).
 * @param {readonly string[]} files @param {(file: string) => string} read @returns {Violation[]}
 */
function rIdViolations(files, read) {
  const boek = files.includes(REGELBOEK) ? read(REGELBOEK) : '';
  const bekend = new Set([...boek.matchAll(R_ID)].map(([id]) => id));
  const padregels = files
    .filter((file) => file.startsWith('.claude/rules/'))
    .flatMap((file) =>
      [...new Set([...read(file).matchAll(R_ID)].map(([id]) => id))]
        .filter((id) => !bekend.has(id))
        .map((id) => ({ key: `docs:${file}:r-id:${id}`, message: `${file}: ${id} staat niet in ${REGELBOEK}` })),
    );
  const definities = [...boek.matchAll(/^\s*(?:[-*]\s+)?(?:\*\*)?(R-[A-Z]+-\d+)(?![\d-])/gm)].map(([, id = '']) => id);
  const dubbel = [...new Set(definities.filter((id, index) => definities.indexOf(id) !== index))];
  return [
    ...padregels,
    ...dubbel.map((id) => ({
      key: `docs:${REGELBOEK}:r-id-dubbel:${id}`,
      message: `${REGELBOEK}: ${id} staat er meer dan één keer`,
    })),
  ];
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
        const doel = decodeURIComponent(link.split('#')[0] ?? '');
        if (linkDoelen(file, doel).some((target) => existsSync(path.join(root, target)))) return [];
        return [{ key: `docs:${file}:link:${link}`, message: `${file}: link naar ${link} wijst naar niets` }];
      }),
    );
}

/**
 * Waar een relatieve link mag landen. Binnen `docs/adr/` en `archief/` (framework §10) leest een link uit het archief alsof
 * het bestand nog in `docs/adr/` stond, en een ADR-doel in `docs/adr/` lost ook op naar `archief/`. Een spec met een
 * eigenaarstatus mag niet van inhoud wijzigen, dus ook vanuit een spec lost een ADR-doel op naar `archief/`. Elders geldt
 * alleen het letterlijke pad: die links gaan mee naar het nieuwe pad (ADR 0053 punt 4).
 * @param {string} file @param {string} doel
 */
function linkDoelen(file, doel) {
  const letterlijk = path.posix.join(path.posix.dirname(file), doel);
  if (SPEC_BESTAND.test(file) && /^docs\/adr\/\d{4}-[^/]+\.md$/.test(letterlijk))
    return [letterlijk, letterlijk.replace(ADR_MAP, ARCHIEF)];
  if (path.posix.dirname(file) !== 'docs/adr' && path.posix.dirname(file) !== 'docs/adr/archief') return [letterlijk];
  const alsActief = path.posix.join(ADR_MAP, doel);
  return [
    letterlijk,
    alsActief,
    ...[letterlijk, alsActief].flatMap((pad) =>
      /^docs\/adr\/\d{4}-[^/]+\.md$/.test(pad) ? [pad.replace(ADR_MAP, ARCHIEF)] : [],
    ),
  ];
}

/**
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function statusViolations(files, read) {
  const adrs = files.filter((file) => adrNumber(file) !== undefined);
  const specs = files.filter((file) => SPEC_BESTAND.test(file));
  return [
    ...duplicateAdrNumbers(adrs),
    ...invalidAdrNames(files),
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
      return [...specVormViolations(file, text, status), ...disciplineViolations({ file, text, status }, files)];
    }),
  ];
}

/**
 * Hergebruik en UX bij goedgekeurd of gebouwd; zonder die sectie wordt het sjabloon niet getoetst.
 * @param {string} file @param {string} text @param {string} status
 * @returns {Violation[]}
 */
function specVormViolations(file, text, status) {
  const reuse = /^## Hergebruik en UX\n+(?!##)\S/m.test(text);
  if ((status === 'goedgekeurd' || status === 'gebouwd') && !reuse)
    return [
      {
        key: `docs:${file}:hergebruik`,
        message: `${file}: ${status}, maar de sectie "Hergebruik en UX" ontbreekt of is leeg`,
      },
    ];
  return sjabloonViolations(file, text);
}

// Fenced codeblokken worden niet apart behandeld: een `## ` in een codeblok sluit de sectie ook af.
/** De tekst onder `## <kop>…` tot de volgende `## `-kop, of undefined. @param {string} text @param {string} kop */
function sectie(text, kop) {
  const start = new RegExp(`^## ${kop}\\b[^\\n]*$`, 'm').exec(text);
  if (start === null) return undefined;
  const rest = text.slice(start.index + start[0].length);
  const einde = /^## /m.exec(rest);
  return einde === null ? rest : rest.slice(0, einde.index);
}

/**
 * Spec-discipline: `⚠ open` (een vraag zonder aanbeveling) blokkeert goedgekeurd en gebouwd; elk pad in
 * "Kopieer de vorm van" bestaat zolang er nog gebouwd moet worden (voorstel, goedgekeurd).
 * @param {{ file: string, text: string, status: string }} spec @param {readonly string[]} files
 * @returns {Violation[]}
 */
function disciplineViolations({ file, text, status }, files) {
  const open = sectie(text, 'Open vragen') ?? '';
  const vorm = sectie(text, 'Kopieer de vorm van') ?? '';
  const ontbrekend = [...vorm.matchAll(/`([^`\n]+)`/g)]
    .map((match) => (match[1] ?? '').replace(/:\d+(-\d+)?$/, ''))
    .filter(
      (id) => looksLikePath(id) && !files.some((file) => file === doelPad(id) || file.startsWith(`${doelPad(id)}/`)),
    );
  return [
    // Ook `⚠️` (met U+FE0F), hoofdletters en een regel zonder opsommingsteken tellen als open vraag.
    ...((status === 'goedgekeurd' || status === 'gebouwd') && /⚠️?\s*open\b/i.test(open)
      ? [{ key: `docs:${file}:open-vraag`, message: `${file}: ${status}, maar "Open vragen" bevat nog "⚠ open"` }]
      : []),
    ...((status === 'voorstel' || status === 'goedgekeurd') && ontbrekend.length > 0
      ? [
          {
            key: `docs:${file}:vorm`,
            message: `${file}: "Kopieer de vorm van" noemt niet-bestaande paden: ${ontbrekend.join(', ')}`,
          },
        ]
      : []),
  ];
}

const MINI_KOPPEN = ['Doel', 'Rollen en wie wat ziet', 'Routes en foutcodes', 'Acceptatiecriteria', 'Hergebruik en UX'];

/**
 * ADR 0046 punt 13: `sjabloon: mini` is de marker van de mini-spec (`docs/specs/_mini.md`); die heeft vaste koppen.
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
    .filter((file) => SPEC_BESTAND.test(file))
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
 * `voorReview` ⊆ gates + jsonGates, `altijdVragen` ⊆ `voorReview`, Edit-regels in `ask` = `altijdVragen` (ADR 0045 punt 9).
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
 * De Edit-regels in `ask` zijn precies `altijdVragen`, of `voorReview` zolang die ontbreekt (ADR 0045 punt 9, ADR 0046 punt 28).
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

/** `onderhoud` is ontbrekend of precies `{ "repository": "<owner>/<repo>" }` (ADR 0045 punt 8); dezelfde vormcheck als het rolhek. @param {unknown} value @returns {Violation[]} */
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
 * `werkmapNegeer` (ADR 0045 punt 23): een lijst paden onder `.claude/`, zonder `..`, waarvan niets getrackt is.
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
