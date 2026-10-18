import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// ADR 0029 punt 8, 9 en 18 (stap 7): `voorReview` in .claude/gates.json is een deelverzameling van gates + jsonGates en
// de `Edit(...)`-regels in permissions.ask van .claude/settings.json zijn er exact aan gelijk. CODEOWNERS blijft = gates +
// jsonGates. Sleutels (contract van de developer): `docs:spiegel:voorreview-gates:<pad>` (voorReview-item buiten gates en
// jsonGates), `docs:spiegel:ask:<pad>` (voorReview-item zonder Edit-regel) en `docs:spiegel:voorreview:<pad>` (Edit-regel
// die niet in voorReview staat).

type Opzet = { gates: string[]; voorReview: string[]; ask: string[]; owners?: string[] };

function repo(opzet: Opzet): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-voorreview-'));
  const owners = opzet.owners ?? [...opzet.gates, 'package.json'];
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: {} }),
    '.github/CODEOWNERS': owners.map((entry) => `/${entry.replace(/\/\*\*$/, '/')} @eigenaar`).join('\n') + '\n',
    '.claude/settings.json': JSON.stringify({ permissions: { ask: opzet.ask } }),
    '.claude/gates.json': JSON.stringify({
      gates: opzet.gates,
      voorReview: opzet.voorReview,
      jsonGates: { 'package.json': ['scripts'] },
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

async function keys(root: string): Promise<string[]> {
  return (await docsViolations(root)).map((violation) => violation.key).filter((key) => key.startsWith('docs:spiegel'));
}

const GATES = ['scripts/**', 'docs/adr/**', 'src/core/**'];

test('ask = voorReview, een gate buiten voorReview heeft geen Edit-regel nodig: geen overtredingen', async () => {
  const root = repo({
    gates: GATES,
    voorReview: ['scripts/**', 'package.json'],
    ask: ['Edit(scripts/**)', 'Edit(package.json)'],
  });

  expect(await keys(root)).toStrictEqual([]);
});

test('Bash-ask-regels vallen buiten de spiegel', async () => {
  const root = repo({
    gates: GATES,
    voorReview: ['scripts/**'],
    ask: ['Edit(scripts/**)', 'Bash(pnpm add:*)', 'Bash(sed -i:*)'],
  });

  expect(await keys(root)).toStrictEqual([]);
});

test('een voorReview-item dat niet in gates of jsonGates staat: overtreding', async () => {
  const root = repo({
    gates: GATES,
    voorReview: ['scripts/**', 'deploy/**'],
    ask: ['Edit(scripts/**)', 'Edit(deploy/**)'],
  });

  expect(await keys(root)).toStrictEqual(['docs:spiegel:voorreview-gates:deploy/**']);
});

test('een voorReview-item dat een sleutel van jsonGates is (package.json): toegestaan', async () => {
  const root = repo({ gates: GATES, voorReview: ['package.json'], ask: ['Edit(package.json)'] });

  expect(await keys(root)).toStrictEqual([]);
});

test('een voorReview-item zonder Edit-regel in ask: overtreding', async () => {
  const root = repo({ gates: GATES, voorReview: ['scripts/**', 'package.json'], ask: ['Edit(scripts/**)'] });

  expect(await keys(root)).toStrictEqual(['docs:spiegel:ask:package.json']);
});

test('een Edit-regel in ask die niet in voorReview staat (ook al is het een gate): overtreding', async () => {
  const root = repo({
    gates: GATES,
    voorReview: ['scripts/**'],
    ask: ['Edit(scripts/**)', 'Edit(src/core/**)'],
  });

  expect(await keys(root)).toStrictEqual(['docs:spiegel:voorreview:src/core/**']);
});

test('CODEOWNERS blijft gates + jsonGates: een gate buiten voorReview moet er wel in staan', async () => {
  const root = repo({
    gates: GATES,
    voorReview: ['scripts/**'],
    ask: ['Edit(scripts/**)'],
    owners: ['scripts/**', 'docs/adr/**', 'package.json'],
  });

  expect(await keys(root)).toStrictEqual(['docs:spiegel:codeowners-gates:src/core/**']);
});

// De echte lijst, letterlijk uit de tabel van ADR 0029 punt 8 (rijen "ja"), plus `rails/**` (ADR 0033 punt 1: de hookbroncode).
const VOOR_REVIEW = [
  'AGENTS.md',
  'CLAUDE.md',
  'docs/framework.md',
  'docs/dod.md',
  '.claude/**',
  'scripts/**',
  'rails/**',
  '.github/**',
  'lefthook.yml',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
  '.pnpmfile.cjs',
  'compose*.yaml',
  'db/init/**',
  'db/docker/**',
  'db/test.env',
  'Dockerfile',
  '.dockerignore',
  'mise.toml',
  'vitest.config.ts',
  'playwright.config.ts',
  'vite.config.ts',
  'eslint.config.*',
  '.dependency-cruiser.*',
  'tsconfig*.json',
  '.prettierrc.json',
  '.prettierignore',
  '.kit/**',
  'eslint-suppressions.json',
  'osv-scanner.toml',
  '.betterleaksignore',
  '.env.example',
];

function lees(file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return typeof parsed === 'object' && parsed !== null ? { ...parsed } : {};
}

test('de echte .claude/gates.json: voorReview is precies de lijst uit ADR 0029 punt 8', () => {
  const voorReview = lees('.claude/gates.json')['voorReview'];

  expect(Array.isArray(voorReview) ? voorReview.map(String).sort() : voorReview).toStrictEqual([...VOOR_REVIEW].sort());
});

test.each([
  'src/core/**',
  'docs/roadmap.md',
  'docs/adr/**',
  'docs/specs/**',
  'docs/nieuwe-app.md',
  'src/api/kit.ts',
  'src/api/server.ts',
  'src/api/env.ts',
  'deploy/**',
  'renovate.json',
  '.gitattributes',
  '**/*.test.*',
  '**/*.spec.*',
  'e2e/**',
  'db/tests/**',
  'test/**',
])('de echte voorReview bevat %s niet', (pad) => {
  const voorReview = lees('.claude/gates.json')['voorReview'];

  expect(Array.isArray(voorReview) ? voorReview : null).not.toContain(pad);
});

test.each(['src/api/app.ts', 'src/shared/permissions.ts'])(
  'punt 18: %s staat niet in gates en niet in CODEOWNERS',
  (pad) => {
    const gates = lees('.claude/gates.json')['gates'];

    expect(Array.isArray(gates) ? gates : null).not.toContain(pad);
    expect(readFileSync('.github/CODEOWNERS', 'utf8')).not.toContain(pad);
  },
);

// ADR 0033 punt 4 (contract B4): de Edit-regels in `ask` zijn precies `altijdVragen` (niet meer `voorReview`); zonder altijdVragen
// blijft ask = voorReview (fixtures hierboven). De echte altijdVragen-lijst staat in check-docs-onderhoud.test.ts.
const ALTIJD_VRAGEN = [
  '.github/**',
  '.claude/hooks/**',
  '.claude/settings.json',
  '.claude/gates.json',
  '.claude/decisions.json',
  'package.json',
  'pnpm-lock.yaml',
];

test('de echte repo: de Edit-regels in permissions.ask zijn gelijk aan altijdVragen en de spiegel is schoon', async () => {
  const settings = lees('.claude/settings.json');
  const permissions = settings['permissions'];
  const ask =
    typeof permissions === 'object' && permissions !== null && 'ask' in permissions && Array.isArray(permissions.ask)
      ? permissions.ask.map(String)
      : [];
  const edits = ask.flatMap((regel) => /^Edit\((.+)\)$/.exec(regel)?.[1] ?? []);

  expect([...edits].sort()).toStrictEqual([...ALTIJD_VRAGEN].sort());
  expect(await keys('.')).toStrictEqual([]);
});
