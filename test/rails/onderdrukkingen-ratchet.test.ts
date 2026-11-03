import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  ingevoerd,
  leesHernoemingen,
  leesOnderdrukkingen,
  onderdrukkingenUitGit,
  onderdrukkingMeldingen,
  onderdrukkingMeldingenUitGit,
  onderdrukkingViolations,
  somPerRegel,
} from '../../scripts/kit/onderdrukkingen.mjs';
import { checks, meldingen, strikt } from '../../scripts/kit/ratchet.mjs';
import { expectNegativeTable } from '../support/negative-table.ts';

// Spec onderdrukkingen-ratchet: geen paar (bestand, lintregel) in eslint-suppressions.json stijgt tegenover de merge-base.

type Stand = Record<string, Record<string, number>>;
const json = (stand: Stand) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(stand).map(([bestand, regels]) => [
        bestand,
        Object.fromEntries(Object.entries(regels).map(([regel, count]) => [regel, { count }])),
      ]),
    ),
  );
const BASIS: Stand = { 'a.ts': { complexity: 2, 'rails/x': 1 }, 'b.ts': { complexity: 1 } };
const keys = (
  basis: string | null | undefined,
  nu: string | null,
  extra: { hernoemd?: Map<string, string>; config?: { basis: string; nu: string } } = {},
) => onderdrukkingViolations({ basis, nu, ...extra }).map(({ key }) => key);

describe('onderdrukkingen-ratchet/AC-1: geen paar (bestand, lintregel) stijgt', () => {
  test.each<[string, Stand, string[]]>([
    [
      'een nieuw bestand met een onderdrukking',
      { ...BASIS, 'c.ts': { complexity: 1 } },
      ['onderdrukkingen:groei:complexity:c.ts'],
    ],
    [
      'meer in een bestaand bestand',
      { ...BASIS, 'b.ts': { complexity: 2 } },
      ['onderdrukkingen:groei:complexity:b.ts'],
    ],
    [
      'opruimen in a.ts dekt geen nieuwe in c.ts onder dezelfde regel',
      { 'a.ts': { complexity: 1, 'rails/x': 1 }, 'b.ts': { complexity: 1 }, 'c.ts': { complexity: 1 } },
      ['onderdrukkingen:groei:complexity:c.ts'],
    ],
    [
      'een daling van de ene regel dekt geen stijging van de andere',
      { 'a.ts': { complexity: 0, 'rails/x': 3 }, 'b.ts': { complexity: 1 } },
      ['onderdrukkingen:groei:rails/x:a.ts'],
    ],
  ])('onderdrukkingen-ratchet/AC-1 %s is rood', (_, nu, verwacht) => {
    expect(keys(json(BASIS), json(nu))).toStrictEqual(verwacht);
  });

  test.each<[string, Stand]>([
    ['gelijk', BASIS],
    ['kleiner', { 'a.ts': { complexity: 1, 'rails/x': 1 } }],
    ['alles opgeruimd', {}],
  ])('onderdrukkingen-ratchet/AC-1 %s is groen', (_, nu) => {
    expect(keys(json(BASIS), json(nu))).toStrictEqual([]);
  });

  test('onderdrukkingen-ratchet/AC-1 de melding noemt bestand, regel, aantallen en de spec', () => {
    const [violation] = onderdrukkingViolations({
      basis: json(BASIS),
      nu: json({ ...BASIS, 'b.ts': { complexity: 4 } }),
    });
    expect(violation?.message).toContain('b.ts → complexity van 1 naar 4');
    expect(violation?.message).toContain('spec onderdrukkingen-ratchet');
  });

  test('onderdrukkingen-ratchet/AC-1 een hernoeming volgens git neemt het aantal van het oude pad mee', () => {
    const nu = json({ 'a2.ts': { complexity: 2, 'rails/x': 1 }, 'b.ts': { complexity: 1 } });
    expect(keys(json(BASIS), nu)).toStrictEqual([
      'onderdrukkingen:groei:complexity:a2.ts',
      'onderdrukkingen:groei:rails/x:a2.ts',
    ]);
    expect(keys(json(BASIS), nu, { hernoemd: new Map([['a2.ts', 'a.ts']]) })).toStrictEqual([]);
  });

  test('onderdrukkingen-ratchet/AC-1 leesHernoemingen leest renames en slaat kopieën en andere regels over', () => {
    const uit = ['M', 'x.ts', 'R087', 'oud.ts', 'nieuw.ts', 'C100', 'bron.ts', 'kopie.ts', 'A', 'y.ts', ''].join('\0');
    expect(leesHernoemingen(uit)).toStrictEqual(new Map([['nieuw.ts', 'oud.ts']]));
  });

  test('onderdrukkingen-ratchet/AC-1 somPerRegel telt over alle bestanden', () => {
    expect(somPerRegel(leesOnderdrukkingen(json(BASIS)).onderdrukkingen)).toStrictEqual(
      new Map([
        ['complexity', 3],
        ['rails/x', 1],
      ]),
    );
  });
});

