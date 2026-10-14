import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { beoordeel, geraakt, leesConfig, parseNameStatus, samenvatting } from '../../scripts/kit/diff-guard.mjs';

// Diff-guard (framework §10, ADR 0011 punt 9, ADR 0017): een tabeltest per geval tegen de echte .claude/gates.json.
const config = leesConfig(readFileSync('.claude/gates.json', 'utf8'));
const HEAD = 'a'.repeat(40);
const OUD = 'b'.repeat(40);
const BOT = 'template-agent[bot]';
const EIGENAAR = 'BramLambertJansen';

type Wijziging = { status: string; pad: string; van?: string };
type Review = { user: string; state: string; commitId: string; submittedAt: string };

function pr(
  wijzigingen: Wijziging[],
  extra: Partial<{
    labels: string[];
    reviews: Review[];
    auteur: string;
    json: Record<string, { voor: string | null; na: string | null }>;
  }> = {},
) {
  return { wijzigingen, json: {}, labels: [], reviews: [], auteur: BOT, headSha: HEAD, ...extra };
}

function review(state: string, minuut: number, extra: Partial<Review> = {}): Review {
  return {
    user: EIGENAAR,
    state,
    commitId: HEAD,
    submittedAt: `2026-10-10T12:${String(minuut).padStart(2, '0')}:00Z`,
    ...extra,
  };
}

const goedgekeurd = { labels: ['gate-wijziging'], reviews: [review('APPROVED', 1)] };
const core = { status: 'M', pad: 'src/core/shared/can.ts' };

describe('wat de guard raakt', () => {
  test.each([
    { naam: 'gewone code', w: { status: 'M', pad: 'src/web/features/accounts/queries.ts' }, verwacht: [[], []] },
    { naam: 'gate-pad', w: core, verwacht: [['src/core/shared/can.ts'], []] },
    { naam: 'nieuwe test (vrij)', w: { status: 'A', pad: 'src/api/x.test.ts' }, verwacht: [[], []] },
    { naam: 'nieuwe pgTAP-test (vrij)', w: { status: 'A', pad: 'db/tests/x.sql' }, verwacht: [[], []] },
    {
      naam: 'gewijzigde test',
      w: { status: 'M', pad: 'src/api/x.test.ts' },
      verwacht: [['src/api/x.test.ts'], ['src/api/x.test.ts']],
    },
    {
      naam: 'verwijderde test onder test/ (test/** is ook een gate)',
      w: { status: 'D', pad: 'test/x.ts' },
      verwacht: [['test/x.ts'], ['test/x.ts']],
    },
    {
      naam: 'hernoemde test (beide paden)',
      w: { status: 'R', van: 'e2e/a.spec.ts', pad: 'e2e/b.spec.ts' },
      verwacht: [
        ['e2e/a.spec.ts', 'e2e/b.spec.ts'],
        ['e2e/a.spec.ts', 'e2e/b.spec.ts'],
      ],
    },
    {
      naam: 'een gate weg-hernoemen',
      w: { status: 'R', van: 'scripts/kit/gates.mjs', pad: 'src/x.mjs' },
      verwacht: [['scripts/kit/gates.mjs'], []],
    },
  ])('$naam', ({ w, verwacht }) => {
    const g = geraakt(pr([w]), config);

    expect([g.gates, g.tests]).toStrictEqual(verwacht);
  });

  test('package.json: alleen een wijziging in scripts telt', () => {
    const pakket = (scripts: object, deps: object) => JSON.stringify({ scripts, dependencies: deps });
    const wijziging = [{ status: 'M', pad: 'package.json' }];
    const alleenDeps = { 'package.json': { voor: pakket({ a: 'x' }, {}), na: pakket({ a: 'x' }, { b: '1' }) } };
    const scripts = { 'package.json': { voor: pakket({ a: 'x' }, {}), na: pakket({ a: 'y' }, {}) } };
    const kapot = { 'package.json': { voor: pakket({ a: 'x' }, {}), na: '{ kapot' } };

    expect(geraakt(pr(wijziging, { json: alleenDeps }), config).json).toStrictEqual([]);
    expect(geraakt(pr(wijziging, { json: scripts }), config).json).toStrictEqual(['package.json → scripts']);
    expect(geraakt(pr(wijziging, { json: kapot }), config).json).toStrictEqual(['package.json → scripts']);
  });
});

