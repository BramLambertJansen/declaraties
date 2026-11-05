import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as prettier from 'prettier';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { bestandsplan, namen, pasToe, plan } from '../../scripts/kit/new-resource.mjs';

// Acceptatietests security-suite PR 4 (docs/specs/security-suite.md, "Wat niet generiek kan" en "Beslissing", optie a):
// pnpm new:resource schrijft test/security/resources.ts NIET, maar drukt de declaratieregels voor beide structuren af
// (routeClassificatie en resources), naast de gate-wijzigingen. De velden van de resource kent de generator niet (OV-5):
// de samples blijven als in te vullen markering (INVULLEN) staan, zodat de suite rood blijft tot de tester ze invult.

const RESOURCES = 'test/security/resources.ts';
const MARKERING = 'INVULLEN';

const NODIG = [
  '.prettierrc.json',
  'db/ids.json',
  'db/migrations',
  'src/shared/permissions.ts',
  'src/shared/permissions.test.ts',
  'src/shared/contracts/index.ts',
  'src/shared/limits.ts',
  'src/api/app.ts',
  'src/web/copy/ui.ts',
  'src/web/lib/nav.ts',
  'src/web/routes.test.tsx',
  RESOURCES,
];

const tijdelijkeMappen: string[] = [];

afterAll(() => {
  for (const map of tijdelijkeMappen) rmSync(map, { recursive: true, force: true });
});

function kopie(naam: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'new-resource-security-'));
  tijdelijkeMappen.push(root);
  for (const pad of NODIG) cpSync(pad, path.join(root, pad), { recursive: true });
  mkdirSync(path.join(root, 'docs/specs'), { recursive: true });
  writeFileSync(
    path.join(root, `docs/specs/${naam}.md`),
    `---\nstatus: goedgekeurd\nnamespace: ${naam}\n---\n\n# ${naam}\n`,
  );
  return root;
}

// Het plan is JavaScript met JSDoc: de nieuwe velden lezen we via een schema, zodat dit bestand compileert voor er
// een implementatie is en pas op de assertie faalt.
const wijziging = z.object({ pad: z.string(), zoek: z.string(), vervang: z.string() });
const metDeclaratie = z.object({ declaratie: z.array(wijziging) });

interface Uitkomst {
  readonly root: string;
  readonly origineel: string;
  readonly hunks: z.infer<typeof wijziging>[];
  readonly bestanden: string[];
  readonly gates: string[];
  readonly contract: string;
  readonly na: string;
}

async function bereken(naam: string, rollen: string[] = ['user']): Promise<Uitkomst> {
  const root = kopie(naam);
  const p = await plan(root, naam, { rollen, nu: new Date('2000-01-01T00:00:00Z') });
  const hunks = metDeclaratie.safeParse(p).data?.declaratie ?? [];
  const origineel = readFileSync(path.join(root, RESOURCES), 'utf8');
  let na = origineel;
  for (const hunk of hunks) na = pasToe(na, hunk);
  return {
    root,
    origineel,
    hunks,
    bestanden: p.bestanden.map(({ pad }) => pad),
    gates: p.gates.map(({ pad }) => pad),
    contract: p.bestanden.find(({ pad }) => pad === `src/shared/contracts/${naam}.ts`)?.inhoud ?? '',
    na,
  };
}

// --- de afgedrukte wijziging als syntaxboom bekijken (vorm, geen tekstvergelijking) ---------------------------------

function bron(tekst: string): ts.SourceFile {
  return ts.createSourceFile(RESOURCES, tekst, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function letterlijkVan(tekst: string, variabele: string): ts.ObjectLiteralExpression | undefined {
  let gevonden: ts.ObjectLiteralExpression | undefined;
  const bezoek = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText() === variabele && node.initializer !== undefined) {
      if (ts.isObjectLiteralExpression(node.initializer)) gevonden = node.initializer;
    }
    ts.forEachChild(node, bezoek);
  };
  bezoek(bron(tekst));
  return gevonden;
}

function sleutel(eigenschap: ts.ObjectLiteralElementLike): string {
  const naam = eigenschap.name;
  if (naam === undefined) return '';
  return ts.isStringLiteral(naam) || ts.isIdentifier(naam) ? naam.text : naam.getText();
}

