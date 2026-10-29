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

describe('Risico-overzicht: permission in contracten (veilig by construction)', () => {
  // Elke wijziging van de ruwe tekst (ook regeleinden, witruimte en commentaar) in een niet-testbestand onder
  // src/shared/contracts/** levert minstens een regel op in "Permissiesleutels (nieuw of gewijzigd)":
  // `<pad>: permission: a:b → a:c`, `<pad>: permission: nieuw (a:b)`, `<pad>: permission: a:b → verwijderd`, of
  // `<pad>: gewijzigd; controleer permissie met de hand` als geen letterlijke permission-regel verschilt maar de tekst wel.
  // Alleen een byte-identiek bestand geeft niets.
  const pad = 'src/shared/contracts/reports.ts';
  const PIJL = String.raw`(?:→|->)`;
  const HAND = /gewijzigd; controleer permissie met de hand/;
  const GEEN = /Permissiesleutels \(nieuw of gewijzigd\): geen/;
  const kop = "import { defineContract } from './kit.ts';\n";
  const contract = (naam: string, permission: string, path = '/reports') =>
    `export const ${naam} = defineContract({\n  method: 'GET',\n  path: '${path}',\n  input: i,\n  output: o,\n  permission: ${permission},\n});\n`;
  const permissieSectie = (tekst: string) =>
    tekst.slice(tekst.indexOf('Permissiesleutels'), tekst.indexOf('Dependencies'));
  const meld = (bestand: string, voor: string | null, na: string | null) =>
    permissieSectie(sectie(pr([{ status: 'M', pad: bestand }], { [bestand]: { voor, na } })));
  const regel = (...delen: string[]) => new RegExp(delen.join('[^\\n]*'));

  test('gewijzigde permission-regel: pad, oude en nieuwe waarde', () => {
    const tekst = meld(pad, `${kop}${contract('rc', "'reports:read'")}`, `${kop}${contract('rc', "'reports:admin'")}`);

    expect(tekst).toMatch(new RegExp(`${pad}[^\\n]*permission[^\\n]*reports:read\\s*${PIJL}\\s*reports:admin`));
  });

  test('nieuw bestand met permission: nieuw (waarde)', () => {
    const nieuw = 'src/shared/contracts/invoices.ts';

    const tekst = meld(nieuw, null, `${kop}${contract('ic', "'invoices:read'")}`);

    expect(tekst).toMatch(regel(nieuw, 'permission', 'nieuw', 'invoices:read'));
  });

  test('extra contract in een bestaand bestand: alleen de nieuwe waarde genoemd', () => {
    const voor = `${kop}${contract('rc', "'reports:read'")}`;

    const tekst = meld(pad, voor, `${voor}${contract('ec', "'reports:export'", '/export')}`);

    expect(tekst).toMatch(regel('permission', 'nieuw', 'reports:export'));
    expect(tekst).not.toContain('reports:read');
  });

  test('verwijderde permission-regel: oude waarde → verwijderd', () => {
    const voor = `${kop}${contract('rc', "'reports:read'")}${contract('ec', "'reports:export'", '/export')}`;

    const tekst = meld(pad, voor, `${kop}${contract('rc', "'reports:read'")}`);

    expect(tekst).toMatch(new RegExp(`${pad}[^\\n]*reports:export\\s*${PIJL}\\s*verwijderd`));
    expect(tekst).not.toContain('reports:read');
  });

  test('twee contracten waarvan er één wijzigt: alleen die waarde genoemd', () => {
    const voor = `${kop}${contract('aaa', "'a:b'")}${contract('bbb', "'b:c'", '/b')}`;
    const na = `${kop}${contract('aaa', "'a:b'")}${contract('bbb', "'b:d'", '/b')}`;

    const tekst = meld(pad, voor, na);

    expect(tekst).toMatch(new RegExp(`b:c\\s*${PIJL}\\s*b:d`));
    expect(tekst).not.toContain('a:b');
  });

  test('hernoemde constante met dezelfde permission: tekst wijzigde, dus controleer met de hand', () => {
    const tekst = meld(pad, `${kop}${contract('oud', "'a:b'")}`, `${kop}${contract('nieuw', "'a:b'")}`);

    expect(tekst).toContain(pad);
    expect(tekst).toMatch(HAND);
  });

  test('byte-identiek bestand: niets; alleen commentaar of opmaak gewijzigd: gemeld met controleer met de hand', () => {
    const bron = `${kop}${contract('rc', 'P')}`;
    const opmaak = `// toelichting\n${bron.replace('input: i,', 'input:   i, // nog een')}`;

    expect(meld(pad, bron, bron)).toMatch(GEEN);
    const tekst = meld(pad, bron, opmaak);
    expect(tekst).toContain(pad);
    expect(tekst).toMatch(HAND);
  });

  test('regeleinde-verschuiving: een commentaar dat een regel opeet, met permission: P ongewijzigd, wordt gemeld', () => {
    const voor = `${kop}let P = 'reports:read'; // P = 'reports:admin';\n${contract('rc', 'P')}`;
    const na = `${kop}let P = 'reports:read'; //\nP = 'reports:admin';\n${contract('rc', 'P')}`;

    const tekst = meld(pad, voor, na);

    expect(tekst).toContain(pad);
    expect(tekst).toMatch(HAND);
  });

  test('alleen witruimte binnen een string-waarde buiten de permission-regel: gemeld', () => {
    const bron = (titel: string) =>
      `${kop}export const rc = defineContract({\n  method: 'GET',\n  path: '/r',\n  titel: '${titel}',\n  permission: P,\n});\n`;

    const tekst = meld(pad, bron('a b'), bron('ab'));

    expect(tekst).toContain(pad);
    expect(tekst).toMatch(HAND);
  });

  test('een /* in een string met later een JSDoc: een gewijzigde permission wordt toch gemeld', () => {
    const bron = (x: string) =>
      `${kop}export const rc = defineContract({\n  method: 'GET',\n  path: '/files/*',\n  permission: '${x}',\n});\n\n/** Uitleg. */\nexport const andere = 1;\n`;

    const tekst = meld(pad, bron('files:read'), bron('files:admin'));

    expect(tekst).toContain(pad);
    expect(tekst).not.toMatch(GEEN);
    expect(tekst).toMatch(new RegExp(`files:read\\s*${PIJL}\\s*files:admin`));
  });

  test('een // in een string op de permission-regel: een gewijzigde permission wordt toch gemeld', () => {
    const bron = (x: string) =>
      `${kop}export const rc = defineContract({ method: 'GET', path: '/r', note: 'zie //x', permission: '${x}' });\n`;

    const tekst = meld(pad, bron('a:b'), bron('a:c'));

    expect(tekst).toContain(pad);
    expect(tekst).toMatch(new RegExp(`a:b\\s*${PIJL}\\s*a:c`));
  });

  test('een gewijzigde en een verwijderde permission in een bestand: de pijl koppelt geen verkeerde waarden', () => {
    const voor = `${kop}${contract('aaa', "'a:old'")}${contract('bbb', "'b:gone'", '/b')}`;
    const na = `${kop}${contract('aaa', "'a:new'")}`;

    const tekst = meld(pad, voor, na);

    expect(tekst).not.toMatch(new RegExp(`a:old\\s*${PIJL}\\s*b:gone|b:gone\\s*${PIJL}\\s*a:new`));
    expect(tekst).toMatch(/a:old/);
    expect(tekst).toMatch(/b:gone/);
    expect(tekst).toMatch(/a:new/);
  });

  test('testbestanden in contracts/ en submappen worden genegeerd; niet-testbestanden in submappen niet', () => {
    const diep = 'src/shared/contracts/facturen/lijst.ts';
    const test1 = 'src/shared/contracts/reports.test.ts';
    const test2 = 'src/shared/contracts/facturen/lijst.test.ts';
    const versies = (a: string, b: string) => ({
      voor: `${kop}${contract('c', `'${a}'`)}`,
      na: `${kop}${contract('c', `'${b}'`)}`,
    });

    const tekst = permissieSectie(
      sectie(
        pr(
          [diep, test1, test2].map((bestand) => ({ status: 'M', pad: bestand })),
          { [diep]: versies('a:b', 'a:c'), [test1]: versies('t:1', 't:2'), [test2]: versies('u:1', 'u:2') },
        ),
      ),
    );

    expect(tekst).toMatch(new RegExp(`${diep}[^\\n]*a:b\\s*${PIJL}\\s*a:c`));
    expect(tekst).not.toContain('.test.ts');
    expect(tekst).not.toMatch(/t:2|u:2/);
  });

  const nietLetterlijk: [string, string, string][] = [
    ['template-literal', '`me:read`', '`me:admin`'],
    ['shorthand', 'permission', 'permission, extra: 1'],
    ['elementtoegang', "perms['a:b']", "perms['a:c']"],
    ['ternary', "x ? 'a:b' : 'a:c'", "x ? 'a:b' : 'a:d'"],
    ['const-verwijzing', 'P', 'Q'],
    ['property-verwijzing', 'PERMS.x', 'PERMS.y'],
    ['as const', "'a:b' as const", "'a:c' as const"],
  ];

  test.each(nietLetterlijk)('%s: een wijziging levert altijd een regel op', (_naam, voor, na) => {
    const tekst = meld(pad, `${kop}${contract('rc', voor)}`, `${kop}${contract('rc', na)}`);

    expect(tekst).not.toMatch(GEEN);
    expect(tekst).toContain(pad);
  });

  test('const P wijzigt terwijl permission: P gelijk blijft: controleer met de hand', () => {
    const voor = `${kop}const P = 'a:b';\n${contract('rc', 'P')}`;
    const na = `${kop}const P = 'a:c';\n${contract('rc', 'P')}`;

    const tekst = meld(pad, voor, na);

    expect(tekst).toContain(pad);
    expect(tekst).toMatch(HAND);
  });

  test('defineContract(basis): nieuw en gewijzigd geven een regel', () => {
    const basis = (x: string) => `${kop}const basis = { method: 'GET', path: '/r', permission: '${x}' };\n`;
    const aanroep = 'export const rc = defineContract(basis);\n';

    const nieuw = meld(pad, null, `${basis('a:b')}${aanroep}`);
    const gewijzigd = meld(pad, `${basis('a:b')}${aanroep}`, `${basis('a:b')}${aanroep}export const extra = 1;\n`);

    expect(nieuw).toContain(pad);
    expect(nieuw).not.toMatch(GEEN);
    expect(gewijzigd).toContain(pad);
    expect(gewijzigd).toMatch(HAND);
  });

  test('import-alias defineContract as dc: wijziging via de basis wordt gemeld', () => {
    const bron = (x: string) =>
      `import { defineContract as dc } from './kit.ts';\nconst basis = { permission: '${x}' };\nexport const rc = dc(basis);\n`;

    const tekst = meld(pad, bron('a:b'), bron('a:c'));

    expect(tekst).toContain(pad);
    expect(tekst).not.toMatch(GEEN);
  });

  test('{ permission: "a:b", ...extra }: wijziging van extra met gelijke permission: controleer met de hand', () => {
    const bron = (extra: string) => `${kop}export const rc = defineContract({permission:'a:b', ...${extra}});\n`;

    const tekst = meld(pad, bron('extra'), bron('ander'));

    expect(tekst).toContain(pad);
    expect(tekst).toMatch(HAND);
  });

  test('regex-literal met een quote ontregelt de analyse niet', () => {
    const bron = (x: string) => `${kop}const re = /'/; // ' commentaar\n${contract('rc', `'${x}'`)}`;

    const tekst = meld(pad, bron('a:b'), bron('a:c'));

    expect(tekst).toMatch(new RegExp(`${pad}[^\\n]*a:b\\s*${PIJL}\\s*a:c`));
  });

  test('gequote sleutel "permission": een wijziging levert een regel op', () => {
    const bron = (x: string) => `${kop}export const rc = defineContract({ method: 'GET', 'permission': '${x}' });\n`;

    const tekst = meld(pad, bron('a:b'), bron('a:c'));

    expect(tekst).toContain(pad);
    expect(tekst).not.toMatch(GEEN);
  });

  test('onleesbaar nieuw bestand: toch een regel, geen crash', () => {
    const tekst = meld(pad, contract('a', "'x:y'"), '{{ kapot');

    expect(tekst).toContain(pad);
    expect(tekst).not.toMatch(GEEN);
  });
});

