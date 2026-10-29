import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect } from 'vitest';

const root = process.cwd();
const tijdelijk: string[] = [];

afterEach(() => {
  for (const dir of tijdelijk.splice(0)) rmSync(dir, { recursive: true, force: true });
});

export function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'meting-semantiek-'));
  tijdelijk.push(dir);
  const opslag = path.join(dir, 'metingen');
  const cwd = path.join(dir, 'repo');
  const sentinel = path.join(dir, 'gh-aangeroepen');
  const gh = path.join(dir, 'gh');
  mkdirSync(opslag);
  mkdirSync(path.join(cwd, '.git'), { recursive: true });
  writeFileSync(path.join(cwd, '.git', 'HEAD'), 'ref: refs/heads/feat/een\n');
  writeFileSync(
    gh,
    `#!/usr/bin/env node\nrequire('node:fs').appendFileSync(${JSON.stringify(sentinel)}, 'gh');process.stdout.write('[]');\n`,
  );
  chmodSync(gh, 0o755);
  return { dir, opslag, cwd, gh, sentinel };
}

export type Fixture = ReturnType<typeof fixture>;

export function cli(f: Fixture, args: string[], opslag = f.opslag) {
  return spawnSync(process.execPath, [path.join(root, 'scripts/kit/meting.mjs'), ...args], {
    cwd: f.cwd,
    env: { ...process.env, METING_DIR: opslag, METING_GH: f.gh, METING_GH_TIMEOUT_MS: '1000' },
    encoding: 'utf8',
    timeout: 2500,
  });
}

export function stuur(f: Fixture, event: Record<string, unknown>) {
  const result = spawnSync(process.execPath, [path.join(root, 'rails/hooks/meting.mjs')], {
    input: JSON.stringify({ session_id: 'sessie', cwd: f.cwd, ...event }),
    env: { ...process.env, METING_DIR: f.opslag },
    encoding: 'utf8',
    timeout: 2500,
  });
  expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toStrictEqual({
    status: 0,
    stdout: '',
    stderr: '',
  });
}

export function json(f: Fixture): unknown {
  const result = cli(f, ['--json']);
  expect(result.status).toBe(0);
  const value: unknown = JSON.parse(result.stdout);
  return value;
}

export function log(f: Fixture): string {
  return readFileSync(path.join(f.opslag, 'sessie.jsonl'), 'utf8');
}

export function geenGh(f: Fixture) {
  expect(existsSync(f.sentinel)).toBe(false);
}

export function branch(f: Fixture, naam: string) {
  writeFileSync(path.join(f.cwd, '.git', 'HEAD'), `ref: refs/heads/${naam}\n`);
}

export function veld(value: unknown, ...namen: string[]): unknown {
  for (const naam of namen) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = Object.entries(value).find(([key]) => key === naam)?.[1];
  }
  return value;
}
