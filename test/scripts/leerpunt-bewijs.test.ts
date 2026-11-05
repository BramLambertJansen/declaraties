import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { agentMerge, beoordeel, leesConfig } from '../../scripts/kit/diff-guard.mjs';
import {
  bewijsPlan,
  graphqlData,
  leerpuntMergeRedenen,
  leesLeerpuntSectie,
  leesVitest,
  metExit,
  runOordeel,
  typeUitslag,
} from '../../scripts/kit/leerpunt.mjs';
import {
  diffPaden,
  leesGesloten,
  opdracht,
  TYPE_CONFIG,
  typeConfig,
  zonderToken,
} from '../../scripts/kit/leerpunt-bewijs.mjs';

// Bewijsjob voor een PR die een leerpunt sluit (ADR 0078 punt 1 en 2, spec leerlus-bewijs AC-1 t/m AC-4).
const sectie = (...regels: string[]) =>
  ['## Samenvatting', '', 'tekst', '', '## Leerpunt', '', ...regels, '', '## Test'].join('\n');
const LP = (nummer: number) => ({ nummer, labels: ['leerpunt'] });
const plan = (body: string, diff: string[] = [], gesloten = [LP(9)]) => bewijsPlan({ gesloten, body, diff });

// Vitest-verslagen in de vorm die `vitest run --reporter=json` echt schrijft (vastgelegd met vitest 4 in deze repo).
const verslag = (
  status: string,
  asserties: string[],
  { message = '', melding = 'AssertionError: expected 1 to be 2 // Object.is equality' } = {},
) => ({
  numTotalTests: asserties.length,
  success: status === 'passed',
  testResults: [
    {
      name: '/repo/test/a.test.ts',
      status,
      message,
      assertionResults: asserties.map((s) => ({
        status: s,
        title: 't',
        failureMessages: s === 'failed' ? [melding] : [],
      })),
    },
  ],
});
const GROEN = verslag('passed', ['passed']);
const ASSERTIE = verslag('failed', ['failed']);
const IMPORT = verslag('failed', [], {
  message: "Cannot find module './nergens.mjs' imported from /repo/test/a.test.ts",
});
// Een ontbrekende export: vite geeft `undefined`, de test faalt met een TypeError (vastgelegd met vitest 5.0.3).
const EXPORT = verslag('failed', ['failed'], {
  melding: 'TypeError: (0 , __vite_ssr_import_1__.nieuw) is not a function',
});
const PAD = 'test/a.test.ts';

describe('leerlus-bewijs/AC-1 welke leerpunten de PR sluit', () => {
  test('leerlus-bewijs/AC-1: gesloten issues komen uit closingIssuesReferences', () => {
    const data = {
      data: {
        repository: {
          pullRequest: {
            closingIssuesReferences: {
              nodes: [
                { number: 9, labels: { nodes: [{ name: 'leerpunt' }] } },
                { number: 10, labels: { nodes: [{ name: 'bug' }] } },
              ],
            },
          },
        },
      },
    };
    expect(leesGesloten(data)).toEqual([LP(9), { nummer: 10, labels: ['bug'] }]);
  });

  test('leerlus-bewijs/AC-1: PR zonder leerpunt: niets te draaien, geen fout', () => {
    expect(plan('geen sectie', [], [{ nummer: 10, labels: ['bug'] }])).toEqual({
      leerpunten: [],
      fouten: [],
      runs: [],
      zonderTest: false,
    });
  });

  test('leerlus-bewijs/AC-1: leerpunt zonder regel in de sectie: rood met het nummer', () => {
    expect(plan('Fixes #9').fouten).toEqual(['#9: geen regel "- #9: …" in de sectie ## Leerpunt']);
    expect(plan(sectie('- #8: trede Check; bewijs test/a.test.ts'), ['test/a.test.ts']).fouten).toEqual([
      '#9: geen regel "- #9: …" in de sectie ## Leerpunt',
    ]);
  });

  test('leerlus-bewijs/AC-1: de sectie stopt bij de volgende kop', () => {
    const body = [
      '## Leerpunt',
      '- #9: trede Check; bewijs test/a.test.ts',
      '## Test',
      '- #10: trede Check; bewijs test/b.test.ts',
    ];
    expect(leesLeerpuntSectie(body.join('\r\n')).map((r) => r.nummer)).toEqual([9]);
  });
});

