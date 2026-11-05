import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { achterstand, achterstandMelding } from '../../scripts/kit/main-achterstand.mjs';

// Ontwikkelgemak 5: pre-push waarschuwt (nooit blokkeren) als de branch achterloopt op origin/main.

const FETCH = ['fetch', '--quiet', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main'];
const REV_LIST = ['rev-list', '--count', 'HEAD..origin/main'];

interface Opties {
  readonly timeout?: number;
  readonly env?: Record<string, string>;
}

function nepGit(antwoord: { fetch?: number; count?: string; countCode?: number }) {
  const calls: { args: string[]; opties: Opties }[] = [];
  const run = (args: readonly string[], opties: Opties = {}) => {
    calls.push({ args: [...args], opties });
    if (args[0] === 'fetch') return { code: antwoord.fetch ?? 0, output: '' };
    if (args[0] === 'rev-list') return { code: antwoord.countCode ?? 0, output: `${antwoord.count ?? '0'}\n` };
    return { code: 1, output: 'onverwacht' };
  };
  return { calls, run };
}

describe('achterstandMelding', () => {
  test.each([0, Number.NaN, Number.POSITIVE_INFINITY])('geen melding bij %d', (n) => {
    expect(achterstandMelding(n)).toBeNull();
  });

  test('één commit: enkelvoud en de merge-aanwijzing', () => {
    const tekst = achterstandMelding(1);

    expect(tekst).toContain('1 commit achter op origin/main');
    expect(tekst).not.toContain('1 commits');
    expect(tekst).toContain('git merge origin/main');
  });

  test('meer commits: meervoud', () => {
    const tekst = achterstandMelding(5);

    expect(tekst).toContain('5 commits achter op origin/main');
    expect(tekst).toContain('git merge origin/main');
  });
});

describe('achterstand', () => {
  test('haalt eerst origin/main op (harde timeout, geen prompt) en telt dan de achterstand', () => {
    const { calls, run } = nepGit({ count: '3' });
    const tekst = achterstand(run);

    expect(calls.map((call) => call.args)).toStrictEqual([FETCH, REV_LIST]);
    const fetch = calls[0]?.opties;
    expect(fetch?.timeout).toBeGreaterThan(0);
    expect(fetch?.timeout).toBeLessThanOrEqual(10_000);
    expect(fetch?.env?.['GIT_TERMINAL_PROMPT']).toBe('0');
    expect(tekst).toBe(achterstandMelding(3));
    expect(tekst).toContain('3 commits achter op origin/main');
  });

  test('geen achterstand: null', () => {
    expect(achterstand(nepGit({ count: '0' }).run)).toBeNull();
  });

  test('rev-list faalt (geen origin/main): null', () => {
    expect(achterstand(nepGit({ count: 'fatal', countCode: 128 }).run)).toBeNull();
  });

  test('mislukte fetch: melding op basis van de laatste fetch', () => {
    expect(achterstand(nepGit({ fetch: 1, count: '2' }).run)).toContain('2 commits achter op origin/main');
  });

  test('mislukte fetch zonder achterstand: null', () => {
    expect(achterstand(nepGit({ fetch: 128, count: '0' }).run)).toBeNull();
  });
});

// Het echte script tegen echte git: een lokale "origin" die verder is dan de clone.
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

function commit(cwd: string, naam: string) {
  writeFileSync(path.join(cwd, naam), `${naam}\n`);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', naam);
}

function script(cwd: string) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/kit/main-achterstand.mjs')], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: 20_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('script scripts/kit/main-achterstand.mjs', () => {
  test('achter op origin/main: waarschuwing op stderr, exit 0', () => {
    const basis = mkdtempSync(path.join(tmpdir(), 'achterstand-'));
    dirs.push(basis);
    const origin = path.join(basis, 'origin');
    const clone = path.join(basis, 'clone');
    spawnSync('git', ['init', '-q', '-b', 'main', origin]);
    commit(origin, 'a');
    git(basis, 'clone', '-q', origin, clone);
    git(clone, 'switch', '-qc', 'feat/x');
    commit(origin, 'b');
    commit(origin, 'c');

    const result = script(clone);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('⚠ ');
    expect(result.stderr).toContain('2 commits achter op origin/main');
  });

  test('zonder origin: geen melding, exit 0', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'achterstand-'));
    dirs.push(dir);
    spawnSync('git', ['init', '-q', '-b', 'main', dir]);
    commit(dir, 'a');

    expect(script(dir)).toStrictEqual({ status: 0, stdout: '', stderr: '' });
  });
});
