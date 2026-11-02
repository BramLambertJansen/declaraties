import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, test } from 'vitest';

// meting-kerncijfers AC-3/AC-4: scripts/kit/leespad.mjs (`pnpm leespad [--json] [--ref <git-ref>]`).
// Vorm: exporteert SCENARIOS (Record<naam, string[]>) en pure leespad(lees, scenarios) met lees(pad) => string | null
// (null = bestaat niet); geeft Record<naam, { bytes: number, ontbreekt: string[] }>. De CLI leest uit process.cwd();
// --json geeft { "scenarios": <hetzelfde> }. main draait alleen als het script direct wordt gestart (niet bij import).
const root = process.cwd();
const script = path.join(root, 'scripts/kit/leespad.mjs');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const NIEUW = [
  'AGENTS.md',
  'CLAUDE.md',
  '.claude/agents/architect.md',
  '.claude/skills/spec/SKILL.md',
  'docs/framework.md',
  'docs/gouden-pad.md',
  'docs/dod.md',
];
const LICHT = ['AGENTS.md', 'CLAUDE.md', '.claude/agents/developer.md'];
const REVIEW = ['.claude/agents/reviewer.md', 'docs/dod.md', 'docs/framework.md'];

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function veld(x: unknown, ...namen: string[]): unknown {
  for (const n of namen) x = isRecord(x) ? x[n] : undefined;
  return x;
}

async function laad(): Promise<Record<string, unknown> | undefined> {
  try {
    const mod: unknown = await import(pathToFileURL(script).href);
    return isRecord(mod) ? mod : undefined;
  } catch {
    return undefined;
  }
}

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
}

function repo(bestanden: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'leespad-'));
  dirs.push(dir);
  git(dir, 'init', '-q');
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(dir, pad)), { recursive: true });
    writeFileSync(path.join(dir, pad), inhoud);
  }
  return dir;
}

function commit(dir: string, bericht: string) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', bericht);
}

// Elk bestand krijgt een eigen lengte (ASCII, dus bytes = tekens).
function vol(): Record<string, string> {
  const alle = new Set([...NIEUW, ...LICHT, ...REVIEW]);
  return Object.fromEntries([...alle].map((p, i) => [p, 'x'.repeat(10 * (i + 1))]));
}

const som = (f: Record<string, string>, ps: string[]) => ps.reduce((n, p) => n + (f[p]?.length ?? 0), 0);

function cli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 5000 });
}

test('meting-kerncijfers AC-3: SCENARIOS bevat de drie vaste leespaden', async () => {
  const mod = await laad();
  const sc = mod?.['SCENARIOS'];
  expect(veld(sc, 'nieuwe-feature')).toEqual(NIEUW);
  expect(veld(sc, 'lichte-fix')).toEqual(LICHT);
  expect(veld(sc, 'review')).toEqual(REVIEW);
});

test('meting-kerncijfers AC-3: leespad(lees, scenarios) somt bytes en meldt ontbrekende bestanden', async () => {
  const mod = await laad();
  const fn = mod?.['leespad'];
  expect(typeof fn).toBe('function');
  if (typeof fn !== 'function') return;
  const inhoud: Record<string, string> = { a: 'abc', b: 'é' }; // é = 2 bytes
  const lees = (p: string) => inhoud[p] ?? null;
  const uit: unknown = Reflect.apply(fn, undefined, [lees, { s1: ['a', 'b'], s2: ['a', 'nee'], s3: [] }]);
  expect(veld(uit, 's1', 'bytes')).toBe(5);
  expect(veld(uit, 's1', 'ontbreekt')).toEqual([]);
  expect(veld(uit, 's2', 'bytes')).toBe(3);
  expect(veld(uit, 's2', 'ontbreekt')).toEqual(['nee']);
  expect(veld(uit, 's3', 'bytes')).toBe(0);
});

test('meting-kerncijfers AC-3: CLI --json uit de werkmap somt per scenario', () => {
  const f = vol();
  const r = cli(repo(f), ['--json']);

  expect(r.status).toBe(0);
  const data: unknown = JSON.parse(r.stdout);
  expect(veld(data, 'scenarios', 'nieuwe-feature', 'bytes')).toBe(som(f, NIEUW));
  expect(veld(data, 'scenarios', 'lichte-fix', 'bytes')).toBe(som(f, LICHT));
  expect(veld(data, 'scenarios', 'review', 'bytes')).toBe(som(f, REVIEW));
  expect(veld(data, 'scenarios', 'review', 'ontbreekt')).toEqual([]);
});