describe('onderdrukkingen-ratchet/AC-2: een lintregel zonder onderdrukking op de basis', () => {
  const nu = json({ ...BASIS, 'c.ts': { 'rails/nieuw': 4, '@typescript-eslint/no-explicit-any': 1 } });
  const config = (naam: string) => ({
    basis: "rules: { 'rails/x': 1 }",
    nu: `rules: { 'rails/x': 1 }, restrict('${naam}')`,
  });

  test('onderdrukkingen-ratchet/AC-2 is rood als deze PR de regel niet invoert (--suppress-rule op een preset-regel)', () => {
    expect(keys(json(BASIS), nu)).toStrictEqual([
      'onderdrukkingen:groei:rails/nieuw:c.ts',
      'onderdrukkingen:groei:@typescript-eslint/no-explicit-any:c.ts',
    ]);
  });

  test('onderdrukkingen-ratchet/AC-2 is rood na een prune tot nul en opnieuw onderdrukken', () => {
    const basis = json({ 'a.ts': { 'rails/x': 1 } });
    const leeg = json({});
    expect(keys(leeg, basis, { config: { basis: "restrict('x')", nu: "restrict('x')" } })).toStrictEqual([
      'onderdrukkingen:groei:rails/x:a.ts',
    ]);
  });

  test('onderdrukkingen-ratchet/AC-2 is een melding als de naam nieuw in eslint.config.js staat', () => {
    expect(keys(json(BASIS), nu, { config: config('nieuw') })).toStrictEqual([
      'onderdrukkingen:groei:@typescript-eslint/no-explicit-any:c.ts',
    ]);
    const meldingen = onderdrukkingMeldingen({ basis: json(BASIS), nu, gewijzigd: [], config: config('nieuw') });
    expect(meldingen.filter((m) => m.includes('voert lintregel rails/nieuw in met 4'))).toHaveLength(1);
  });

  test.each([
    ['rails/x', "restrict('x')"],
    ['rails/x', 'restrict("x")'],
    ['@typescript-eslint/no-explicit-any', "'@typescript-eslint/no-explicit-any': 'error'"],
  ])('onderdrukkingen-ratchet/AC-2 ingevoerd(%s) met config %s', (regel, nuConfig) => {
    expect(ingevoerd(regel, { basis: '', nu: nuConfig })).toBe(true);
  });

  test('onderdrukkingen-ratchet/AC-2 niet ingevoerd: elke rij maakt één voorwaarde onwaar', () => {
    expectNegativeTable({
      base: { regel: 'rails/x', basis: '', nu: "restrict('x')" },
      check: ({ regel, basis, nu }) => ingevoerd(regel, { basis, nu }),
      cases: [
        { name: 'de naam stond op de basis al in de config', change: (b) => ({ ...b, basis: b.nu }) },
        { name: 'de naam staat zonder aanhalingstekens in de config', change: (b) => ({ ...b, nu: 'restrict(x)' }) },
        { name: 'een andere naam', change: (b) => ({ ...b, nu: "restrict('xx')" }) },
        {
          name: 'een sleutel zonder aanhalingstekens',
          change: (b) => ({ ...b, regel: 'complexity', nu: "complexity: ['error', 15]" }),
        },
      ],
    });
  });

  test('onderdrukkingen-ratchet/AC-2 ontbreekt het bestand op de basis, dan geldt hetzelfde', () => {
    expect(keys(null, json({ 'a.ts': { complexity: 1 } }))).toStrictEqual(['onderdrukkingen:groei:complexity:a.ts']);
  });
});

