import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

// Leerpunt #396: unit-tests maken tijdelijke mappen onder één per-run hoofdmap (test/setup/tmp-root.ts),
// die de globalSetup na de run opruimt, zodat /tmp niet volloopt.
const RUN_PREFIX = 'vitest-run-';

function runRootOf(dir: string): string | undefined {
  let current = dir;
  while (path.dirname(current) !== current) {
    if (path.basename(current).startsWith(RUN_PREFIX)) return current;
    current = path.dirname(current);
  }
  return undefined;
}

function isCallable(value: unknown): value is () => unknown {
  return typeof value === 'function';
}

async function loadSetup(): Promise<unknown> {
  const specifier = path.join(import.meta.dirname, 'tmp-root.ts');
  try {
    const mod: unknown = await import(/* @vite-ignore */ specifier);
    return typeof mod === 'object' && mod !== null && 'default' in mod ? mod.default : undefined;
  } catch {
    return undefined;
  }
}

test('AC-1: os.tmpdir() ligt in een per-run vitest-run-hoofdmap direct onder de tmpdir van de aanroeper', () => {
  const root = runRootOf(tmpdir());

  expect(root, `tmpdir() = ${tmpdir()}`).toBeDefined();
  if (root === undefined) return;
  expect(existsSync(root)).toBe(true);
  // Direct onder de tmpdir van de aanroeper: geen geneste run-map erboven.
  expect(runRootOf(path.dirname(root))).toBeUndefined();
});

test('AC-2: een kindproces ziet dezelfde per-run hoofdmap als tmpdir', () => {
  const child = spawnSync(process.execPath, ['-e', "console.log(require('node:os').tmpdir())"], {
    env: process.env,
    encoding: 'utf8',
  });

  expect(child.status).toBe(0);
  const childTmp = child.stdout.trim();
  expect(runRootOf(childTmp), `kind-tmpdir = ${childTmp}`).toBeDefined();
  expect(runRootOf(childTmp)).toBe(runRootOf(tmpdir()));
});

test('AC-3: setup maakt één vitest-run-map en teardown verwijdert alleen die', async () => {
  const savedTmpdir = process.env['TMPDIR'];
  const base = mkdtempSync(path.join(tmpdir(), 'tmp-root-test-'));
  const neighbour = path.join(base, 'niet-van-de-setup');
  mkdirSync(neighbour);
  writeFileSync(path.join(neighbour, 'blijft.txt'), 'blijft');

  try {
    process.env['TMPDIR'] = base;
    const setup = await loadSetup();
    expect(setup, 'default export van test/setup/tmp-root.ts').toBeTypeOf('function');
    if (!isCallable(setup)) return;

    const teardown = await setup();
    const runDirs = readdirSync(base).filter((name) => name.startsWith(RUN_PREFIX));
    expect(runDirs).toHaveLength(1);
    const runRoot = path.join(base, runDirs[0] ?? '');
    expect(process.env['TMPDIR']).toBe(runRoot);
    mkdirSync(path.join(runRoot, 'sub', 'dieper'), { recursive: true });

    expect(teardown, 'setup geeft een teardown terug').toBeTypeOf('function');
    if (!isCallable(teardown)) return;
    await teardown();

    expect(existsSync(runRoot)).toBe(false);
    expect(existsSync(path.join(neighbour, 'blijft.txt'))).toBe(true);
    expect(readdirSync(base)).toStrictEqual(['niet-van-de-setup']);
  } finally {
    if (savedTmpdir === undefined) delete process.env['TMPDIR'];
    else process.env['TMPDIR'] = savedTmpdir;
    rmSync(base, { recursive: true, force: true });
  }
});