test('meting-kerncijfers AC-3: tekstuitvoer noemt elk scenario met zijn bytes', () => {
  const f = vol();
  const r = cli(repo(f), []);
  expect(r.status).toBe(0);
  for (const naam of ['nieuwe-feature', 'lichte-fix', 'review']) expect(r.stdout).toContain(naam);
  expect(r.stdout).toContain(String(som(f, REVIEW)));
});

test('meting-kerncijfers AC-3: een ontbrekend bestand telt 0 en staat in ontbreekt (geen crash)', () => {
  const f = vol();
  const dir = repo(f);
  rmSync(path.join(dir, 'docs/gouden-pad.md'));

  const r = cli(dir, ['--json']);

  expect(r.status).toBe(0);
  const data: unknown = JSON.parse(r.stdout);
  expect(veld(data, 'scenarios', 'nieuwe-feature', 'bytes')).toBe(
    som(
      f,
      NIEUW.filter((p) => p !== 'docs/gouden-pad.md'),
    ),
  );
  expect(veld(data, 'scenarios', 'nieuwe-feature', 'ontbreekt')).toEqual(['docs/gouden-pad.md']);
});

test('meting-kerncijfers AC-3: --ref leest via git show, niet uit de werkmap', () => {
  const f = vol();
  const dir = repo(f);
  commit(dir, 'basis');
  writeFileSync(path.join(dir, 'AGENTS.md'), 'y'.repeat(9999)); // werkmap wijkt af van HEAD
  rmSync(path.join(dir, 'docs/dod.md')); // en een bestand ontbreekt alleen in de werkmap

  const r = cli(dir, ['--json', '--ref', 'HEAD']);

  expect(r.status).toBe(0);
  const data: unknown = JSON.parse(r.stdout);
  expect(veld(data, 'scenarios', 'lichte-fix', 'bytes')).toBe(som(f, LICHT));
  expect(veld(data, 'scenarios', 'review', 'bytes')).toBe(som(f, REVIEW));
  expect(veld(data, 'scenarios', 'review', 'ontbreekt')).toEqual([]);
});

test('meting-kerncijfers AC-3: een bestand dat bij de ref niet bestaat telt 0 en staat in ontbreekt', () => {
  const f = vol();
  const dir = repo(f);
  commit(dir, 'basis');
  rmSync(path.join(dir, 'docs/dod.md'));
  commit(dir, 'weg');

  const oud = cli(dir, ['--json', '--ref', 'HEAD~1']);
  expect(oud.status).toBe(0);
  expect(veld(JSON.parse(oud.stdout), 'scenarios', 'review', 'ontbreekt')).toEqual([]);

  const nu = cli(dir, ['--json', '--ref', 'HEAD']);
  expect(nu.status).toBe(0);
  const data: unknown = JSON.parse(nu.stdout);
  expect(veld(data, 'scenarios', 'review', 'ontbreekt')).toEqual(['docs/dod.md']);
  expect(veld(data, 'scenarios', 'review', 'bytes')).toBe(som(f, ['.claude/agents/reviewer.md', 'docs/framework.md']));
});

test.each([[['--ref', 'bestaat-niet-xyz']], [['--ref', '--upload-pack=touch pwn']], [['--ref', '-x']], [['--ref=-x']]])(
  'meting-kerncijfers AC-3: ongeldige of met - beginnende ref %j geeft foutmelding en exit 1',
  (args) => {
    const dir = repo(vol());
    commit(dir, 'basis');
    expect(cli(dir, ['--ref', 'HEAD']).status).toBe(0); // het script bestaat en een geldige ref werkt

    const r = cli(dir, args);

    expect(r.status).toBe(1);
    expect(r.stderr.length).toBeGreaterThan(0);
    expect(r.stdout).not.toContain('"scenarios"');
    expect(() => readFileSync(path.join(dir, 'pwn'))).toThrow();
  },
);

test('meting-kerncijfers AC-4: package.json heeft het script leespad', () => {
  const pkg: unknown = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  expect(veld(pkg, 'scripts', 'leespad')).toBe('node scripts/kit/leespad.mjs');
});