describe('onderdrukkingen-ratchet/AC-3: ongeldig bestand en ontbrekende basis', () => {
  test.each([
    ['kapotte JSON', '{', 'onderdrukkingen:vorm:geen geldige JSON'],
    ['een lijst', '[]', 'onderdrukkingen:vorm:geen object'],
    [
      'count 1.5',
      '{"a.ts":{"complexity":{"count":1.5}}}',
      'onderdrukkingen:vorm:a.ts → complexity: count is geen geheel getal ≥ 0',
    ],
    [
      'count -1',
      '{"a.ts":{"complexity":{"count":-1}}}',
      'onderdrukkingen:vorm:a.ts → complexity: count is geen geheel getal ≥ 0',
    ],
    [
      'count als tekst',
      '{"a.ts":{"complexity":{"count":"2"}}}',
      'onderdrukkingen:vorm:a.ts → complexity: count is geen geheel getal ≥ 0',
    ],
    ['bestand zonder object', '{"a.ts":3}', 'onderdrukkingen:vorm:a.ts: geen object'],
  ])('onderdrukkingen-ratchet/AC-3 %s in de werkmap is rood, ook zonder basis', (_, nu, key) => {
    expect(keys(json(BASIS), nu)).toStrictEqual([key]);
    expect(keys(undefined, nu)).toStrictEqual([key]);
  });

  test('onderdrukkingen-ratchet/AC-3 een ontbrekend bestand in de werkmap telt als 0', () => {
    expect(keys(json(BASIS), null)).toStrictEqual([]);
  });

  test('onderdrukkingen-ratchet/AC-3 met een ongeldige basis vergelijkt hij niet', () => {
    expect(keys('{', json({ 'a.ts': { complexity: 99 } }))).toStrictEqual([]);
  });

  test('onderdrukkingen-ratchet/AC-3 zonder basis vergelijkt hij niet', () => {
    expect(keys(undefined, json({ 'a.ts': { complexity: 99 } }))).toStrictEqual([]);
  });
});

describe('onderdrukkingen-ratchet/AC-4: stand en opruimbare onderdrukkingen', () => {
  test('onderdrukkingen-ratchet/AC-4 de stand per lintregel nu en op de basis', () => {
    const meldingen = onderdrukkingMeldingen({
      basis: json(BASIS),
      nu: json({ 'a.ts': { complexity: 1, 'rails/x': 1 } }),
      gewijzigd: [],
    });
    expect(meldingen).toStrictEqual([
      'eslint-suppressions.json: complexity 1 (basis 3), rails/x 1 (basis 1); doel per lintregel in docs/roadmap.md',
    ]);
    expect(onderdrukkingMeldingen({ basis: json(BASIS), nu: json({}), gewijzigd: [] })).toStrictEqual([
      'eslint-suppressions.json: complexity 0 (basis 3), rails/x 0 (basis 1); doel per lintregel in docs/roadmap.md',
    ]);
  });

  test('onderdrukkingen-ratchet/AC-4 een gewijzigd bestand met onderdrukkingen wordt genoemd, een ander niet', () => {
    const meldingen = onderdrukkingMeldingen({ basis: json(BASIS), nu: json(BASIS), gewijzigd: ['a.ts', 'z.ts'] });
    const opruimen = meldingen.filter((m) => m.includes('ruim ze op'));
    expect(opruimen).toHaveLength(1);
    expect(opruimen[0]).toContain('a.ts: 2× complexity; a.ts: 1× rails/x');
    expect(opruimen[0]).not.toContain('b.ts');
    expect(opruimen[0]).not.toContain('z.ts');
  });
});

