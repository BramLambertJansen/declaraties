import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import ts from 'typescript';
import { z } from 'zod';
import { pasToe, plan } from '../../scripts/kit/new-resource.mjs';

// Acceptatietests lijstpagina/AC-8 (docs/specs/lijstpagina.md, 'Generator'): de uitvoer van pnpm new:resource bevat een
// lijst met zoeken en sorteren in de search params. Dat die uitvoer compileert en gate:fast haalt, bewijst check:new-resource.

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
];

// Elke tijdelijke map die de test aanmaakt, voor de opruiming na afloop.
const tijdelijkeMappen: string[] = [];

function tijdelijk(voorvoegsel: string): string {
  const map = mkdtempSync(path.join(tmpdir(), voorvoegsel));
  tijdelijkeMappen.push(map);
  return map;
}

afterAll(() => {
  for (const map of tijdelijkeMappen) rmSync(map, { recursive: true, force: true });
});

const goedgekeurd = '---\nstatus: goedgekeurd\nnamespace: notities\n---\n\n# notities\n';

let uitvoer: Record<string, string> = {};

function inhoud(pad: string): string {
  return uitvoer[pad] ?? '';
}

beforeAll(async () => {
  const root = tijdelijk('new-resource-lijst-');
  for (const pad of NODIG) cpSync(pad, path.join(root, pad), { recursive: true });
  mkdirSync(path.join(root, 'docs/specs'), { recursive: true });
  writeFileSync(path.join(root, 'docs/specs/notities.md'), goedgekeurd);
  const p = await plan(root, 'notities', { rollen: ['user'], nu: new Date('2000-01-01T00:00:00Z') });
  uitvoer = Object.fromEntries(p.bestanden.map(({ pad, inhoud: tekst }) => [pad, tekst]));
});

