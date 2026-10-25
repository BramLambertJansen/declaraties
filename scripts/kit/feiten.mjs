// Live feiten (framework §8, ADR 0045): elke rol begint hiermee, niet met wat in proza staat.
// Gebruik: node scripts/kit/feiten.mjs [gates|adr|specs|migraties|routes|permissies|foutcodes|componenten|fase] [--alle] [--json]
// Zonder sectie alles; elke rol vraagt in stap 1 van zijn agentbestand alleen wat hij nodig heeft (.claude/agents/*.md).
// `--alle` toont bij `adr` ook de vervangen en vervallen ADR's; weergave en filters staan in feiten-tekst.mjs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toolchainProbleemIn } from './toolchain.mjs';

// Eerst de toolchain: catalogus.mjs laadt typescript, dus zonder node_modules anders een stacktrace (docs/ENVIRONMENT.md).
const probleem = toolchainProbleemIn(fileURLToPath(new URL('../..', import.meta.url)));
if (probleem !== null) {
  console.error(probleem);
  process.exit(1);
}
const { gates } = await import('./gates.mjs');
const { adrOverzicht, componentenTekst, faseOverzicht, toText } = await import('./feiten-tekst.mjs');

const CATALOGUS = '/design-system';

/** @param {string} dir */
function markdownFiles(dir) {
  return readdirSync(dir)
    .filter(
      (name) => /^\d{4}-.+\.md$/.test(name) || (dir.endsWith('specs') && name.endsWith('.md') && !name.startsWith('_')),
    )
    .sort();
}

function adrs() {
  return markdownFiles('docs/adr').map((file) => {
    const text = readFileSync(`docs/adr/${file}`, 'utf8');
    const status =
      /^Status:\s*(voorgesteld|geaccepteerd|vervangen door \d{4}|vervallen)\b/m.exec(text)?.[1] ?? 'onbekend';
    return { nummer: file.slice(0, 4), titel: /^# \d{4} — (.+)$/m.exec(text)?.[1] ?? file, status };
  });
}

// Alleen bij de ADR-sectie: nummers uit archief en bekende geschiedenis blijven gereserveerd, zonder fictieve lijstrijen.
async function gereserveerdeAdrNummers() {
  const [{ gitText }, { adrNumber }] = await Promise.all([
    import('../../rails/hooks/lib/authority-context.mjs'),
    import('./adr-numbers.mjs'),
  ]);
  const root = process.cwd();
  const refs = gitText(root, ['for-each-ref', '--format=%(refname)', 'refs/remotes/origin/main']);
  if (refs === null) throw new Error('ADR-geschiedenis niet leesbaar; haal de Git-geschiedenis op');
  const main = refs.split('\n').includes('refs/remotes/origin/main') ? ['refs/remotes/origin/main'] : [];
  const history = gitText(root, [
    'log',
    'HEAD',
    ...main,
    '--full-history',
    '--no-renames',
    '--format=',
    '--name-only',
    '-z',
    '--',
    'docs/adr/',
  ]);
  if (history === null) throw new Error('ADR-geschiedenis niet leesbaar; haal de Git-geschiedenis op');
  const archive = existsSync('docs/adr/archief')
    ? markdownFiles('docs/adr/archief').map((file) => `docs/adr/archief/${file}`)
    : [];
  const paths = [...history.split('\0').map((file) => file.replace(/^\n+/, '')), ...archive];
  return [...new Set(paths.flatMap((file) => adrNumber(file) ?? []))];
}

function specs() {
  return markdownFiles('docs/specs').map((file) => {
    const status = /^status:\s*(\S+)/m.exec(readFileSync(`docs/specs/${file}`, 'utf8'))?.[1] ?? 'onbekend';
    return { spec: file, status };
  });
}

/** @param {string} file */
function readOrNull(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function migrations() {
  const versions = readdirSync('db/migrations')
    .map((name) => /^(\d{14})_.+\.sql$/.exec(name)?.[1])
    .filter((version) => version !== undefined)
    .sort();
  const last = versions.at(-1) ?? null;
  return { laatste: last, volgende: `tijdstempel > ${last ?? '0'} (dbmate new <naam>)` };
}

// Routes, permissies en foutcodes rechtstreeks uit de bron (Node draait TypeScript zonder build); geen kopie in proza.
async function routes() {
  const { contracts } = await import('../../src/shared/contracts/index.ts');
  return contracts.map((contract) => ({
    route: `${contract.method} /api${contract.path}`,
    permissie: contract.permission,
    bron: 'src/shared/contracts/ (handler: src/api/routes/)',
  }));
}

async function permissies() {
  const { permissions } = await import('../../src/shared/permissions.ts');
  const { ROLES } = await import('../../src/core/shared/can.ts');
  return permissions.names.map((permission) => ({
    permissie: permission,
    rollen:
      ROLES.filter((role) => permissions.can({ role, sessionStrength: 'mfa' }, permission)).join(', ') || '(geen)',
  }));
}

async function foutcodes() {
  const { errors } = await import('../../src/shared/errors.ts');
  return { codes: errors.codes.join(', '), teksten: 'src/web/copy/errors.ts', nieuw: 'src/shared/errors.ts' };
}

const args = process.argv.slice(2);
const alle = args.includes('--alle');

/** @typedef {{ json: unknown, kop?: string, inhoud: unknown }} Result */
/**
 * JSON en tekst zijn gelijk, behalve waar een sectie een eigen tekstvorm heeft (componenten).
 * @param {() => unknown} load
 * @returns {() => Promise<Result>}
 */
function plain(load) {
  return async () => {
    const data = await load();
    return { json: data, inhoud: data };
  };
}

/** @type {Record<string, () => Promise<Result> | Result>} */
const sections = {
  gates: plain(() =>
    gates.map(({ script, bewaakt, snel }) => ({ script: `pnpm ${script}`, soort: snel ? 'snel' : 'traag', bewaakt })),
  ),
  adr: plain(async () => adrOverzicht(adrs(), alle, await gereserveerdeAdrNummers())),
  specs: plain(specs),
  migraties: plain(migrations),
  routes: plain(routes),
  permissies: plain(permissies),
  foutcodes: plain(foutcodes),
  componenten: async () => {
    const { componenten } = await import('./catalogus.mjs');
    const lijst = componenten();
    return {
      json: { catalogus: CATALOGUS, lijst },
      kop: `catalogus ${CATALOGUS}; publiek = export uit src/web/ui, intern = alleen binnen de kit`,
      inhoud: componentenTekst(lijst),
    };
  },
  fase: plain(() =>
    faseOverzicht({ roadmap: readOrNull('docs/roadmap.md'), dod: readOrNull('docs/dod.md'), specs: specs() }),
  ),
};

const wanted = args.filter((arg) => !arg.startsWith('--'));
const unknown = wanted.filter((name) => !(name in sections));
if (unknown.length > 0) {
  console.error(`Onbekende sectie: ${unknown.join(', ')}. Kies uit: ${Object.keys(sections).join(', ')}`);
  process.exit(2);
}
const names = wanted.length > 0 ? wanted : Object.keys(sections);
const results = await Promise.all(names.map(async (naam) => ({ naam, ...(await sections[naam]?.()) })));
if (args.includes('--json')) {
  console.info(JSON.stringify(Object.fromEntries(results.map(({ naam, json }) => [naam, json])), null, 2));
} else {
  console.info(
    toText(results.map(({ naam, kop, inhoud }) => ({ naam, ...(kop === undefined ? {} : { kop }), inhoud }))),
  );
}