describe('leerlus-bewijs/AC-2 het bewijspad', () => {
  test.each([
    ['unit in de diff', 'Check', 'test/scripts/a.test.ts', ['test/scripts/a.test.ts'], null],
    ['tsx in de diff', 'Check', 'src/web/a.test.tsx', ['src/web/a.test.tsx'], null],
    ['pad tussen backticks', 'Check', '`test/a.test.ts`', ['test/a.test.ts'], null],
    ['typetest bij Type', 'Type', 'test/a.test-d.ts', ['test/a.test-d.ts'], null],
    ['niet in de diff', 'Check', 'test/a.test.ts', [], /staat niet als toegevoegd of gewijzigd/],
    ['geen test', 'Check', 'src/a.ts', ['src/a.ts'], /geen unit- of typetest/],
    ['integratietest', 'Check', 'src/a.int.test.ts', ['src/a.int.test.ts'], /geen unit- of typetest/],
    ['e2e', 'Check', 'e2e/a.test.ts', ['e2e/a.test.ts'], /geen unit- of typetest/],
    ['typetest bij Check', 'Check', 'test/a.test-d.ts', ['test/a.test-d.ts'], /hoort bij trede Type/],
    ['onbekende trede', 'Lint', 'test/a.test.ts', ['test/a.test.ts'], /onbekende trede "Lint"/],
  ])('leerlus-bewijs/AC-2: %s', (...[, trede, pad, diff, fout]) => {
    const uitslag = plan(sectie(`- #9: trede ${trede}; bewijs ${pad}`), diff);
    if (fout === null) {
      expect(uitslag.fouten).toEqual([]);
      expect(uitslag.runs).toEqual([{ pad: pad.replaceAll('`', ''), soort: trede === 'Type' ? 'type' : 'unit' }]);
    } else expect(uitslag.fouten.join('\n')).toMatch(fout);
  });

  test('leerlus-bewijs/AC-2: één test voor twee leerpunten draait één keer', () => {
    const body = sectie('- #9: trede Check; bewijs test/a.test.ts', '* #10: trede Check; bewijs test/a.test.ts');
    expect(plan(body, ['test/a.test.ts'], [LP(9), LP(10)]).runs).toEqual([{ pad: 'test/a.test.ts', soort: 'unit' }]);
  });

  test('leerlus-bewijs/AC-2: diffPaden neemt toegevoegd, gewijzigd en het nieuwe pad bij hernoemen of kopiëren', () => {
    const uitvoer = [
      'A',
      'a.test.ts',
      'M',
      'b.test.ts',
      'D',
      'c.test.ts',
      'R100',
      'oud.ts',
      'd.test.ts',
      'C90',
      'x.ts',
      'e.test.ts',
      '',
    ].join('\0');
    expect(diffPaden(uitvoer)).toEqual(['a.test.ts', 'b.test.ts', 'd.test.ts', 'e.test.ts']);
  });
});