describe('contract (lijstpagina/AC-8)', () => {
  test('de lijst-input is een strict zoek-/sorteerschema uit defineListSearch, geen losse cursor', () => {
    const contract = inhoud('src/shared/contracts/notities.ts');

    expect(contract).toContain("from '#core/shared/list-search.ts'");
    expect(contract).toMatch(/defineListSearch\(\s*\{/);
    expect(contract).toMatch(/sorts:\s*\[\s*'nieuwste',\s*'oudste'\s*\]/);
    expect(contract).toMatch(/notitiesSearch\.api/);
    expect(contract).not.toMatch(/input:\s*z\.object\(\{\s*cursor/);
  });
});

describe('webroute (lijstpagina/AC-8)', () => {
  test('validateSearch gebruikt het web-schema; de cursor staat niet in de URL', () => {
    const route = inhoud('src/web/routes/_app/notities.tsx');

    expect(route).toMatch(/validateSearch:\s*notitiesSearch\.web/);
    expect(route).not.toContain('cursor');
  });
});

describe('queries (lijstpagina/AC-8)', () => {
  test('de zoekopdracht zit in de query key en in de request; cursor alleen via de pagina-param', () => {
    const queries = inhoud('src/web/features/notities/queries.ts');

    expect(queries).toMatch(/list:\s*\(\s*\w+/);
    expect(queries).toMatch(/queryKey:\s*notitiesKeys\.list\(\s*\w+/);
    expect(queries).toContain('placeholderData');
    expect(queries).toContain('getNextPageParam');
    expect(queries).toMatch(/\.\.\.\s*search/);
  });
});

describe('pagina (lijstpagina/AC-8)', () => {
  test('gebruikt useListSearch en ListToolbar, niet zelf navigeren of cursor in de URL', () => {
    const pagina = inhoud('src/web/features/notities/notities-page.tsx');

    expect(pagina).toContain('useListSearch');
    expect(pagina).toContain('ListToolbar');
    expect(pagina).not.toMatch(/cursor/);
  });

  test("ontdubbelt de samengevoegde pagina's op id, eerste voorkomen wint", () => {
    const pagina = inhoud('src/web/features/notities/notities-page.tsx');

    expect(pagina).toMatch(/new Set/);
    expect(pagina).toMatch(/seen\.(has|add)\(\s*item\.id\s*\)/);
  });
});

describe('teksten (lijstpagina/AC-8)', () => {
  test('zoeken, sorteren en leeg-met-filters letterlijk uit de spec', () => {
    // Alleen het blok van de nieuwe resource telt: 'Zoeken' en 'Nieuwste eerst' staan al in het blok van accounts.
    const tekst = inhoud('src/web/copy/ui.ts').split(/^\s*notities:\s*\{/m)[1] ?? '';

    expect(tekst).toContain("'Zoeken'");
    expect(tekst).toContain("'Nieuwste eerst'");
    expect(tekst).toContain("'Oudste eerst'");
    expect(tekst).toContain("'Niets gevonden. Pas je zoekopdracht aan.'");
  });
});

// De gegenereerde contractmodule echt laden: in een map binnen de repo (zodat '#core/*' en zod oplossen), met de
// gegenereerde ids.ts en de permissies na de gate-wijziging, en de echte kit.ts.
const searchModule = z.object({
  notitiesSearch: z.object({ api: z.instanceof(z.ZodType), web: z.instanceof(z.ZodType) }),
});
const werkmap = path.join(import.meta.dirname, `.tmp-lijst-${String(process.pid)}`);
let search: z.infer<typeof searchModule>['notitiesSearch'] | undefined;
const copyModule = z.object({
  copy: z.object({
    notities: z.object({
      loading: z.string(),
      shown: z.custom<(count: number, more: boolean) => string>((v) => typeof v === 'function'),
    }),
  }),
});
let copyNotities: z.infer<typeof copyModule>['copy']['notities'] | undefined;

describe('gegenereerd contract, echt geladen (lijstpagina/AC-8)', () => {
  beforeAll(async () => {
    const root = tijdelijk('new-resource-lijst-mod-');
    for (const pad of NODIG) cpSync(pad, path.join(root, pad), { recursive: true });
    mkdirSync(path.join(root, 'docs/specs'), { recursive: true });
    writeFileSync(path.join(root, 'docs/specs/notities.md'), goedgekeurd);
    const p = await plan(root, 'notities', { rollen: ['user'], nu: new Date('2000-01-01T00:00:00Z') });
    const schrijf = (pad: string, tekst: string) => {
      mkdirSync(path.dirname(path.join(werkmap, pad)), { recursive: true });
      writeFileSync(path.join(werkmap, pad), tekst);
    };
    for (const pad of ['src/shared/contracts/notities.ts', 'src/shared/ids.ts'])
      schrijf(pad, p.bestanden.find((b) => b.pad === pad)?.inhoud ?? '');
    schrijf('src/shared/contracts/kit.ts', readFileSync('src/shared/contracts/kit.ts', 'utf8'));
    const perm = p.gates.find((g) => g.pad === 'src/shared/permissions.ts');
    schrijf(
      'src/shared/permissions.ts',
      perm === undefined ? '' : pasToe(readFileSync('src/shared/permissions.ts', 'utf8'), perm),
    );
    schrijf('src/web/copy/ui.ts', p.bestanden.find((b) => b.pad === 'src/web/copy/ui.ts')?.inhoud ?? '');
    const copyMod: unknown = await import(pathToFileURL(path.join(werkmap, 'src/web/copy/ui.ts')).href);
    const copyGeparsed = copyModule.safeParse(copyMod);
    copyNotities = copyGeparsed.success ? copyGeparsed.data.copy.notities : undefined;
    const mod: unknown = await import(pathToFileURL(path.join(werkmap, 'src/shared/contracts/notities.ts')).href);
    const geparsed = searchModule.safeParse(mod);
    search = geparsed.success ? geparsed.data.notitiesSearch : undefined;
  });

  afterAll(() => {
    rmSync(werkmap, { recursive: true, force: true });
  });

  test('notitiesSearch wordt geexporteerd met een api- en een web-schema', () => {
    expect(search).toBeDefined();
  });

  test('api: geldige input wordt geaccepteerd', () => {
    expect(search?.api.safeParse({ q: ' kaas ', sort: 'oudste' }).success).toBe(true);
    expect(search?.api.safeParse({}).success).toBe(true);
  });

  test.each([
    ['onbekende sleutel', { onzin: 'x' }],
    ['te lange q', { q: 'x'.repeat(101) }],
    ['ongeldige sort', { sort: 'onzin' }],
  ])('api: %s wordt geweigerd', (_, invoer) => {
    expect(search?.api.safeParse(invoer).success).toBe(false);
  });

  test('web: ongeldige waarden vallen naar de standaard, zonder fout', () => {
    const resultaat = search?.web.safeParse({ sort: 'onzin', q: 'x'.repeat(101), onzin: 1 });
    expect(resultaat?.success).toBe(true);
    expect(resultaat?.data).toStrictEqual({});
  });
});

describe('gegenereerde spec (fase 1, lijstpagina/AC-8)', () => {
  let spec = '';
  beforeAll(async () => {
    const root = tijdelijk('new-resource-lijst-spec-');
    for (const pad of NODIG) cpSync(pad, path.join(root, pad), { recursive: true });
    mkdirSync(path.join(root, 'docs/specs'), { recursive: true });
    const p = await plan(root, 'notities');
    spec = p.bestanden.find(({ pad }) => pad === 'docs/specs/notities.md')?.inhoud ?? '';
  });

  test('vraagt naar zoeken en sorteren', () => {
    expect(spec).toMatch(/zoeken/i);
    expect(spec).toMatch(/sorteren|sortering/i);
    expect(spec).toContain('`/api/notities?q=&sort=&cursor=`');
  });

  test('cursor gebonden aan de sortering: een vreemde cursor geeft VALIDATION', () => {
    expect(spec).toMatch(/cursor[^\n]*(sortering|sort)[^\n]*VALIDATION|VALIDATION[^\n]*cursor[^\n]*(sortering|sort)/i);
  });

  test('escapen van %, _ en \\ bij zoeken', () => {
    expect(spec).toContain('`%`');
    expect(spec).toContain('`_`');
    expect(spec).toContain('`\\`');
    expect(spec).toMatch(/escap/i);
  });

  test('noemt ListToolbar en useListSearch bij de componenten', () => {
    expect(spec).toContain('ListToolbar');
    expect(spec).toContain('useListSearch');
  });
});

describe('statusregel van de gegenereerde pagina (lijstpagina/AC-8)', () => {
  test('een aria-live="polite"-regel met laden of het aantal getoonde rijen, zoals de accountpagina', () => {
    const pagina = inhoud('src/web/features/notities/notities-page.tsx');

    expect(pagina).toMatch(/aria-live=["{]+polite/);
    expect(pagina).toMatch(
      /isPlaceholderData\s*\?\s*copy\.notities\.loading\s*:\s*copy\.notities\.shown\(\s*[\w.]+\.length\s*,\s*\w+\.hasNextPage\s*\)/,
    );
  });

  test("copy: 'Bezig met laden…' en '{n} … getoond.' met ' Er zijn er meer.' bij meer pagina's", () => {
    expect(copyNotities?.loading).toBe('Bezig met laden…');
    expect(copyNotities?.shown(3, false)).toMatch(/^3 \S+ getoond\.$/);
    expect(copyNotities?.shown(3, true)).toBe(`${copyNotities?.shown(3, false) ?? ''} Er zijn er meer.`);
  });
});

// Vorm in plaats van tekst (B4): de gegenereerde bestanden als syntaxboom bekijken.
function boom(pad: string): ts.SourceFile {
  return ts.createSourceFile(pad, inhoud(pad), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function vind<Node extends ts.Node>(wortel: ts.Node, is: (node: ts.Node) => node is Node): Node[] {
  const gevonden: Node[] = [];
  const bezoek = (node: ts.Node) => {
    if (is(node)) gevonden.push(node);
    ts.forEachChild(node, bezoek);
  };
  bezoek(wortel);
  return gevonden;
}

function eigenschappen(letterlijk: ts.ObjectLiteralExpression): string[] {
  return letterlijk.properties.map((eigenschap) => eigenschap.name?.getText() ?? '');
}

describe('vorm van de gegenereerde pagina en queries (lijstpagina/AC-8)', () => {
  test('uniqueById is een functie met een Set en wordt op de samengevoegde pagina-items aangeroepen', () => {
    const bron = boom('src/web/features/notities/notities-page.tsx');
    const functie = vind(bron, ts.isFunctionDeclaration).find((f) => f.name?.text === 'uniqueById');
    const aanroepen = vind(bron, ts.isCallExpression).filter((c) => c.expression.getText() === 'uniqueById');

    expect(functie).toBeDefined();
    expect(vind(functie ?? bron, ts.isNewExpression).map((n) => n.expression.getText())).toContain('Set');
    expect(aanroepen.length).toBeGreaterThan(0);
    expect(aanroepen.some((c) => c.getText().includes('flatMap'))).toBe(true);
  });

  test('useInfiniteQuery: queryKey, placeholderData, initialPageParam en getNextPageParam', () => {
    const bron = boom('src/web/features/notities/queries.ts');
    const aanroep = vind(bron, ts.isCallExpression).find((c) => c.expression.getText() === 'useInfiniteQuery');
    const opties = aanroep?.arguments[0];

    expect(opties !== undefined && ts.isObjectLiteralExpression(opties)).toBe(true);
    if (opties === undefined || !ts.isObjectLiteralExpression(opties)) return;
    expect(eigenschappen(opties)).toEqual(
      expect.arrayContaining(['queryKey', 'queryFn', 'placeholderData', 'initialPageParam', 'getNextPageParam']),
    );
  });

  test('de key-factory list() neemt een zoekopdracht als parameter en zet die in de key', () => {
    const bron = boom('src/web/features/notities/queries.ts');
    const keys = vind(bron, ts.isVariableDeclaration).find((d) => d.name.getText() === 'notitiesKeys');
    const letterlijk =
      keys?.initializer !== undefined ? vind(keys.initializer, ts.isObjectLiteralExpression)[0] : undefined;
    const list = letterlijk?.properties.find((e) => e.name?.getText() === 'list');

    expect(list !== undefined && ts.isPropertyAssignment(list) && ts.isArrowFunction(list.initializer)).toBe(true);
    if (list === undefined || !ts.isPropertyAssignment(list) || !ts.isArrowFunction(list.initializer)) return;
    const parameter = list.initializer.parameters[0]?.name.getText() ?? '';
    expect(parameter).not.toBe('');
    expect(vind(list.initializer.body, ts.isIdentifier).map((i) => i.text)).toContain(parameter);
  });

  test('de GET-aanroep spreidt de zoekopdracht en stuurt de cursor alleen als paginaparameter mee', () => {
    const bron = boom('src/web/features/notities/queries.ts');
    const aanroep = vind(bron, ts.isCallExpression).find((c) => c.getText().startsWith("api.call('GET /notities'"));
    const argument = aanroep?.arguments[1];

    expect(vind(argument ?? bron, ts.isSpreadAssignment)).not.toHaveLength(0);
    expect(argument?.getText()).toContain('cursor');
  });
});
