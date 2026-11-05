import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  agentMergeFouten,
  agentMergeOordeel,
  leesAgentMerge,
  leesMergeConfig,
} from '../../scripts/kit/agent-merge.mjs';
import { agentMerge, beoordeel, leesConfig, numstatArgs, parseNumstat } from '../../scripts/kit/diff-guard.mjs';
import { agentMergeViolations } from '../../scripts/kit/check-docs.mjs';

// Agent-merge zonder Codex-tegoed, met een omvanggrens (ADR 0069 herzien, spec agent-merge-zonder-codex AC-1, AC-2, AC-6).
const TEKST = readFileSync('.claude/gates.json', 'utf8');
const guardConfig = leesConfig(TEKST);
const HEAD = 'a'.repeat(40);
const BLOK = { toegestaan: ['src/**'], kritiek: [], maxBytes: 40000 };

type Wijziging = { status: string; pad: string; van?: string };

function oordeel(wijzigingen: Wijziging[], omvang: { regels?: number; binair?: string[] }, tekst = TEKST) {
  const p = { wijzigingen, json: {}, reviews: [], auteur: 'BramLambertJansen', headSha: HEAD, bytes: 0, ...omvang };
  return agentMerge(p, beoordeel(p, guardConfig), tekst);
}

// In de nieuwe vorm (padtabel, ADR 0079) staan `toegestaan` en `kritiek` niet in het blok van de echte tekst: ze komen uit `paden`.
const zonderLijsten = (blok: unknown): Record<string, unknown> =>
  typeof blok === 'object' && blok !== null
    ? Object.fromEntries(Object.entries(blok).filter(([sleutel]) => sleutel !== 'toegestaan' && sleutel !== 'kritiek'))
    : {};

const metGrens = (maxRegels: number) => {
  const ruw: unknown = JSON.parse(TEKST);
  const blok: unknown = typeof ruw === 'object' && ruw !== null ? Reflect.get(ruw, 'agentMerge') : undefined;
  return JSON.stringify(Object.assign({}, ruw, { agentMerge: { ...zonderLijsten(blok), maxRegels } }));
};

describe('agent-merge-zonder-codex/AC-1 leesAgentMerge: codex en maxRegels', () => {
  test.each([
    [true, true],
    [false, false],
    ['indien-aanwezig', 'indien-aanwezig'],
    ['ja', true],
    [undefined, true],
    [null, true],
    [0, true],
  ])('codex %j wordt %j', (codex, verwacht) => {
    expect(leesAgentMerge({ agentMerge: { ...BLOK, codex, maxRegels: 400 } })?.codex).toBe(verwacht);
  });

  test('maxRegels 400 wordt gelezen', () => {
    expect(leesAgentMerge({ agentMerge: { ...BLOK, codex: true, maxRegels: 400 } })).toEqual({
      ...BLOK,
      codex: true,
      maxRegels: 400,
    });
  });

  test.each([[undefined], [0], [-1], [400.5], ['400'], [null]])(
    'maxRegels %j: het hele resultaat is null',
    (maxRegels) => {
      expect(leesAgentMerge({ agentMerge: { ...BLOK, codex: true, maxRegels } })).toBeNull();
    },
  );

  test('zonder maxRegels is het oordeel nee met de bestaande reden (geen omvangreden in de diff-guard)', () => {
    const ruw: unknown = JSON.parse(TEKST);
    const zonder = JSON.stringify(Object.assign({}, ruw, { agentMerge: { ...zonderLijsten(BLOK), codex: true } }));
    expect(oordeel([{ status: 'M', pad: 'src/web/x.ts' }], { regels: 1, binair: [] }, zonder)).toEqual({
      oordeel: 'nee',
      redenen: ['agentMerge ontbreekt of is onleesbaar in .claude/gates.json'],
    });
  });

  test('de echte gates.json: codex indien-aanwezig, grens 400', () => {
    expect(leesMergeConfig(TEKST).agentMerge).toMatchObject({ codex: 'indien-aanwezig', maxRegels: 400 });
  });
});

