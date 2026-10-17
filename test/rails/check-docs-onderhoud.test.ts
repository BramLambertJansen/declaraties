import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// ADR 0033 punt 2 en 4 (contract B4): de Edit-regels in `permissions.ask` van .claude/settings.json zijn precies `altijdVragen`
// (ontbreekt die: precies `voorReview`, zoals voorheen), `altijdVragen` valt binnen `voorReview`, en `onderhoud` heeft precies de
// vorm `{ "repository": "<owner>/<repo>" }`. De sleutels van de meldingen liggen niet vast; de tests zoeken op het pad en op de
// naam van de sleutel (`altijdVragen`, `onderhoud`) in sleutel of tekst van de melding.

interface Opzet {
  gates: string[];
  voorReview: string[];
  ask: string[];
  altijdVragen?: string[];
  onderhoud?: unknown;
}

function repo(opzet: Opzet): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-onderhoud-'));
  const gates: Record<string, unknown> = {
    gates: opzet.gates,
    voorReview: opzet.voorReview,
    jsonGates: { 'package.json': ['scripts'] },
    ...(opzet.altijdVragen === undefined ? {} : { altijdVragen: opzet.altijdVragen }),
    ...('onderhoud' in opzet ? { onderhoud: opzet.onderhoud } : {}),
  };
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: {} }),
    '.github/CODEOWNERS':
      [...opzet.gates, 'package.json'].map((entry) => `/${entry.replace(/\/\*\*$/, '/')} @eigenaar`).join('\n') + '\n',
    '.claude/settings.json': JSON.stringify({ permissions: { ask: opzet.ask } }),
    '.claude/gates.json': JSON.stringify(gates),
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

type Melding = { key: string; message: string };

async function meldingen(root: string): Promise<Melding[]> {
  return (await docsViolations(root)).map(({ key, message }) => ({ key, message }));
}

const noemt = (lijst: Melding[], ...woorden: RegExp[]) =>
  lijst.filter(({ key, message }) => woorden.every((woord) => woord.test(`${key} ${message}`)));
const spiegel = (lijst: Melding[]) => lijst.filter(({ key }) => key.startsWith('docs:spiegel'));

const GATES = ['scripts/**', 'docs/adr/**', '.github/**'];

test('B4: met altijdVragen zijn de Edit-regels in ask precies altijdVragen; voorReview mag breder zijn: geen spiegelmeldingen', async () => {
  const root = repo({
    gates: GATES,
    voorReview: ['scripts/**', '.github/**', 'package.json'],
    altijdVragen: ['.github/**', 'package.json'],
    ask: ['Edit(.github/**)', 'Edit(package.json)', 'Bash(pnpm add *)'],
  });

  expect(spiegel(await meldingen(root))).toStrictEqual([]);
});

test('B4: met altijdVragen is een Edit-regel voor een voorReview-pad buiten altijdVragen een melding', async () => {
  const root = repo({
    gates: GATES,
    voorReview: ['scripts/**', '.github/**'],
    altijdVragen: ['.github/**'],
    ask: ['Edit(.github/**)', 'Edit(scripts/**)'],
  });

  expect(noemt(await meldingen(root), /scripts\/\*\*/, /altijdVragen/)).not.toStrictEqual([]);
});

test('B4: met altijdVragen is een altijdVragen-pad zonder Edit-regel in ask een melding', async () => {
  const root = repo({
    gates: GATES,
    voorReview: ['scripts/**', '.github/**'],
    altijdVragen: ['.github/**', 'scripts/**'],
    ask: ['Edit(.github/**)'],
  });

  expect(noemt(await meldingen(root), /scripts\/\*\*/, /altijdVragen/)).not.toStrictEqual([]);
});

test('B4: altijdVragen valt binnen voorReview: een altijdVragen-pad buiten voorReview is een melding', async () => {
  const root = repo({
    gates: GATES,
    voorReview: ['scripts/**'],
    altijdVragen: ['scripts/**', '.github/**'],
    ask: ['Edit(scripts/**)', 'Edit(.github/**)'],
  });

  expect(noemt(await meldingen(root), /\.github\/\*\*/, /altijdVragen/)).not.toStrictEqual([]);
});

test('B4: altijdVragen valt binnen voorReview ook als een voorReview-glob het pad dekt (.claude/hooks/** onder .claude/**)', async () => {
  const root = repo({
    gates: ['.claude/**', 'scripts/**'],
    voorReview: ['.claude/**', 'scripts/**'],
    altijdVragen: ['.claude/hooks/**'],
    ask: ['Edit(.claude/hooks/**)'],
  });

  expect(noemt(await meldingen(root), /altijdVragen/)).toStrictEqual([]);
  expect(spiegel(await meldingen(root))).toStrictEqual([]);
});

test('B4: altijdVragen binnen voorReview en ask = altijdVragen: geen melding over altijdVragen', async () => {
  const root = repo({
    gates: GATES,
    voorReview: ['scripts/**', '.github/**'],
    altijdVragen: ['.github/**'],
    ask: ['Edit(.github/**)'],
  });

  expect(noemt(await meldingen(root), /altijdVragen/)).toStrictEqual([]);
});