describe('leerlus-bewijs/AC-3 rood op de basis, groen op de head', () => {
  test('leerlus-bewijs/AC-3: leesVitest op echte verslagvormen', () => {
    expect(leesVitest(GROEN, PAD).status).toBe('groen');
    expect(leesVitest(ASSERTIE, PAD).status).toBe('rood');
    expect(leesVitest(IMPORT, PAD).status).toBe('laadfout');
    expect(leesVitest(null, PAD).status).toBe('laadfout');
  });

  const unit = { pad: 'test/a.test.ts', soort: 'unit' };
  test.each([
    ['assertie op de basis, groen op de head', ASSERTIE, GROEN, null],
    ['slaagt ook op de basis', GROEN, GROEN, /slaagt ook op de basis \(basis groen, head groen\)/],
    ['faalt op de basis alleen op een import', IMPORT, GROEN, /op laden, niet op een assertie \(basis laadfout/],
    [
      'faalt op de basis op een ontbrekende export (TypeError)',
      EXPORT,
      GROEN,
      /op laden, niet op een assertie \(basis laadfout/,
    ],
    ['faalt op de head', ASSERTIE, ASSERTIE, /faalt op de head \(basis rood, head rood\)/],
  ])('leerlus-bewijs/AC-3: %s', (...[, basis, head, fout]) => {
    const uitslag = runOordeel(unit, { basis: leesVitest(basis, PAD), head: leesVitest(head, PAD) });
    if (fout === null) expect(uitslag).toBeNull();
    else expect(uitslag).toMatch(fout);
  });

  test('leerlus-bewijs/AC-3: typetest: compileert niet op de basis, wel op de head', () => {
    const type = { pad: 'test/a.test-d.ts', soort: 'type' };
    expect(
      runOordeel(type, {
        basis: typeUitslag(2, "x.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'."),
        head: typeUitslag(0, ''),
      }),
    ).toBeNull();
    expect(runOordeel(type, { basis: typeUitslag(0, ''), head: typeUitslag(0, '') })).toMatch(/slaagt ook op de basis/);
    expect(
      runOordeel(type, {
        basis: typeUitslag(2, "x.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'."),
        head: typeUitslag(2, "x.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'."),
      }),
    ).toMatch(/faalt op de head/);
  });

  test('leerlus-bewijs/AC-3: opdracht en tsconfig per soort', () => {
    expect(opdracht({ pad: 'test/a.test.ts', soort: 'unit' }, '/t/v.json')).toEqual([
      'exec',
      'vitest',
      'run',
      'test/a.test.ts',
      '--reporter=json',
      '--outputFile=/t/v.json',
    ]);
    expect(opdracht({ pad: 'test/a.test-d.ts', soort: 'type' }, '/t/v.json')).toEqual([
      'exec',
      'tsc',
      '-p',
      TYPE_CONFIG,
    ]);
    expect(JSON.parse(typeConfig('src/web/a.test-d.ts'))).toMatchObject({
      extends: './tsconfig.web.json',
      files: ['src/web/a.test-d.ts'],
      include: [],
    });
    expect(JSON.parse(typeConfig('test/a.test-d.ts'))).toMatchObject({ extends: './tsconfig.node.json' });
  });

  test('leerlus-bewijs/AC-3: de PR-code krijgt geen token of geheim', () => {
    const oud = { ...process.env };
    Object.assign(process.env, {
      GH_TOKEN: 'x',
      GITHUB_TOKEN: 'x',
      NPM_SECRET: 'x',
      ACTIONS_RUNTIME_TOKEN: 'x',
      DB_PASSWORD: 'x',
      CI: 'true',
    });
    try {
      const env = zonderToken();
      expect(Object.keys(env).filter((k) => /TOKEN|SECRET|PASSWORD|^ACTIONS_/i.test(k))).toEqual([]);
      expect(env['CI']).toBe('true');
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in oud)) Reflect.deleteProperty(process.env, k);
      Object.assign(process.env, oud);
    }
  });

  test('leerlus-bewijs/AC-3: plan op een fixture-repo neemt de merge-base en het bewijsbestand uit de diff', () => {
    const map = mkdtempSync(path.join(tmpdir(), 'leerpunt-plan-'));
    const repo = path.join(map, 'repo');
    mkdirSync(path.join(repo, 'test'), { recursive: true });
    const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    writeFileSync(path.join(repo, 'a.ts'), 'export const a = 1;\n');
    git('add', '.');
    git('commit', '-qm', 'basis');
    const basis = git('rev-parse', 'HEAD');
    writeFileSync(path.join(repo, 'test/a.test.ts'), 'test\n');
    git('add', '.');
    git('commit', '-qm', 'head');
    const invoer = path.join(map, 'in.json');
    const uit = path.join(map, 'plan.json');
    writeFileSync(
      invoer,
      JSON.stringify({ gesloten: [LP(9)], body: sectie('- #9: trede Check; bewijs test/a.test.ts') }),
    );
    execFileSync(process.execPath, ['scripts/kit/leerpunt-bewijs.mjs', 'plan', invoer, repo, basis, uit], {
      encoding: 'utf8',
    });
    expect(JSON.parse(readFileSync(uit, 'utf8'))).toMatchObject({
      leerpunten: [9],
      fouten: [],
      runs: [{ pad: 'test/a.test.ts', soort: 'unit' }],
      splitsing: basis,
    });
  });
});