describe('agent-merge-zonder-codex/AC-2 oordeel op omvang en binaire bestanden', () => {
  const src = [{ status: 'M', pad: 'src/web/x.ts' }];

  test.each([
    [399, 'ja'],
    [400, 'ja'],
    [401, 'nee'],
  ])('%i regels bij grens 400: %s', (regels, verwacht) => {
    const uitslag = oordeel(src, { regels, binair: [] }, metGrens(400));
    expect(uitslag.oordeel).toBe(verwacht);
    expect(uitslag.redenen).toEqual(
      verwacht === 'ja' ? [] : ['PR te groot voor een agent-merge: 401 regels, grens 400 (agentMerge.maxRegels)'],
    );
  });

  test('een binair bestand onder docs/', () => {
    expect(oordeel([{ status: 'A', pad: 'docs/x.png' }], { regels: 0, binair: ['docs/x.png'] })).toEqual({
      oordeel: 'nee',
      redenen: ['binair bestand in de PR: geen agent-merge (docs/x.png)'],
    });
  });

  test('regels ontbreekt in de diff-guard-invoer: nee met de omvangreden', () => {
    expect(oordeel(src, {})).toEqual({
      oordeel: 'nee',
      redenen: ['omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge'],
    });
  });

  test.each([
    ['is negatief', { regels: -1, binair: [] }],
    ['is een breuk', { regels: 1.5, binair: [] }],
    ['is tekst', { regels: '3', binair: [] }],
    ['is null', { regels: null, binair: [] }],
    ['binair ontbreekt', { regels: 3 }],
  ])('regels %s: nee met de omvangreden', (_naam, omvang) => {
    const invoer = { wijzigingen: src, json: {}, geraakteJson: [], risico: {}, bytes: 0, ...omvang };
    expect(agentMergeOordeel(invoer, leesMergeConfig(TEKST))).toEqual({
      oordeel: 'nee',
      redenen: ['omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge'],
    });
  });

  test('zuivere hernoeming: 0 regels, beide paden op de lijsten getoetst', () => {
    expect(parseNumstat('0\t0\t\0src/web/oud.ts\0src/web/nieuw.ts\0')).toEqual({ regels: 0, binair: [] });
    const hernoemd = oordeel([{ status: 'R', van: 'src/core/shared/can.ts', pad: 'src/web/can.ts' }], {
      regels: 0,
      binair: [],
    });
    expect(hernoemd.oordeel).toBe('nee');
    expect(hernoemd.redenen.join('\n')).toMatch(/src\/core\/shared\/can\.ts is een gate-pad/);
    expect(
      oordeel([{ status: 'R', van: 'src/web/oud.ts', pad: 'src/web/nieuw.ts' }], { regels: 0, binair: [] }),
    ).toEqual({ oordeel: 'ja', redenen: [] });
  });

  test('een nieuw leeg bestand: 0 regels, ja', () => {
    expect(parseNumstat('0\t0\tsrc/web/leeg.ts\0')).toEqual({ regels: 0, binair: [] });
    expect(oordeel([{ status: 'A', pad: 'src/web/leeg.ts' }], { regels: 0, binair: [] })).toEqual({
      oordeel: 'ja',
      redenen: [],
    });
  });

  test('numstat telt toegevoegd plus verwijderd; een - is binair, ook bij een hernoeming', () => {
    expect(
      parseNumstat(
        [
          '3\t2\tsrc/web/a.ts',
          '-\t-\tdocs/x.png',
          '-\t-\t',
          'docs/oud.png',
          'docs/nieuw.png',
          '410\t0\tsrc/web/b c.ts',
          '',
        ].join('\u0000'),
      ),
    ).toEqual({ regels: 415, binair: ['docs/x.png', 'docs/nieuw.png'] });
  });

  test('de uitslag van de diff-guard zelf verandert niet door de omvang', () => {
    const basis = { wijzigingen: src, json: {}, reviews: [], auteur: 'x', headSha: HEAD };
    expect(beoordeel({ ...basis, regels: 9999, binair: ['docs/x.png'] }, guardConfig)).toEqual(
      beoordeel(basis, guardConfig),
    );
  });

  test('agentMergeOordeel zonder regels in de invoer geeft nee', () => {
    const uitslag = agentMergeOordeel(
      { wijzigingen: src, json: {}, geraakteJson: [], risico: {} },
      leesMergeConfig(TEKST),
    );
    expect(uitslag.oordeel).toBe('nee');
  });
});