function eigenschap(letterlijk: ts.ObjectLiteralExpression | undefined, naam: string): ts.Expression | undefined {
  const gevonden = letterlijk?.properties.find((e) => sleutel(e) === naam);
  return gevonden !== undefined && ts.isPropertyAssignment(gevonden) ? gevonden.initializer : undefined;
}

function objectVan(uitdrukking: ts.Expression | undefined): ts.ObjectLiteralExpression | undefined {
  return uitdrukking !== undefined && ts.isObjectLiteralExpression(uitdrukking) ? uitdrukking : undefined;
}

function tekstVan(uitdrukking: ts.Expression | undefined): string | undefined {
  return uitdrukking !== undefined && ts.isStringLiteralLike(uitdrukking) ? uitdrukking.text : undefined;
}

function sleutels(letterlijk: ts.ObjectLiteralExpression | undefined): string[] {
  return letterlijk?.properties.map(sleutel) ?? [];
}

// De routes van de nieuwe resource zoals de generator ze registreert (de gegenereerde contractmodule), als 'METHODE /pad'.
function contractLabels(contract: string): string[] {
  const paren = [...contract.matchAll(/method: '(\w+)',\s*path: '([^']+)'/g)];
  return paren.map(([, methode, pad]) => `${methode ?? ''} ${pad ?? ''}`);
}

const ACTIE_VAN_METHODE: Readonly<Record<string, string>> = {
  GET: 'list',
  POST: 'create',
  PATCH: 'update',
  DELETE: 'delete',
};

let invoices: Uitkomst;

beforeAll(async () => {
  invoices = await bereken('invoices');
});

describe('de afdruklijst (security-suite PR 4, optie a)', () => {
  test('het plan bevat twee wijzigingen voor test/security/resources.ts: routeClassificatie en resources', () => {
    expect(invoices.hunks.map(({ pad }) => pad)).toStrictEqual([RESOURCES, RESOURCES]);
  });

  test('resources.ts is geen geschreven bestand en geen gate-wijziging van de bestaande tests', () => {
    expect(invoices.bestanden).not.toContain(RESOURCES);
    expect(invoices.gates).toStrictEqual(['src/shared/permissions.test.ts', 'src/web/routes.test.tsx']);
    expect(readFileSync(path.join(invoices.root, RESOURCES), 'utf8')).toBe(invoices.origineel);
  });

  test('het bestandsplan noemt resources.ts als af te drukken declaratie, naast de gates', () => {
    const verwacht = bestandsplan(namen('invoices'), '20000101000000');
    const geparsed = z.object({ declaratie: z.array(z.string()) }).safeParse(verwacht);

    expect(geparsed.data?.declaratie).toStrictEqual([RESOURCES]);
    expect(verwacht.gates).toStrictEqual(['src/shared/permissions.test.ts', 'src/web/routes.test.tsx']);
  });

  test('docs/gouden-pad.md noemt test/security/resources.ts', () => {
    expect(readFileSync('docs/gouden-pad.md', 'utf8')).toContain(RESOURCES);
  });
});

describe('exacte, uniek toepasbare Edit', () => {
  test('elke zoektekst staat precies één keer in het huidige bestand', () => {
    expect(invoices.hunks).toHaveLength(2);
    for (const { zoek } of invoices.hunks) {
      expect(zoek.trim()).not.toBe('');
      expect(invoices.origineel.split(zoek)).toHaveLength(2);
    }
  });

  test('de twee wijzigingen na elkaar toegepast geven een bestand dat nog steeds parseert met beide structuren', () => {
    expect(invoices.na).not.toBe(invoices.origineel);
    expect(letterlijkVan(invoices.na, 'routeClassificatie')).toBeDefined();
    expect(letterlijkVan(invoices.na, 'resources')).toBeDefined();
  });

  test('het resultaat is opgemaakt volgens Prettier (pnpm format:check blijft groen)', async () => {
    const filepath = path.join(invoices.root, RESOURCES);
    expect(invoices.na).not.toBe(invoices.origineel);
    const config = await prettier.resolveConfig(filepath);

    expect(await prettier.check(invoices.na, { ...config, filepath })).toBe(true);
  });

  test('de bestaande declaraties blijven staan, de probe-structuren blijven onaangeroerd', () => {
    expect(invoices.na).not.toBe(invoices.origineel);
    const voor = bron(invoices.origineel);
    const na = bron(invoices.na);
    const tekstVanVariabele = (b: ts.SourceFile, naam: string) => letterlijkVan(b.getFullText(), naam)?.getText() ?? '';

    expect(sleutels(letterlijkVan(invoices.na, 'routeClassificatie'))).toEqual(
      expect.arrayContaining(sleutels(letterlijkVan(invoices.origineel, 'routeClassificatie'))),
    );
    expect(sleutels(letterlijkVan(invoices.na, 'resources'))).toContain('security_probes');
    expect(tekstVanVariabele(na, 'probeRouteClassificatie')).toBe(tekstVanVariabele(voor, 'probeRouteClassificatie'));
  });
});