describe('leerlus-bewijs/AC-4 geen test: <reden>', () => {
  test.each([
    ['Skill', 'alleen skilltekst', [], null],
    ['Padregel', 'regel in .claude/rules', [], null],
    ['AGENTS.md', 'instructie', [], null],
    ['Check', 'integratietest src/a.int.test.ts', ['src/a.int.test.ts'], null],
    ['Check', 'e2e-test `e2e/login.test.ts`', ['e2e/login.test.ts'], null],
    ['Check', 'integratietest src/a.int.test.ts', [], /alleen met een integratie- of e2e-test uit de diff/],
    ['Check', 'te lastig', [], /alleen met een integratie- of e2e-test/],
    ['Type', 'geen zin', [], /alleen met een integratie- of e2e-test/],
    ['Skill', '', [], /"geen test" zonder reden/],
  ])('leerlus-bewijs/AC-4: trede %s, reden %j', (...[trede, reden, diff, fout]) => {
    const uitslag = plan(sectie(`- #9: trede ${trede}; bewijs geen test: ${reden}`), diff);
    if (fout === null) {
      expect(uitslag.fouten).toEqual([]);
      expect(uitslag.runs).toEqual([]);
      expect(uitslag.zonderTest).toBe(true);
    } else expect(uitslag.fouten.join('\n')).toMatch(fout);
  });

  test('leerlus-bewijs/AC-4: geen test geeft de merge-reden, bewijs met pad niet', () => {
    expect(leerpuntMergeRedenen(sectie('- #9: trede Skill; bewijs geen test: tekst'))).toEqual([
      'leerpunt zonder test',
    ]);
    expect(leerpuntMergeRedenen(sectie('- #9: trede Check; bewijs test/a.test.ts'))).toEqual([]);
    expect(leerpuntMergeRedenen('')).toEqual([]);
  });

  test('leerlus-bewijs/AC-4: diff-guard: agent-merge nee met reden leerpunt zonder test', () => {
    const tekst = readFileSync('.claude/gates.json', 'utf8');
    const config = leesConfig(tekst);
    const pr = {
      wijzigingen: [],
      json: {},
      reviews: [],
      auteur: 'x',
      headSha: 'a'.repeat(40),
      regels: 1,
      binair: [],
      bytes: 1,
    };
    const zonder = agentMerge(pr, beoordeel(pr, config), tekst);
    const met = { ...pr, body: sectie('- #9: trede Skill; bewijs geen test: tekst') };
    expect(agentMerge(met, beoordeel(met, config), tekst)).toEqual({
      oordeel: 'nee',
      redenen: [...zonder.redenen, 'leerpunt zonder test: de eigenaar merget'],
    });
    const bewijs = { ...pr, body: sectie('- #9: trede Check; bewijs test/a.test.ts') };
    expect(agentMerge(bewijs, beoordeel(bewijs, config), tekst)).toEqual(zonder);
  });
});