describe('agent-merge-zonder-codex/AC-6 check-docs toetst de vorm van codex en maxRegels', () => {
  const aangepast = (blok: Record<string, unknown>) => {
    const ruw: unknown = JSON.parse(TEKST);
    return JSON.stringify(Object.assign({}, ruw, { agentMerge: zonderLijsten(blok) }));
  };
  const sleutels = (blok: Record<string, unknown>) => agentMergeViolations([], aangepast(blok)).map((v) => v.key);

  test('de echte gates.json is geldig', () => {
    expect(agentMergeViolations([], TEKST)).toEqual([]);
  });

  test('codex "ja" wordt geweigerd', () => {
    expect(sleutels({ ...BLOK, codex: 'ja', maxRegels: 400 })).toContain('docs:agentMerge.codex');
  });

  test.each([
    ['ontbrekend', { ...BLOK, codex: true }],
    ['"400"', { ...BLOK, codex: true, maxRegels: '400' }],
    ['0', { ...BLOK, codex: true, maxRegels: 0 }],
  ])('maxRegels %s wordt geweigerd, ook al leest het script hem dicht', (_naam, blok) => {
    expect(sleutels(blok)).toContain('docs:agentMerge.maxRegels');
  });

  test.each([[true], [false], ['indien-aanwezig']])('codex %j met maxRegels 400 is geldig', (codex) => {
    expect(sleutels({ ...BLOK, codex, maxRegels: 400 })).toEqual([]);
  });
});

describe('agent-merge-zonder-codex/AC-2 numstat op een echte repo', () => {
  test('de git-aanroep uit leesPr telt tekst, ziet een hernoemde binary en een leeg verwijderd bestand', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'numstat-'));
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
        cwd: root,
        encoding: 'utf8',
      });
    git('init', '-q');
    git('config', 'core.fileMode', 'true');
    writeFileSync(path.join(root, 'a.ts'), 'een\ntwee\n');
    writeFileSync(path.join(root, 'leeg.ts'), '');
    writeFileSync(path.join(root, 'modus.ts'), 'x\n');
    writeFileSync(path.join(root, 'oud.bin'), Buffer.from([0, 1, 2, 0, 255]));
    git('add', '-A');
    git('commit', '-qm', 'basis');
    const basis = git('rev-parse', 'HEAD').trim();
    writeFileSync(path.join(root, 'a.ts'), 'een\ndrie\nvier\n');
    rmSync(path.join(root, 'leeg.ts'));
    chmodSync(path.join(root, 'modus.ts'), 0o755);
    renameSync(path.join(root, 'oud.bin'), path.join(root, 'nieuw.bin'));
    git('add', '-A');
    git('commit', '-qm', 'wijziging');
    const head = git('rev-parse', 'HEAD').trim();
    // a.ts: 2 erbij, 1 eraf; leeg.ts en modus.ts: 0 0; de zuiver hernoemde binary: `-`.
    expect(parseNumstat(git(...numstatArgs(basis, head)))).toEqual({ regels: 3, binair: ['nieuw.bin'] });
    rmSync(root, { recursive: true, force: true });
  });
});

describe('agent-merge-zonder-codex/AC-3 agentMergeFouten: één reden per fout', () => {
  test.each([
    ['geldig', { ...BLOK, maxRegels: 400 }, []],
    [
      'toegestaan is tekst',
      { ...BLOK, toegestaan: 'src/**', maxRegels: 400 },
      ['agentMerge ontbreekt of is onleesbaar in .claude/gates.json'],
    ],
    [
      'maxRegels ontbreekt',
      BLOK,
      ['omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge'],
    ],
    [
      'blok ontbreekt',
      undefined,
      [
        'agentMerge ontbreekt of is onleesbaar in .claude/gates.json',
        'omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge',
        'omvang van de PR niet leesbaar of agentMerge.maxBytes ontbreekt: geen agent-merge',
      ],
    ],
  ])('%s', (_naam, blok, verwacht) => {
    const ruw = { agentMerge: blok };
    expect(agentMergeFouten(ruw)).toEqual(verwacht);
    expect(leesAgentMerge(ruw) === null).toBe(verwacht.length > 0);
  });
});