describe('routeClassificatie: één regel per route van de nieuwe resource', () => {
  test('precies de routes die de generator registreert, met scope eigenaar, resource en actie', () => {
    const labels = contractLabels(invoices.contract);
    const voor = sleutels(letterlijkVan(invoices.origineel, 'routeClassificatie'));
    const nieuw = sleutels(letterlijkVan(invoices.na, 'routeClassificatie')).filter((s) => !voor.includes(s));

    expect(labels.sort()).toStrictEqual([
      'DELETE /invoices/:id',
      'GET /invoices',
      'PATCH /invoices/:id',
      'POST /invoices',
    ]);
    expect(nieuw.sort()).toStrictEqual(labels);
  });

  test.each([
    ['GET /invoices', 'list'],
    ['POST /invoices', 'create'],
    ['PATCH /invoices/:id', 'update'],
    ['DELETE /invoices/:id', 'delete'],
  ])("%s is { scope: 'eigenaar', resource: 'invoices', actie: '%s' }", (label, actie) => {
    const klasse = objectVan(eigenschap(letterlijkVan(invoices.na, 'routeClassificatie'), label));

    expect(tekstVan(eigenschap(klasse, 'scope'))).toBe('eigenaar');
    expect(tekstVan(eigenschap(klasse, 'resource'))).toBe('invoices');
    expect(tekstVan(eigenschap(klasse, 'actie'))).toBe(actie);
    expect(sleutels(klasse).sort()).toStrictEqual(['actie', 'resource', 'scope']);
  });

  test('de actie volgt de methode van het contract, ook voor elke andere naam', () => {
    for (const label of contractLabels(invoices.contract)) {
      const methode = label.split(' ')[0] ?? '';
      const klasse = objectVan(eigenschap(letterlijkVan(invoices.na, 'routeClassificatie'), label));

      expect(tekstVan(eigenschap(klasse, 'actie'))).toBe(ACTIE_VAN_METHODE[methode]);
    }
  });
});

describe('resources: één regel voor de tabel', () => {
  test("sleutel is de tabelnaam; tabel 'public.invoices'; lijst wijst naar de list-route in routeClassificatie", () => {
    const regel = objectVan(eigenschap(letterlijkVan(invoices.na, 'resources'), 'invoices'));
    const lijst = tekstVan(eigenschap(regel, 'lijst'));
    const klasse = objectVan(eigenschap(letterlijkVan(invoices.na, 'routeClassificatie'), lijst ?? ''));

    expect(tekstVan(eigenschap(regel, 'tabel'))).toBe('public.invoices');
    expect(lijst).toBe('GET /invoices');
    expect(tekstVan(eigenschap(klasse, 'actie'))).toBe('list');
    expect(tekstVan(eigenschap(klasse, 'resource'))).toBe('invoices');
  });

  test('de sleutel en tabel volgen de afgeleide tabelnaam (work-items wordt work_items, route /work-items)', async () => {
    const uit = await bereken('work-items');
    const regel = objectVan(eigenschap(letterlijkVan(uit.na, 'resources'), 'work_items'));

    expect(tekstVan(eigenschap(regel, 'tabel'))).toBe('public.work_items');
    expect(tekstVan(eigenschap(regel, 'lijst'))).toBe('GET /work-items');
    expect(
      tekstVan(
        eigenschap(objectVan(eigenschap(letterlijkVan(uit.na, 'routeClassificatie'), 'POST /work-items')), 'resource'),
      ),
    ).toBe('work_items');
  });

  test('elke eigenaar-route wijst naar een sleutel die in resources staat (anders is de suite rood)', () => {
    const resources = sleutels(letterlijkVan(invoices.na, 'resources'));
    const klassen = letterlijkVan(invoices.na, 'routeClassificatie')?.properties ?? [];
    const gedeclareerd = klassen
      .map((e) =>
        tekstVan(
          eigenschap(objectVan(eigenschap(letterlijkVan(invoices.na, 'routeClassificatie'), sleutel(e))), 'resource'),
        ),
      )
      .filter((r): r is string => r !== undefined);

    expect(gedeclareerd).toContain('invoices');
    for (const resource of gedeclareerd) expect(resources).toContain(resource);
  });
});

