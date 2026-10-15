import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { beoordeel, leesConfig, samenvatting } from '../../scripts/kit/diff-guard.mjs';

// Diff-guard, Risico-overzicht in de samenvatting: nieuwe of gewijzigde migraties, permissiesleutels, dependencies en
// routes. Alles wordt als data uit pr.json (voor/na tekst per bestand) en pr.wijzigingen gelezen; PR-code wordt nooit uitgevoerd.
const config = leesConfig(readFileSync('.claude/gates.json', 'utf8'));
const HEAD = 'a'.repeat(40);
const KOP = 'Risico-overzicht';

type Wijziging = { status: string; pad: string; van?: string };
type Versies = Record<string, { voor: string | null; na: string | null }>;

function pr(wijzigingen: Wijziging[], json: Versies = {}) {
  return { wijzigingen, json, labels: [], reviews: [], auteur: 'template-agent[bot]', headSha: HEAD };
}

function sectie(p: ReturnType<typeof pr>): string {
  const tekst = samenvatting(beoordeel(p, config));
  const start = tekst.indexOf(KOP);
  expect(start, `samenvatting bevat geen sectie ${KOP}`).toBeGreaterThanOrEqual(0);
  return tekst.slice(start);
}

const permissies = (inhoud: string) =>
  `import { definePermissions } from '#core/shared/can.ts';\nexport const permissions = definePermissions({\n${inhoud}\n});\n`;
const BASIS_PERMISSIES = permissies(
  ["  'me:read': { roles: ['user', 'admin'] },", "  'accounts:read': { roles: ['admin'] },"].join('\n'),
);
const pakket = (dependencies: object, devDependencies: object) => JSON.stringify({ dependencies, devDependencies });

describe('Risico-overzicht: migraties', () => {
  test('nieuwe en gewijzigde migraties staan erin, verwijderde en andere sql niet', () => {
    const tekst = sectie(
      pr([
        { status: 'A', pad: 'db/migrations/20261015120000_reports.sql' },
        { status: 'M', pad: 'db/migrations/20261001090000_accounts.sql' },
        { status: 'D', pad: 'db/migrations/20260901000000_oud.sql' },
        { status: 'A', pad: 'db/tests/reports.sql' },
      ]),
    );

    expect(tekst).toContain('db/migrations/20261015120000_reports.sql');
    expect(tekst).toContain('db/migrations/20261001090000_accounts.sql');
    expect(tekst).not.toContain('20260901000000_oud');
    expect(tekst).not.toContain('db/tests/reports.sql');
  });
});

describe('Risico-overzicht: hernoemde migraties', () => {
  test('een hernoemde migratie (status R) staat erin, met het oude en het nieuwe pad', () => {
    const tekst = sectie(
      pr([
        {
          status: 'R',
          pad: 'db/migrations/20261015120000_nieuwe_naam.sql',
          van: 'db/migrations/20261001090000_oude_naam.sql',
        },
      ]),
    );

    expect(tekst).toContain('db/migrations/20261015120000_nieuwe_naam.sql');
    expect(tekst).toContain('db/migrations/20261001090000_oude_naam.sql');
    expect(tekst).not.toMatch(/Migraties[^\n]*\n\s*-?\s*geen/);
  });
});