describe('Risico-overzicht: welke bestanden de guard leest (teLezen)', () => {
  const kies = async (wijzigingen: Wijziging[]) => {
    const module: Record<string, unknown> = await import('../../scripts/kit/diff-guard.mjs');
    const { teLezen } = module;
    expect(typeof teLezen, 'teLezen moet geexporteerd worden').toBe('function');
    if (typeof teLezen !== 'function') return [];
    const uitkomst: unknown = Reflect.apply(teLezen, undefined, [config, wijzigingen]);
    return Array.isArray(uitkomst) ? uitkomst.map((item: { pad: string }) => item.pad) : [];
  };

  test('een contractbestand dat geen .ts is (.js, .mjs, in submap) wordt gelezen; D en testbestanden niet', async () => {
    const gelezen = await kies([
      { status: 'M', pad: 'src/shared/contracts/a.js' },
      { status: 'A', pad: 'src/shared/contracts/sub/b.mjs' },
      { status: 'M', pad: 'src/shared/contracts/c.ts' },
      { status: 'D', pad: 'src/shared/contracts/d.js' },
      { status: 'M', pad: 'src/shared/contracts/e.test.ts' },
    ]);

    expect(gelezen).toContain('src/shared/contracts/a.js');
    expect(gelezen).toContain('src/shared/contracts/sub/b.mjs');
    expect(gelezen).toContain('src/shared/contracts/c.ts');
    expect(gelezen).not.toContain('src/shared/contracts/d.js');
    expect(gelezen).not.toContain('src/shared/contracts/e.test.ts');
  });
});

