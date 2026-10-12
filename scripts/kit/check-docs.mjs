// check-docs (framework §10, ADR 0011), via de ratchet (scripts/kit/ratchet.mjs): proza mag niet wijzen naar iets dat
// niet bestaat, en de gespiegelde lijsten mogen niet uit elkaar lopen.
//  1. Elk pad en elk `pnpm <script>` tussen backticks in AGENTS.md, CLAUDE.md en .claude/**/*.md bestaat
//     (een kale naam of relatief pad telt als een bestand in git erop eindigt; `/route` is een URL, geen pad).
//  2. Relatieve links in docs/**/*.md en README.md wijzen naar een bestaand bestand.
//  3. ADR- en spec-statussen komen uit de vaste woordenlijst; een goedgekeurde of gebouwde spec heeft "Hergebruik en UX".
//  4. CODEOWNERS en `ask` in .claude/settings.json noemen dezelfde paden (CODEOWNERS daarnaast tests en docs/specs/), en
//     CODEOWNERS noemt precies de gates en jsonGates uit .claude/gates.json (de bron, ADR 0011).
//  5. `schrijfrecht` van een rol overlapt niet met `gates` (WS-02), op de uitzonderingen in SCHRIJFRECHT_VRIJ na.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** @typedef {{ key: string, message: string }} Violation */

const ADR_STATUS = /^Status:\s*(voorgesteld|geaccepteerd|vervangen door \d{4}|vervallen)\b/m;
const SPEC_STATUS = /^status:\s*(voorstel|goedgekeurd|gebouwd|vervallen)\b/m;
// Pakketbeheer-commando's van pnpm zelf, geen scripts uit package.json.
const PNPM_COMMANDS = new Set(['add', 'install', 'i', 'update', 'up', 'remove', 'rm', 'exec', 'dlx', 'run', 'why']);
// In CODEOWNERS, niet in `ask`: daar schrijft de agent (framework §10).
const OWNERS_ONLY = new Set(['**/*.test.*', '**/*.spec.*', 'e2e/**', 'docs/specs/**', 'db/tests/**', 'test/**']);

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
    ...mirrorViolations(files, read),
    ...(files.includes('.claude/gates.json') ? schrijfrechtViolations(read('.claude/gates.json')) : []),
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
function packageScripts(text) {
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
function looksLikePath(id) {
  if (id.startsWith('/') || /[*<>{}…\s]/.test(id)) return false;
  return /^[\w.#-]*\/[\w.\-/]*$/.test(id) || /^[\w.-]+\.(md|ts|tsx|mjs|js|json|yaml|yml|sql|sh|css|toml)$/.test(id);
}

/**
 * @param {string} id
 * @param {readonly string[]} files
 */
function pathExists(id, files) {
  const target = id
    .replace(/^#(core|web|shared|api)\//, 'src/$1/')
    .replace(/^#core\//, 'src/core/')
    .replace(/\/$/, '');
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
 * @param {readonly string[]} files
 * @param {(file: string) => string} read
 * @returns {Violation[]}
 */
function statusViolations(files, read) {
  const adrs = files.filter((file) => /^docs\/adr\/\d{4}-[^/]+\.md$/.test(file));
  const specs = files.filter((file) => /^docs\/specs\/[^_/][^/]*\.md$/.test(file));
  return [
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
      return [];
    }),
  ];
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
  const ask = new Set(askEditPaths(read('.claude/settings.json')));
  return [
    ...(files.includes('.claude/gates.json') ? gatesViolations(owners, read('.claude/gates.json')) : []),
    ...[...owners]
      .filter((entry) => !OWNERS_ONLY.has(entry) && !ask.has(entry))
      .map((entry) => ({
        key: `docs:spiegel:ask:${entry}`,
        message: `CODEOWNERS noemt ${entry}, \`ask\` in .claude/settings.json niet`,
      })),
    ...[...ask]
      .filter((entry) => !owners.has(entry))
      .map((entry) => ({
        key: `docs:spiegel:codeowners:${entry}`,
        message: `\`ask\` noemt ${entry}, CODEOWNERS niet`,
      })),
  ];
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
// zijn vrijgesteld: voor hen handelt het rolhek gates af met ask/deny (.claude/hooks/lib/rolhek.mjs, decideByRole).
/** @type {Record<string, (config: { testpaden: string[] }) => string[]>} */
const SCHRIJFRECHT_VRIJ = {
  architect: () => ['docs/adr/**', 'docs/specs/**'],
  tester: (config) => config.testpaden,
};
const SCHRIJFRECHT_ALLES = new Set(['developer', 'hoofdsessie']);

/**
 * Check 5: een rol mag niet zonder ask/deny in een gate schrijven. Een gate die zelf een testpad is, telt niet: toevoegen is
 * daar vrij voor elke rol en een bestaand bestand bewaakt het rolhek (existingTest), ongeacht `schrijfrecht`.
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
  const gates = strings(entry('gates')).filter((gate) => !testpaden.includes(gate));
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
 * Glob als NFA-stappen (zelfde taal als globMatch in .claude/hooks/lib/rolhek.mjs): `*`, `**`, `**\/` en `?`.
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