describe('oordeel', () => {
  test.each([
    {
      naam: 'niets geraakt',
      p: pr([{ status: 'M', pad: 'src/web/main.tsx' }]),
      uitslag: 'groen',
      reden: /geen gate-pad/,
    },
    { naam: 'label en goedkeuring op de head', p: pr([core], goedgekeurd), uitslag: 'groen', reden: null },
    { naam: 'zonder label en review', p: pr([core]), uitslag: 'rood', reden: /label gate-wijziging ontbreekt/ },
    {
      naam: 'label zonder review',
      p: pr([core], { labels: ['gate-wijziging'] }),
      uitslag: 'rood',
      reden: /geen goedkeuring/,
    },
    {
      naam: 'review zonder label',
      p: pr([core], { reviews: [review('APPROVED', 1)] }),
      uitslag: 'rood',
      reden: /label gate-wijziging ontbreekt/,
    },
    {
      naam: 'goedkeuring op een oude SHA',
      p: pr([core], { ...goedgekeurd, reviews: [review('APPROVED', 1, { commitId: OUD })] }),
      uitslag: 'rood',
      reden: /geldt voor bbbbbbb, niet voor de head aaaaaaa/,
    },
    {
      naam: 'CHANGES_REQUESTED na APPROVED',
      p: pr([core], { ...goedgekeurd, reviews: [review('APPROVED', 1), review('CHANGES_REQUESTED', 2)] }),
      uitslag: 'rood',
      reden: /is CHANGES_REQUESTED/,
    },
    {
      naam: 'COMMENTED na APPROVED (niet beslissend)',
      p: pr([core], { ...goedgekeurd, reviews: [review('APPROVED', 1), review('COMMENTED', 2)] }),
      uitslag: 'groen',
      reden: null,
    },
    {
      naam: 'DISMISSED na APPROVED',
      p: pr([core], { ...goedgekeurd, reviews: [review('APPROVED', 1), review('DISMISSED', 2)] }),
      uitslag: 'rood',
      reden: /is DISMISSED/,
    },
    {
      naam: 'volgorde op tijd, niet op positie in de lijst',
      p: pr([core], { ...goedgekeurd, reviews: [review('APPROVED', 3), review('CHANGES_REQUESTED', 2)] }),
      uitslag: 'groen',
      reden: null,
    },
    {
      naam: 'goedkeuring door iemand die geen goedkeurder is',
      p: pr([core], { labels: ['gate-wijziging'], reviews: [review('APPROVED', 1, { user: 'iemand' })] }),
      uitslag: 'rood',
      reden: /geen goedkeuring/,
    },
    {
      naam: 'goedkeurder in andere hoofdletters telt',
      p: pr([core], { labels: ['gate-wijziging'], reviews: [review('APPROVED', 1, { user: 'bramlambertjansen' })] }),
      uitslag: 'groen',
      reden: null,
    },
    {
      naam: 'auteur is goedkeurder: overgang (OV-2), ook zonder label',
      p: pr([core], { auteur: EIGENAAR }),
      uitslag: 'overgang',
      reden: /auteur én goedkeurder/,
    },
  ])('$naam → $uitslag', ({ p, uitslag, reden }) => {
    const oordeel = beoordeel(p, config);

    expect(oordeel.uitslag).toBe(uitslag);
    if (reden === null) expect(oordeel.redenen).toStrictEqual([]);
    else expect(oordeel.redenen.join('\n')).toMatch(reden);
  });

  test('de samenvatting noemt de geraakte paden', () => {
    const tekst = samenvatting(beoordeel(pr([core, { status: 'M', pad: 'test/x.ts' }], { auteur: EIGENAAR }), config));

    expect(tekst).toContain('## diff-guard: overgang');
    expect(tekst).toContain('- `src/core/shared/can.ts`');
    expect(tekst).toContain('**Gewijzigde of verwijderde tests**');
  });

  test('de samenvatting bij overgang bevat de uitleg uit ADR 0031 besluit 2; bij groen en rood niet', () => {
    const zin =
      'Overgang (ADR 0017, OV-2): de auteur is zelf goedkeurder. Label `gate-wijziging` en review worden in deze fase niet gevraagd en niet gecontroleerd. Lees de geraakte paden hieronder; de eigenaar merget zelf.';
    const overgang = beoordeel(pr([core], { auteur: EIGENAAR }), config);
    const groen = beoordeel(pr([{ status: 'M', pad: 'README.md' }]), config);
    const rood = beoordeel(pr([core]), config);

    expect([overgang.uitslag, groen.uitslag, rood.uitslag]).toStrictEqual(['overgang', 'groen', 'rood']);
    expect(samenvatting(overgang)).toContain(zin);
    expect(samenvatting(groen)).not.toContain(zin);
    expect(samenvatting(rood)).not.toContain(zin);
  });
});

test('parseNameStatus leest echte git-uitvoer: hernoeming, verwijdering, spatie en regeleinde in een pad', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'diff-guard-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], {
      cwd: root,
      encoding: 'utf8',
    });
  git('init', '-q', '-b', 'main');
  mkdirSync(path.join(root, 'e2e'));
  writeFileSync(path.join(root, 'e2e/a.spec.ts'), 'test("a", () => {});\n'.repeat(5));
  writeFileSync(path.join(root, 'weg.ts'), 'x\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'basis');
  renameSync(path.join(root, 'e2e/a.spec.ts'), path.join(root, 'e2e/b.spec.ts'));
  writeFileSync(path.join(root, 'met spatie\nen regel.ts'), 'y\n');
  git('rm', '-q', 'weg.ts');
  git('add', '-A');
  git('commit', '-q', '-m', 'wijziging');

  const uitvoer = git('diff', '--name-status', '-z', '--find-renames', 'HEAD~1', 'HEAD');

  expect(parseNameStatus(uitvoer)).toStrictEqual([
    { status: 'R', van: 'e2e/a.spec.ts', pad: 'e2e/b.spec.ts' },
    { status: 'A', pad: 'met spatie\nen regel.ts' },
    { status: 'D', pad: 'weg.ts' },
  ]);
});