describe('Risico-overzicht: hernoemingen naar contracts/ (teLezen en risico)', () => {
  const naarBinnen = 'src/shared/contracts/admin.ts';
  const buiten = 'src/api/oud/admin.ts';
  const binnenOud = 'src/shared/contracts/oud.ts';
  const bron = "export const c = defineContract({ method: 'GET', path: '/a', permission: 'admin:all' });\n";
  const leesKeuze = async (wijzigingen: Wijziging[]) => {
    const module: Record<string, unknown> = await import('../../scripts/kit/diff-guard.mjs');
    const { teLezen } = module;
    expect(typeof teLezen, 'teLezen moet geexporteerd worden').toBe('function');
    if (typeof teLezen !== 'function') return [];
    const uitkomst: unknown = Reflect.apply(teLezen, undefined, [config, wijzigingen]);
    return Array.isArray(uitkomst)
      ? uitkomst.map((item: { pad: string; van?: string | null }) => ({ pad: item.pad, van: item.van }))
      : [];
  };
  const sectieVan = (wijzigingen: Wijziging[], json: Versies) => {
    const tekst = sectie(pr(wijzigingen, json));
    return tekst.slice(tekst.indexOf('Permissiesleutels'), tekst.indexOf('Dependencies'));
  };

  test('R van buiten naar binnen contracts/: de basisversie is het oude pad niet (telt als nieuw)', async () => {
    const keuze = await leesKeuze([{ status: 'R', pad: naarBinnen, van: buiten }]);

    const item = keuze.find(({ pad }) => pad === naarBinnen);
    expect(item, 'het hernoemde contractbestand moet gelezen worden').toBeDefined();
    expect(item?.van ?? null).toBeNull();
  });

  test('R van buiten naar binnen met voor = null en permission admin:all: gemeld als nieuw', () => {
    const tekst = sectieVan([{ status: 'R', pad: naarBinnen, van: buiten }], {
      [naarBinnen]: { voor: null, na: bron },
    });

    expect(tekst).toMatch(/admin\.ts[^\n]*permission[^\n]*nieuw[^\n]*admin:all/);
  });

  test('R binnen contracts/ met identieke inhoud: de basis blijft het oude pad en er wordt niets gemeld', async () => {
    const keuze = await leesKeuze([{ status: 'R', pad: naarBinnen, van: binnenOud }]);

    expect(keuze.find(({ pad }) => pad === naarBinnen)?.van).toBe(binnenOud);
    const tekst = sectieVan([{ status: 'R', pad: naarBinnen, van: binnenOud }], {
      [naarBinnen]: { voor: bron, na: bron },
    });
    expect(tekst).toMatch(/Permissiesleutels \(nieuw of gewijzigd\): geen/);
  });

  test('.spec.* in contracts/ wordt niet gelezen (gedocumenteerde grens)', async () => {
    const keuze = await leesKeuze([
      { status: 'M', pad: 'src/shared/contracts/x.spec.ts' },
      { status: 'M', pad: 'src/shared/contracts/y.spec.js' },
    ]);

    expect(keuze.map(({ pad }) => pad)).toStrictEqual([]);
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