describe('leerlus-bewijs/AC-1 en AC-3 GraphQL-fouten en exitstatus', () => {
  test('leerlus-bewijs/AC-1: een GraphQL-fout of ontbrekende PR telt niet als "geen leerpunten"', () => {
    expect(() =>
      graphqlData({ data: { repository: null }, errors: [{ message: 'Resource not accessible' }] }, ['repository']),
    ).toThrow(/Resource not accessible/);
    expect(() => graphqlData({ data: { repository: { pullRequest: null } } }, ['repository', 'pullRequest'])).toThrow(
      /geen pullRequest/,
    );
    const data = { repository: { pullRequest: { closingIssuesReferences: { nodes: [] } } } };
    expect(graphqlData({ data }, ['repository', 'pullRequest'])).toEqual(data);
  });

  test('leerlus-bewijs/AC-3: groene asserties met een exitstatus ongelijk aan 0 zijn geen groen en geen bewijs', () => {
    expect(metExit(leesVitest(GROEN, PAD), 0).status).toBe('groen');
    expect(metExit(leesVitest(GROEN, PAD), 1).status).toBe('laadfout');
    expect(metExit(leesVitest(ASSERTIE, PAD), 1).status).toBe('rood');
    const unit = { pad: 'test/a.test.ts', soort: 'unit' };
    expect(runOordeel(unit, { basis: leesVitest(ASSERTIE, PAD), head: metExit(leesVitest(GROEN, PAD), 1) })).toMatch(
      /faalt op de head/,
    );
  });
});

describe('leerlus-bewijs/AC-3 alleen een echte assertie is bewijs', () => {
  test('leerlus-bewijs/AC-3: een TypeError telt als laadfout, ook naast een assertie', () => {
    expect(leesVitest(EXPORT, PAD)).toMatchObject({ status: 'laadfout', laadFout: true, assertieFouten: 0 });
    const gemengd = verslag('failed', ['failed', 'failed']);
    const tests = gemengd.testResults[0]?.assertionResults ?? [];
    if (tests[1] !== undefined) tests[1].failureMessages = ['TypeError: x is not a function'];
    expect(leesVitest(gemengd, PAD).status).toBe('laadfout');
  });

  test('leerlus-bewijs/AC-3: alleen het bewijsbestand telt, niet een ander bestand met dezelfde deelstring', () => {
    const ander = {
      ...GROEN,
      testResults: [...GROEN.testResults, { ...ASSERTIE.testResults[0], name: '/repo/test/a.test.tsx' }],
    };
    expect(leesVitest(ander, PAD).status).toBe('groen');
    expect(leesVitest(GROEN, 'test/b.test.ts').status).toBe('laadfout');
  });

  test.each([
    ["error TS2305: Module '\"./mod.ts\"' has no exported member 'nieuw'.", 'laadfout'],
    ["error TS2307: Cannot find module './nergens' or its corresponding type declarations.", 'laadfout'],
    ["error TS2724: '\"./mod.ts\"' has no exported member named 'nieuw'. Did you mean 'oud'?", 'laadfout'],
    ["error TS2322: Type 'string' is not assignable to type 'number'.", 'rood'],
  ])('leerlus-bewijs/AC-3: typetest met %s op de basis: %s', (uitvoer, status) => {
    expect(typeUitslag(2, `t.test-d.ts(1,10): ${uitvoer}`).status).toBe(status);
  });

  test('leerlus-bewijs/AC-3: typetest met een ontbrekende export op de basis is geen bewijs', () => {
    const type = { pad: 'test/a.test-d.ts', soort: 'type' };
    const basis = typeUitslag(
      2,
      "t.test-d.ts(1,10): error TS2305: Module '\"./mod.ts\"' has no exported member 'nieuw'.",
    );
    expect(runOordeel(type, { basis, head: typeUitslag(0, '') })).toMatch(/op laden, niet op een assertie/);
  });
});

describe('leerlus-bewijs/AC-3 overgeslagen tests', () => {
  test('leerlus-bewijs/AC-3: alleen overgeslagen tests op de head zijn geen groen', () => {
    expect(leesVitest(verslag('passed', ['skipped']), PAD).status).toBe('laadfout');
    expect(leesVitest(verslag('passed', ['skipped', 'passed']), PAD).status).toBe('groen');
    const unit = { pad: PAD, soort: 'unit' };
    expect(
      runOordeel(unit, { basis: leesVitest(ASSERTIE, PAD), head: leesVitest(verslag('passed', ['skipped']), PAD) }),
    ).toMatch(/faalt op de head/);
  });
});