test('B4: zonder altijdVragen blijft ask precies voorReview (zoals voorheen): een voorReview-pad zonder Edit-regel is een melding', async () => {
  const root = repo({ gates: GATES, voorReview: ['scripts/**', '.github/**'], ask: ['Edit(.github/**)'] });

  expect(spiegel(await meldingen(root)).map(({ key }) => key)).toStrictEqual(['docs:spiegel:ask:scripts/**']);
});

test('B4: zonder altijdVragen is ask = voorReview schoon', async () => {
  const root = repo({ gates: GATES, voorReview: ['scripts/**'], ask: ['Edit(scripts/**)'] });

  expect(spiegel(await meldingen(root))).toStrictEqual([]);
});

test('B4: onderhoud met precies { repository: "<owner>/<repo>" } is geldig, ook samen met altijdVragen', async () => {
  const root = repo({
    gates: GATES,
    voorReview: ['scripts/**', '.github/**'],
    altijdVragen: ['.github/**'],
    ask: ['Edit(.github/**)'],
    onderhoud: { repository: 'BramLambertJansen/template' },
  });

  expect(noemt(await meldingen(root), /onderhoud/i)).toStrictEqual([]);
});

test('B4: zonder onderhoud is er geen melding over onderhoud', async () => {
  const root = repo({ gates: GATES, voorReview: ['scripts/**'], ask: ['Edit(scripts/**)'] });

  expect(noemt(await meldingen(root), /onderhoud/i)).toStrictEqual([]);
});

test.each([
  { naam: 'een tekst', onderhoud: 'BramLambertJansen/template' },
  { naam: 'een lijst', onderhoud: ['BramLambertJansen/template'] },
  { naam: 'null', onderhoud: null },
  { naam: 'een leeg object', onderhoud: {} },
  { naam: 'repository geen tekst', onderhoud: { repository: 1 } },
  { naam: 'repository zonder owner', onderhoud: { repository: 'template' } },
  { naam: 'repository met extra segment', onderhoud: { repository: 'a/b/c' } },
  { naam: 'repository met spatie', onderhoud: { repository: 'a b/c' } },
  { naam: 'repository leeg', onderhoud: { repository: '' } },
  { naam: 'extra sleutels', onderhoud: { repository: 'BramLambertJansen/template', extra: true } },
])('B4: onderhoud als $naam is een melding', async ({ onderhoud }) => {
  const root = repo({ gates: GATES, voorReview: ['scripts/**'], ask: ['Edit(scripts/**)'], onderhoud });

  expect(noemt(await meldingen(root), /onderhoud/i)).not.toStrictEqual([]);
});

// ---------- de echte repo ----------

const ECHTE_ALTIJD_VRAGEN = [
  '.github/**',
  '.claude/hooks/**',
  '.claude/settings.json',
  '.claude/gates.json',
  '.claude/decisions.json',
  'package.json',
  'pnpm-lock.yaml',
];

function lees(file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return typeof parsed === 'object' && parsed !== null ? { ...parsed } : {};
}

test('B4: de echte .claude/gates.json: onderhoud.repository is BramLambertJansen/template', () => {
  expect(lees('.claude/gates.json')['onderhoud']).toStrictEqual({ repository: 'BramLambertJansen/template' });
});

test('B4: de echte .claude/gates.json: altijdVragen is precies de lijst uit ADR 0033 punt 3', () => {
  const altijdVragen = lees('.claude/gates.json')['altijdVragen'];

  expect(Array.isArray(altijdVragen) ? altijdVragen.map(String).sort() : altijdVragen).toStrictEqual(
    [...ECHTE_ALTIJD_VRAGEN].sort(),
  );
});

test('B4: de echte altijdVragen valt binnen de echte voorReview', () => {
  const voorReview = lees('.claude/gates.json')['voorReview'];
  const altijdVragen = lees('.claude/gates.json')['altijdVragen'];
  const globs = Array.isArray(voorReview) ? voorReview.map(String) : [];
  // Gedekt: gelijk aan een voorReview-glob, of onder een `<map>/**`-glob (`.claude/hooks/**` valt onder `.claude/**`).
  const gedekt = (pad: string) =>
    globs.some((glob) => glob === pad || (glob.endsWith('/**') && pad.startsWith(glob.slice(0, -2))));

  expect(Array.isArray(altijdVragen) ? altijdVragen.map(String).filter((pad) => !gedekt(pad)) : null).toStrictEqual([]);
});

test('B4: de echte repo: de Edit-regels in permissions.ask zijn precies altijdVragen, en de echte meldingen over onderhoud en spiegel zijn schoon', async () => {
  const permissions = lees('.claude/settings.json')['permissions'];
  const ask =
    typeof permissions === 'object' && permissions !== null && 'ask' in permissions && Array.isArray(permissions.ask)
      ? permissions.ask.map(String)
      : [];
  const edits = ask.flatMap((regel) => /^Edit\((.+)\)$/.exec(regel)?.[1] ?? []);
  const lijst = await meldingen('.');

  expect([...edits].sort()).toStrictEqual([...ECHTE_ALTIJD_VRAGEN].sort());
  expect(spiegel(lijst)).toStrictEqual([]);
  expect(noemt(lijst, /onderhoud|altijdVragen/i)).toStrictEqual([]);
});
