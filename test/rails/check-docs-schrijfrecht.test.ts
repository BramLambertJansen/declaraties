import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { docsViolations, globsOverlap } from '../../scripts/kit/check-docs.mjs';

// WS-02: check-docs meldt als `schrijfrecht` van een rol overlapt met `gates` (.claude/gates.json). Uitzonderingen:
// architect → docs/adr/** en tester → testpaden (en developer, die per definitie `**` heeft). Aanname: de overtreding
// heeft een sleutel die "schrijfrecht" bevat, en een bericht met de rolnaam.
const GATES = ['docs/framework.md', 'docs/adr/**', 'scripts/**', 'test/**'];
const OWNERS = '/docs/framework.md @e\n/docs/adr/ @e\n/scripts/ @e\n/test/ @e\n';
const SETTINGS = JSON.stringify({
  permissions: { ask: ['Edit(docs/framework.md)', 'Edit(docs/adr/**)', 'Edit(scripts/**)'] },
});

type GatesJson = { gates: string[]; testpaden: string[]; schrijfrecht: Record<string, string[]> };

function repo(schrijfrecht: Record<string, string[]>): string {
  return repoWith({ gates: GATES, testpaden: ['test/**'], schrijfrecht });
}

function repoWith(gatesJson: GatesJson | string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-schrijfrecht-'));
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: {} }),
    '.github/CODEOWNERS': OWNERS,
    '.claude/settings.json': SETTINGS,
    '.claude/gates.json':
      typeof gatesJson === 'string'
        ? gatesJson
        : JSON.stringify({
            jsonGates: {},
            ...gatesJson,
            schrijfrecht: { reviewer: [], developer: ['**'], ...gatesJson.schrijfrecht },
          }),
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function overlaps(schrijfrecht: Record<string, string[]>) {
  return schrijfrechtOf(repo(schrijfrecht));
}

async function schrijfrechtOf(root: string) {
  return (await docsViolations(root)).filter((violation) => violation.key.includes('schrijfrecht'));
}

test('docs: ["docs/**"] overlapt met gate-paden → schending, met de rol in het bericht', async () => {
  const found = await overlaps({ docs: ['docs/**'] });

  expect(found.length).toBeGreaterThan(0);
  expect(found.every((violation) => violation.message.includes('docs'))).toBe(true);
});

test('de nieuwe expliciete docs-lijst → geen schending', async () => {
  const docs = [
    'docs/reviews/**',
    'docs/operations/**',
    'docs/README.md',
    'docs/gouden-pad.md',
    'README.md',
    'CHANGELOG.md',
  ];

  expect(await overlaps({ docs })).toStrictEqual([]);
});

test('uitzonderingen: architect → docs/adr/** en tester → testpaden geven geen schending', async () => {
  const found = await overlaps({ architect: ['docs/adr/**'], tester: ['test/**'] });

  expect(found).toStrictEqual([]);
});

test('een andere rol op docs/adr/** of de tester op een gate buiten de testpaden → schending', async () => {
  const docsOnAdr = await overlaps({ docs: ['docs/adr/**'] });
  const testerOnScripts = await overlaps({ tester: ['test/**', 'scripts/**'] });

  expect([docsOnAdr.length > 0, testerOnScripts.length > 0]).toStrictEqual([true, true]);
});

// Follow-up punt 2: alleen bestandsnaam-gates (`**/*.test.*`) uit testpaden vallen buiten check 5; map-gates tellen mee.
const REAL_GATES = ['docs/specs/**', 'docs/adr/**', 'scripts/**', '**/*.test.*', '**/*.spec.*', 'e2e/**', 'test/**'];
const REAL_TESTPADEN = ['**/*.test.*', '**/*.spec.*', 'e2e/**', 'test/**'];
const withRealGates = (schrijfrecht: Record<string, string[]>) =>
  schrijfrechtOf(repoWith({ gates: REAL_GATES, testpaden: REAL_TESTPADEN, schrijfrecht }));

test.each([['test/**'], ['e2e/**']])(
  'docs (of een verzonnen rol) met %s → schending (map-gate uit testpaden telt mee)',
  async (glob) => {
    const found = await withRealGates({ docs: [glob], verzonnen: [glob] });

    expect(found.map((violation) => violation.message).join('\n')).toMatch(/docs[\s\S]*verzonnen|verzonnen[\s\S]*docs/);
    expect(found.length).toBeGreaterThanOrEqual(2);
  },
);

test('tester met test/** en e2e/** → geen schending (testpaden-uitzondering)', async () => {
  expect(await withRealGates({ tester: ['test/**', 'e2e/**'] })).toStrictEqual([]);
});

// REGRESSIE (mag al slagen): docs/reviews/** tegen gate **/*.test.* is de reden van de uitzondering.
test('docs met docs/reviews/** tegen gate **/*.test.* → geen schending', async () => {
  expect(await withRealGates({ docs: ['docs/reviews/**'] })).toStrictEqual([]);
});

// DEKKING (mag al slagen).
test('architect met docs/specs/** en docs/adr/** → geen schending', async () => {
  expect(await withRealGates({ architect: ['docs/specs/**', 'docs/adr/**'] })).toStrictEqual([]);
});

test('architect met scripts/** → wel een schending', async () => {
  const found = await withRealGates({ architect: ['docs/specs/**', 'scripts/**'] });

  expect(found.map((violation) => violation.key)).toStrictEqual(['docs:schrijfrecht:architect:scripts/**:scripts/**']);
});

test.each([
  ['docs/**', 'docs/framework.md', true],
  ['*.md', 'docs/x.md', false],
  ['**/*.test.*', 'docs/reviews/**', true],
  ['docs/adr/**', 'docs/specs/**', false],
  ['test/**', 'test/rails/fixtures/**', true],
  ['src/*.ts', 'src/a/b.ts', false],
])('globsOverlap(%s, %s) → %s', (left, right, expected) => {
  expect(globsOverlap(left, right)).toBe(expected);
});

test('de echte .claude/gates.json geeft 0 schrijfrecht-schendingen (regressie)', async () => {
  const found = await schrijfrechtOf(repoWith(readFileSync('.claude/gates.json', 'utf8')));

  expect(found).toStrictEqual([]);
});