describe('sample: als in te vullen markering, geen verzonnen veldwaarden', () => {
  test.each(['create', 'createTweede', 'spoof', 'update'])(
    'sample.%s is een leeg object met de markering INVULLEN',
    (soort) => {
      const regel = objectVan(eigenschap(letterlijkVan(invoices.na, 'resources'), 'invoices'));
      const sample = objectVan(eigenschap(objectVan(eigenschap(regel, 'sample')), soort));

      expect(sample).toBeDefined();
      expect(sample?.properties).toHaveLength(0);
      expect(sample?.getText()).toContain(MARKERING);
    },
  );

  test('alle verplichte samples en de toegestane testrol; geen verzonnen resourcevelden', () => {
    const regel = objectVan(eigenschap(letterlijkVan(invoices.na, 'resources'), 'invoices'));

    expect(sleutels(objectVan(eigenschap(regel, 'sample'))).sort()).toStrictEqual([
      'create',
      'createTweede',
      'spoof',
      'update',
    ]);
    expect(sleutels(regel).sort()).toStrictEqual(['lijst', 'rol', 'sample', 'tabel']);
  });

  test.each([
    { naam: 'admin-notes', rollen: ['admin'], rol: 'admin', tabel: 'admin_notes' },
    { naam: 'mixed-notes', rollen: ['admin', 'user'], rol: 'user', tabel: 'mixed_notes' },
  ])('declaratie kiest een toegestane testrol voor $naam', async ({ naam, rollen, rol, tabel }) => {
    const result = await bereken(naam, rollen);
    const rule = objectVan(eigenschap(letterlijkVan(result.na, 'resources'), tabel));
    expect(eigenschap(rule, 'rol')?.getText()).toBe(`'${rol}'`);
  });

  test('de markering staat ook in de afgedrukte wijziging zelf, zodat een gemiste invulling vindbaar is', () => {
    expect(invoices.hunks.map(({ vervang }) => vervang).join('\n')).toContain(MARKERING);
  });
});

describe('de uitvoer van pnpm new:resource --dry-run', () => {
  const script = path.resolve('scripts/kit/new-resource.mjs');
  let uitvoer = '';
  let root = '';

  beforeAll(() => {
    root = kopie('invoices');
    uitvoer = execFileSync(process.execPath, [script, 'invoices', '--rollen', 'user', '--dry-run'], {
      cwd: root,
      encoding: 'utf8',
    });
  });

  test('noemt test/security/resources.ts en drukt beide wijzigingen af (zoek en vervang)', () => {
    expect(uitvoer).toContain(`--- ${RESOURCES}`);
    expect(uitvoer).toContain("'GET /invoices'");
    expect(uitvoer).toContain("'DELETE /invoices/:id'");
    expect(uitvoer).toContain("tabel: 'public.invoices'");
    expect(uitvoer).toContain(MARKERING);
  });

  test('de bestaande gate-wijzigingen staan er nog steeds in', () => {
    expect(uitvoer).toContain('--- src/shared/permissions.test.ts');
    expect(uitvoer).toContain('--- src/web/routes.test.tsx');
  });

  test('de tester wordt genoemd als degene die de samples invult; resources.ts staat niet onder Geschreven', () => {
    const geschreven = uitvoer.split('Bestaande tests')[0] ?? '';

    expect(geschreven).not.toContain(RESOURCES);
    expect(uitvoer).toMatch(/tester[^\n]*sample|sample[^\n]*tester/i);
  });

  test('schrijft niets: resources.ts in de map is ongewijzigd', () => {
    expect(readFileSync(path.join(root, RESOURCES), 'utf8')).toBe(readFileSync(RESOURCES, 'utf8'));
    expect(existsSync(path.join(root, 'src/shared/contracts/invoices.ts'))).toBe(false);
  });
});