describe('Risico-overzicht: permissiesleutels', () => {
  const pad = 'src/shared/permissions.ts';
  const wijziging = [{ status: 'M', pad }];

  test('nieuwe en gewijzigde sleutels staan erin, ongewijzigde niet', () => {
    const na = permissies(
      [
        "  'me:read': { roles: ['user', 'admin'] },",
        "  'accounts:read': { roles: ['admin', 'user'] },",
        "  'reports:read': { roles: ['admin'] },",
      ].join('\n'),
    );

    const tekst = sectie(pr(wijziging, { [pad]: { voor: BASIS_PERMISSIES, na } }));

    expect(tekst).toContain('reports:read');
    expect(tekst).toContain('accounts:read');
    expect(tekst).not.toContain('me:read');
  });

  test('een nieuw bestand telt alle sleutels als nieuw', () => {
    const tekst = sectie(pr([{ status: 'A', pad }], { [pad]: { voor: null, na: BASIS_PERMISSIES } }));

    expect(tekst).toContain('me:read');
    expect(tekst).toContain('accounts:read');
  });

  test('alleen opmerkingen of opmaak gewijzigd: sleutel niet genoemd', () => {
    const na = BASIS_PERMISSIES.replace("'accounts:read'", "// toelichting\n  'accounts:read'");

    const tekst = sectie(pr(wijziging, { [pad]: { voor: BASIS_PERMISSIES, na } }));

    expect(tekst).not.toContain('accounts:read');
  });

  test('een permissions.ts met kwaadaardige code wordt niet uitgevoerd, de sleutels worden wel gelezen', () => {
    const marker = path.join(mkdtempSync(path.join(tmpdir(), 'guard-marker-')), 'uitgevoerd');
    const kwaad = [
      "import { writeFileSync } from 'node:fs';",
      "writeFileSync(process.env.GUARD_MARKER ?? '', 'uitgevoerd');",
      "process.on('exit', () => writeFileSync(process.env.GUARD_MARKER ?? '', 'exit'));",
      "import { definePermissions } from '#core/shared/can.ts';",
      "export const permissions = definePermissions({ 'evil:run': { roles: ['user'] } });",
    ].join('\n');

    vi.stubEnv('GUARD_MARKER', marker);
    try {
      const tekst = sectie(pr(wijziging, { [pad]: { voor: BASIS_PERMISSIES, na: kwaad } }));

      expect(existsSync(marker)).toBe(false);
      expect(tekst).toContain('evil:run');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test('onleesbaar of leeg bestand geeft geen crash', () => {
    const tekst = sectie(pr(wijziging, { [pad]: { voor: BASIS_PERMISSIES, na: '{{ geen code' } }));

    expect(tekst).toContain(KOP);
  });
});

describe('Risico-overzicht: dependencies', () => {
  const wijziging = [{ status: 'M', pad: 'package.json' }];

  test('nieuwe dependencies en devDependencies staan erin; versiewijziging, bestaande en verwijderde niet', () => {
    const voor = pakket({ hono: '4.0.0', oud: '1.0.0' }, { vitest: '3.0.0' });
    const na = pakket({ hono: '4.1.0', nieuwepakket: '1.2.3' }, { vitest: '3.0.0', 'dev-nieuw': '2.0.0' });

    const tekst = sectie(pr(wijziging, { 'package.json': { voor, na } }));

    expect(tekst).toContain('nieuwepakket');
    expect(tekst).toContain('dev-nieuw');
    expect(tekst).not.toContain('hono');
    expect(tekst).not.toContain('vitest');
    expect(tekst).not.toContain('oud');
  });

  test('onleesbare package.json geeft geen crash', () => {
    const tekst = sectie(pr(wijziging, { 'package.json': { voor: pakket({}, {}), na: '{ kapot' } }));

    expect(tekst).toContain(KOP);
  });
});

describe('Risico-overzicht: routes', () => {
  const route = (extra: string) => `import { defineRoute } from '#core/api/route.ts';\n${extra}\n`;
  const bestaand = 'export const a = defineRoute(accountsListContract, async () => []);';

  test('nieuwe defineRoute met letterlijke method en path: beide genoemd', () => {
    const na = route(
      `${bestaand}\nexport const b = defineRoute({ method: 'POST', path: '/reports/export', input: i, output: o, permission: 'x', handler: h });`,
    );
    const pad = 'src/api/routes/reports.ts';

    const tekst = sectie(pr([{ status: 'M', pad }], { [pad]: { voor: route(bestaand), na } }));

    expect(tekst).toContain(pad);
    expect(tekst).toMatch(/POST\s+\/reports\/export/);
  });

  test('nieuwe defineRoute via een contract: bestand genoemd, geen method of path nodig', () => {
    const pad = 'src/api/routes/invoices.ts';

    const tekst = sectie(
      pr([{ status: 'A', pad }], {
        [pad]: { voor: null, na: route('export const c = defineRoute(invoicesContract, async () => []);') },
      }),
    );

    expect(tekst).toContain(pad);
  });

  test('ongewijzigde defineRoute in een gewijzigd bestand: niet genoemd', () => {
    const pad = 'src/api/routes/accounts.ts';

    const tekst = sectie(
      pr([{ status: 'M', pad }], { [pad]: { voor: route(bestaand), na: route(`${bestaand}\n// commentaar`) } }),
    );

    expect(tekst).not.toContain(pad);
  });
});

describe('Risico-overzicht: routes, alleen echt nieuwe', () => {
  const pad = 'src/api/routes/reports.ts';
  const letterlijk = (method: string, rest: string) =>
    `import { defineRoute } from '#core/api/route.ts';\nexport const a = defineRoute({ method: '${method}', path: '/reports', ${rest} });\n`;

  test('bestaande route met alleen een andere handler, permission of input: niet onder nieuwe routes', () => {
    const voor = letterlijk('GET', "input: i, output: o, permission: 'reports:read', handler: oud");
    const na = letterlijk('GET', "input: i2, output: o2, permission: 'reports:admin', handler: nieuw");

    const tekst = sectie(pr([{ status: 'M', pad }], { [pad]: { voor, na } }));

    expect(tekst).not.toContain(pad);
    expect(tekst).not.toContain('/reports');
  });

  test('dezelfde route met een nieuwe method of een nieuw path: wel genoemd', () => {
    const voor = letterlijk('GET', "input: i, output: o, permission: 'reports:read', handler: h");

    const anderMethod = letterlijk('POST', "input: i, output: o, permission: 'reports:read', handler: h");
    const anderPath = voor.replace("'/reports'", "'/reports/export'");

    expect(sectie(pr([{ status: 'M', pad }], { [pad]: { voor, na: anderMethod } }))).toMatch(/POST\s+\/reports/);
    expect(sectie(pr([{ status: 'M', pad }], { [pad]: { voor, na: anderPath } }))).toMatch(/GET\s+\/reports\/export/);
  });
});

describe('Risico-overzicht: leeg en structuur', () => {
  test('zonder risicowijzigingen: de sectie bestaat en zegt vier keer "geen"', () => {
    const tekst = sectie(pr([{ status: 'M', pad: 'src/web/main.tsx' }]));

    expect(tekst.match(/geen/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  test('met alleen een migratie: de overige drie categorieën zeggen "geen"', () => {
    const tekst = sectie(pr([{ status: 'A', pad: 'db/migrations/20261015120000_x.sql' }]));

    expect(tekst.match(/geen/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  test('de sectie staat ook bij uitslag rood en overgang', () => {
    const core = { status: 'M', pad: 'src/core/shared/can.ts' };

    expect(samenvatting(beoordeel(pr([core]), config))).toContain(KOP);
    expect(samenvatting(beoordeel({ ...pr([core]), auteur: 'BramLambertJansen' }, config))).toContain(KOP);
  });
});

test('de guard leest PR-code alleen als data: geen import van src/, geen eval, geen install', () => {
  const bron = readFileSync('scripts/kit/diff-guard.mjs', 'utf8');

  expect(bron).not.toMatch(/\bimport\s*\(/);
  expect(bron).not.toMatch(/\beval\s*\(|new\s+Function\s*\(/);
  expect(bron).not.toMatch(/from\s+['"][^'"]*(src\/|permissions)/);
  expect(bron).not.toMatch(/['"](pnpm|npm|npx|yarn)['"]/);
  expect(bron).toMatch(/permissions/);
});
