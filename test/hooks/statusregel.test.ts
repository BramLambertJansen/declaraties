import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { poorten, statusregel } from '../../rails/hooks/lib/statusregel.mjs';

// Ontwikkelgemak 7: de statusregel van Claude Code toont branch, achterstand, wijzigingen, de lokale stack en het model.

describe('poorten', () => {
  test('zonder .env.local: de standaardpoorten van scripts/doctor.sh', () => {
    expect(poorten(null)).toStrictEqual([
      { naam: 'Postgres', poort: 54322 },
      { naam: 'Mailpit', poort: 54324 },
      { naam: 'API', poort: 8787 },
      { naam: 'Web', poort: 5173 },
    ]);
  });

  test('uit .env.local: laatste regel wint, ongeldige of ingesprongen regels tellen niet', () => {
    const envLocal = [
      'PG_PORT=6000',
      'API_PORT=9000',
      'API_PORT=9001',
      'WEB_PORT=abc',
      ' MAIL_UI_PORT=7000',
      '# WEB_PORT=1234',
      'WEB_PORT=5173x',
      'MAIL_UI_PORT=7001',
      '',
    ].join('\n');

    expect(poorten(envLocal)).toStrictEqual([
      { naam: 'Postgres', poort: 6000 },
      { naam: 'Mailpit', poort: 7001 },
      { naam: 'API', poort: 9001 },
      { naam: 'Web', poort: 5173 },
    ]);
  });
});

describe('statusregel', () => {
  test('alle delen, in volgorde', () => {
    expect(statusregel({ branch: 'feat/x', achter: 3, gewijzigd: 2, uit: ['API', 'Web'], model: 'Opus' })).toBe(
      'feat/x · 3 achter main · 2 gewijzigd · stack ✗ (API, Web) · Opus',
    );
  });

  test('niets achter, niets gewijzigd, stack draait, geen model', () => {
    expect(statusregel({ branch: 'main', achter: 0, gewijzigd: 0, uit: [] })).toBe('main · stack ✓');
  });

  test('onbekende achterstand valt weg', () => {
    expect(statusregel({ branch: 'feat/y', achter: null, gewijzigd: 1, uit: ['Postgres'], model: 'Sonnet' })).toBe(
      'feat/y · 1 gewijzigd · stack ✗ (Postgres) · Sonnet',
    );
  });
});

// Het echte entry-script: één regel, exit 0, en geen netwerk (git wordt gelogd: nooit een fetch).
const root = process.cwd();
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr);
}

function fixture() {
  const basis = mkdtempSync(path.join(tmpdir(), 'statusregel-'));
  dirs.push(basis);
  const repo = path.join(basis, 'repo');
  spawnSync('git', ['init', '-q', '-b', 'feat/statusregel', repo]);
  writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'a');
  writeFileSync(path.join(repo, 'nieuw.txt'), 'n\n');
  const bin = path.join(basis, 'bin');
  mkdirSync(bin);
  const log = path.join(basis, 'git.log');
  writeFileSync(log, '');
  const echteGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nexec '${echteGit}' "$@"\n`);
  chmodSync(path.join(bin, 'git'), 0o755);
  return { repo, bin, log };
}

function entry(input: string, cwd: string, bin: string) {
  const result = spawnSync(process.execPath, [path.join(root, 'rails/hooks/statusregel.mjs')], {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` },
    timeout: 10_000,
  });
  return { status: result.status, stdout: result.stdout };
}

describe('entry rails/hooks/statusregel.mjs', () => {
  test('één regel met branch, wijzigingen, stackstatus en model; geen fetch', () => {
    const { repo, bin, log } = fixture();
    const result = entry(JSON.stringify({ cwd: repo, model: { display_name: 'Opus' } }), repo, bin);

    expect(result.status).toBe(0);
    const regels = result.stdout.trimEnd().split('\n');
    expect(regels).toHaveLength(1);
    const regel = regels[0] ?? '';
    expect(regel.startsWith('feat/statusregel · ')).toBe(true);
    expect(regel).toContain('1 gewijzigd');
    expect(regel).toMatch(/stack (✓|✗ \(.+\))/);
    expect(regel.endsWith(' · Opus')).toBe(true);
    expect(regel).not.toContain('achter main');
    expect(readFileSync(log, 'utf8')).not.toMatch(/(^|\s)fetch(\s|$)/m);
  });

  test.each(['', 'kapot{'])('kapotte payload (%j): exit 0', (input) => {
    const { repo, bin } = fixture();

    expect(entry(input, repo, bin).status).toBe(0);
  });
});