describe('onderdrukkingen-ratchet: koppeling met git', () => {
  const mappen: string[] = [];
  afterEach(() => {
    for (const map of mappen.splice(0)) rmSync(map, { recursive: true, force: true });
  });

  function run(cwd: string, ...args: string[]) {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  }

  function repo(basis: Stand | null) {
    const root = mkdtempSync(path.join(tmpdir(), 'onderdrukkingen-'));
    mappen.push(root);
    run(root, 'init', '-q', '-b', 'main');
    run(root, 'config', 'user.email', 't@example.invalid');
    run(root, 'config', 'user.name', 'Test');
    writeFileSync(path.join(root, 'a.ts'), 'x\n');
    if (basis !== null) writeFileSync(path.join(root, 'eslint-suppressions.json'), json(basis));
    run(root, 'add', '-A');
    run(root, 'commit', '-q', '-m', 'basis');
    run(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    return root;
  }

  test('onderdrukkingen-ratchet/AC-1 een stijging in de werkmap tegenover origin/main is rood', () => {
    const root = repo(BASIS);
    writeFileSync(path.join(root, 'eslint-suppressions.json'), json({ ...BASIS, 'c.ts': { complexity: 1 } }));
    expect(onderdrukkingenUitGit(root, false).map(({ key }) => key)).toStrictEqual([
      'onderdrukkingen:groei:complexity:c.ts',
    ]);
    expect(onderdrukkingenUitGit(repo(BASIS), false)).toStrictEqual([]);
  });

  test('onderdrukkingen-ratchet/AC-1 een git mv neemt de onderdrukkingen mee', () => {
    const root = repo({ 'a.ts': { complexity: 1 } });
    run(root, 'mv', 'a.ts', 'a2.ts');
    writeFileSync(path.join(root, 'eslint-suppressions.json'), json({ 'a2.ts': { complexity: 1 } }));
    expect(onderdrukkingenUitGit(root, false)).toStrictEqual([]);
  });

  test('onderdrukkingen-ratchet/AC-3 een ongeldige basis is in CI rood', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'onderdrukkingen-'));
    mappen.push(root);
    run(root, 'init', '-q', '-b', 'main');
    run(root, 'config', 'user.email', 't@example.invalid');
    run(root, 'config', 'user.name', 'Test');
    writeFileSync(path.join(root, 'eslint-suppressions.json'), '{');
    run(root, 'add', '-A');
    run(root, 'commit', '-q', '-m', 'basis');
    run(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    writeFileSync(path.join(root, 'eslint-suppressions.json'), json({}));
    expect(onderdrukkingenUitGit(root, true).map(({ key }) => key)).toStrictEqual(['onderdrukkingen:ongeldige-basis']);
    expect(onderdrukkingMeldingenUitGit(root)[0]).toContain('op de merge-base is ongeldig');
  });

  test('onderdrukkingen-ratchet/AC-4 een gewijzigd bestand komt uit git diff tegenover de basis', () => {
    const root = repo(BASIS);
    writeFileSync(path.join(root, 'a.ts'), 'y\n');
    expect(onderdrukkingMeldingenUitGit(root).some((m) => m.includes('a.ts: 2× complexity'))).toBe(true);
  });

  test('onderdrukkingen-ratchet/AC-3 zonder origin/main: rood in CI, lokaal een melding', () => {
    const root = repo(BASIS);
    run(root, 'update-ref', '-d', 'refs/remotes/origin/main');
    expect(onderdrukkingenUitGit(root, true).map(({ key }) => key)).toStrictEqual(['onderdrukkingen:geen-basis']);
    expect(onderdrukkingenUitGit(root, false)).toStrictEqual([]);
    expect(onderdrukkingMeldingenUitGit(root)).toStrictEqual([
      'let op: geen merge-base met origin/main; de ratchet op eslint-suppressions.json toetst niets (onderdrukkingen-ratchet/AC-3)',
    ]);
  });
});

describe('onderdrukkingen-ratchet/AC-1: kanaal strikt, nooit in de baseline', () => {
  test('onderdrukkingen-ratchet/AC-1 de check staat in strikt en meldingen van pnpm ratchet, niet in de baseline-checks', () => {
    expect(Object.keys(strikt)).toContain('eslint-onderdrukkingen');
    expect(Object.keys(meldingen)).toContain('eslint-onderdrukkingen');
    expect(Object.keys(checks)).toStrictEqual(['dependency-cruiser', 'check-docs']);
  });
});

describe('onderdrukkingen-ratchet/AC-5: regelboek en gate-register noemen de ratchet', () => {
  test('onderdrukkingen-ratchet/AC-5 R-CI-02 en de beschrijving van pnpm ratchet', () => {
    const regel = readFileSync('docs/framework.md', 'utf8')
      .split('\n')
      .find((r) => r.startsWith('- **R-CI-02**'));
    expect(regel).toContain('`eslint-suppressions.json`');
    expect(regel).toContain('onderdrukkingen-ratchet');
    const ratchet = readFileSync('scripts/kit/gates.mjs', 'utf8').split('\n').slice(17, 22).join('\n');
    expect(ratchet).toContain("script: 'ratchet'");
    expect(ratchet).toContain('eslint-suppressions.json');
  });
});
