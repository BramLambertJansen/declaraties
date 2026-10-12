import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// WS-04 punt 4: lokaal vergelijkt scripts/runner.sh de HOST_FILES met de merge-base met origin/main (dus ook gecommitte
// wijzigingen), in CI (CI=true) alleen met HEAD. "Voorbij de guard" is waarneembaar: de docker-stub logt elke aanroep.
const SCRIPT = readFileSync(path.join(import.meta.dirname, '../../scripts/runner.sh'), 'utf8');
const dirs: string[] = [];

const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
}

function commitFile(repo: string, rel: string, text: string) {
  mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  writeFileSync(path.join(repo, rel), text);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', rel);
}

/** Tijdelijke repo met runner.sh, een host-bestand, een docker-stub en (met `remote`) een bare origin/main. */
function makeRepo(remote: boolean) {
  const repo = mkdtempSync(path.join(tmpdir(), 'runner-guard-'));
  const stubs = mkdtempSync(path.join(tmpdir(), 'runner-stubs-'));
  dirs.push(repo, stubs);
  git(repo, 'init', '-q', '-b', 'main');
  commitFile(repo, 'scripts/runner.sh', SCRIPT);
  commitFile(repo, 'scripts/x.sh', 'echo oud\n');
  commitFile(repo, 'package.json', '{}\n');
  writeFileSync(path.join(stubs, 'docker'), '#!/usr/bin/env bash\necho "docker $*" >> "$STUB_DIR/log"\n');
  chmodSync(path.join(stubs, 'docker'), 0o755);
  writeFileSync(path.join(stubs, 'log'), '');
  if (remote) {
    const bare = mkdtempSync(path.join(tmpdir(), 'runner-bare-'));
    dirs.push(bare);
    git(bare, 'init', '-q', '--bare', '-b', 'main');
    git(repo, 'remote', 'add', 'origin', bare);
    git(repo, 'push', '-q', 'origin', 'main');
    git(repo, 'fetch', '-q', 'origin');
  }
  git(repo, 'checkout', '-q', '-b', 'feat/x');
  return { repo, stubs };
}

function run({ repo, stubs }: { repo: string; stubs: string }, env: Record<string, string> = {}, flag?: string) {
  const args = ['scripts/runner.sh', 'ui', ...(flag === undefined ? [] : [flag])];
  const result = spawnSync('bash', args, {
    cwd: repo,
    encoding: 'utf8',
    env: { HOME: stubs, PATH: `${stubs}:/usr/bin:/bin`, STUB_DIR: stubs, ...GIT_ENV, ...env },
  });
  const reachedDocker = readFileSync(path.join(stubs, 'log'), 'utf8').length > 0;
  return { status: result.status, stderr: result.stderr, reachedDocker };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('scripts/runner.sh: HOST_FILES tegen origin/main (lokaal)', () => {
  test('gecommitte wijziging in scripts/ t.o.v. origin/main: exit 1, docker niet bereikt', () => {
    const env = makeRepo(true);
    commitFile(env.repo, 'scripts/x.sh', 'echo nieuw\n');

    const result = run(env);

    expect([result.status, result.reachedDocker]).toStrictEqual([1, false]);
    expect(result.stderr).toContain('scripts/x.sh');
  });

  test('gecommitte wijziging in een ander host-bestand (package.json): exit 1', () => {
    const env = makeRepo(true);
    commitFile(env.repo, 'package.json', '{"x":1}\n');

    expect(run(env).status).toBe(1);
  });

  test('geen origin/main: exit 1 met de melding git fetch origin', () => {
    const env = makeRepo(false);

    const result = run(env);

    expect([result.status, result.reachedDocker]).toStrictEqual([1, false]);
    expect(result.stderr).toContain('git fetch origin');
  });

  // Regressie (slaagt ook op de oude code): niet-gecommitte wijziging blijft geweigerd.
  test('regressie: niet-gecommitte wijziging van een host-bestand: exit 1', () => {
    const env = makeRepo(true);
    writeFileSync(path.join(env.repo, 'scripts/x.sh'), 'echo vuil\n');

    expect(run(env).status).toBe(1);
  });

  // Regressie: schone branch gaat voorbij de guard (op de oude code ook).
  test('regressie: schone branch: voorbij de guard (docker bereikt, exit 0)', () => {
    const env = makeRepo(true);
    commitFile(env.repo, 'src/a.ts', 'export {};\n');

    const result = run(env);

    expect([result.status, result.reachedDocker]).toStrictEqual([0, true]);
  });

  // Regressie: de vergelijking gaat met de merge-base, niet met de punt van origin/main.
  test('regressie: wijziging die alleen op origin/main zit (branch loopt achter): voorbij de guard', () => {
    const env = makeRepo(true);
    git(env.repo, 'checkout', '-q', 'main');
    commitFile(env.repo, 'scripts/x.sh', 'echo van-main\n');
    git(env.repo, 'push', '-q', 'origin', 'main');
    git(env.repo, 'fetch', '-q', 'origin');
    git(env.repo, 'checkout', '-q', 'feat/x');

    expect(run(env).status).toBe(0);
  });

  test('--sta-wijzigingen-toe: gecommitte wijziging gaat voorbij de guard', () => {
    const env = makeRepo(true);
    commitFile(env.repo, 'scripts/x.sh', 'echo nieuw\n');

    const result = run(env, {}, '--sta-wijzigingen-toe');

    expect([result.status, result.reachedDocker]).toStrictEqual([0, true]);
  });
});

describe('scripts/runner.sh: in CI (CI=true) alleen tegen HEAD', () => {
  // Regressie: op de oude code ook door.
  test('regressie: gecommitte wijziging t.o.v. origin/main gaat door', () => {
    const env = makeRepo(true);
    commitFile(env.repo, 'scripts/x.sh', 'echo nieuw\n');

    const result = run(env, { CI: 'true' });

    expect([result.status, result.reachedDocker]).toStrictEqual([0, true]);
  });

  test('regressie: zonder origin (ondiepe checkout) gaat een schone werkmap door', () => {
    const env = makeRepo(false);

    const result = run(env, { CI: 'true' });

    expect([result.status, result.reachedDocker]).toStrictEqual([0, true]);
  });

  test('regressie: niet-gecommitte wijziging blijft ook in CI geweigerd', () => {
    const env = makeRepo(true);
    writeFileSync(path.join(env.repo, 'scripts/x.sh'), 'echo vuil\n');

    expect(run(env, { CI: 'true' }).status).toBe(1);
  });
});
