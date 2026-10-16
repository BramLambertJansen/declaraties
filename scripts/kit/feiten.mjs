// Live feiten (framework §8, ADR 0011): elke rol begint hiermee, niet met wat in proza staat.
// Gebruik: node scripts/kit/feiten.mjs [gates|adr|specs|migraties|routes|permissies|foutcodes|componenten] [--json]
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toolchainProbleemIn } from './toolchain.mjs';

// Eerst de toolchain: catalogus.mjs laadt typescript, dus zonder node_modules anders een stacktrace (docs/ENVIRONMENT.md).
const probleem = toolchainProbleemIn(fileURLToPath(new URL('../..', import.meta.url)));
if (probleem !== null) {
  console.error(probleem);
  process.exit(1);
}
const { componenten } = await import('./catalogus.mjs');
const { gates } = await import('./gates.mjs');

const TEMPLATE_ADR_MAX = 99;

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

/** @param {readonly { nummer: string }[]} list */
function nextAdr(list) {
  const numbers = list.map((adr) => Number(adr.nummer));
  const template = Math.max(0, ...numbers.filter((n) => n <= TEMPLATE_ADR_MAX)) + 1;
  const app = Math.max(TEMPLATE_ADR_MAX, ...numbers.filter((n) => n > TEMPLATE_ADR_MAX)) + 1;
  return `${String(template).padStart(4, '0')} (template, tot 0099) · ${String(app).padStart(4, '0')} (app, vanaf 0100)`;
}

function specs() {
  return markdownFiles('docs/specs').map((file) => {
    const status = /^status:\s*(\S+)/m.exec(readFileSync(`docs/specs/${file}`, 'utf8'))?.[1] ?? 'onbekend';
    return { spec: file, status };
  });
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

/** @type {Record<string, () => unknown>} */
const sections = {
  gates: () =>
    gates.map(({ script, bewaakt, snel }) => ({ script: `pnpm ${script}`, soort: snel ? 'snel' : 'traag', bewaakt })),
  adr: () => {
    const list = adrs();
    return { lijst: list, volgende: nextAdr(list) };
  },
  specs,
  migraties: migrations,
  routes,
  permissies,
  foutcodes,
  componenten: () =>
    componenten().map(({ naam, bron, publiek, varianten, importnamen }) => ({
      naam,
      bron,
      publiek,
      varianten,
      importnamen,
      catalogus: '/design-system',
    })),
};

const args = process.argv.slice(2);
const wanted = args.filter((arg) => !arg.startsWith('--'));
const unknown = wanted.filter((name) => !(name in sections));
if (unknown.length > 0) {
  console.error(`Onbekende sectie: ${unknown.join(', ')}. Kies uit: ${Object.keys(sections).join(', ')}`);
  process.exit(2);
}
const result = Object.fromEntries(
  await Promise.all(
    (wanted.length > 0 ? wanted : Object.keys(sections)).map(async (name) => [name, await sections[name]?.()]),
  ),
);
console.info(args.includes('--json') ? JSON.stringify(result, null, 2) : toText(result));

/** @param {unknown} value */
function inline(value) {
  return typeof value === 'object' && value !== null ? Object.values(value).map(String).join(' · ') : String(value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function render(value) {
  if (Array.isArray(value)) return value.length === 0 ? '(geen)' : value.map((item) => `- ${inline(item)}`).join('\n');
  if (typeof value !== 'object' || value === null) return String(value);
  return Object.entries(value)
    .map(([key, content]) => (Array.isArray(content) ? `${key}:\n${render(content)}` : `${key}: ${inline(content)}`))
    .join('\n');
}

/** @param {Record<string, unknown>} value */
function toText(value) {
  return Object.entries(value)
    .map(([name, content]) => `## ${name}\n${render(content)}`)
    .join('\n\n');
}
