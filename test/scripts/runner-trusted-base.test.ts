import { spawnSync } from 'node:child_process';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// PR 3 (plan alright-ga-hier-een-bright-dahl): runner.sh vergelijkt met de echte remote-main (git ls-remote), niet met de
// lokale ref origin/main; compose faalt dicht zonder RUNNER_INPUT_DIR; kleine invoerpunten. Zoals runner-guard.test.ts.
const ROOT = path.join(import.meta.dirname, '../..');
const SCRIPT = readFileSync(path.join(ROOT, 'scripts/runner.sh'), 'utf8');
const COMPOSE = readFileSync(path.join(ROOT, 'compose.yaml'), 'utf8');
const OVERRIDE = ['--sta-wijzigingen', 'toe'].join('-');
const dirs: string[] = [];
const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
}

function commitFile(repo: string, rel: string, text: string): void {
  mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  writeFileSync(path.join(repo, rel), text);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', rel);
}

interface Omgeving {
  repo: string;
  stubs: string;
  bare: string;
}

/** Repo met runner.sh en compose.yaml; origin (bare) staat op main = commit A; branch feat/x. */
function maakRepo(): Omgeving {
  const repo = tmp('runner-tb-');
  const stubs = tmp('runner-tb-stubs-');
  const bare = tmp('runner-tb-bare-');
  git(repo, 'init', '-q', '-b', 'main');
  commitFile(repo, 'scripts/runner.sh', SCRIPT);
  commitFile(repo, 'compose.yaml', 'services: {}\n');
  commitFile(repo, 'package.json', '{}\n');
  writeFileSync(path.join(stubs, 'docker'), '#!/usr/bin/env bash\necho "docker $*" >> "$STUB_DIR/log"\n');
  chmodSync(path.join(stubs, 'docker'), 0o755);
  writeFileSync(path.join(stubs, 'log'), '');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  git(repo, 'remote', 'add', 'origin', bare);
  git(repo, 'push', '-q', 'origin', 'main');
  git(repo, 'fetch', '-q', 'origin');
  git(repo, 'checkout', '-q', '-b', 'feat/x');
  return { repo, stubs, bare };
}

function run({ repo, stubs }: Omgeving, flag?: string) {
  const result = spawnSync('bash', ['scripts/runner.sh', 'ui', ...(flag === undefined ? [] : [flag])], {
    cwd: repo,
    encoding: 'utf8',
    // TMPDIR: de sandbox heeft een read-only /tmp.
    env: { HOME: stubs, PATH: `${stubs}:/usr/bin:/bin`, STUB_DIR: stubs, TMPDIR: tmpdir(), ...GIT_ENV },
  });
  const reachedDocker = readFileSync(path.join(stubs, 'log'), 'utf8').length > 0;
  return { status: result.status, stderr: result.stderr, reachedDocker };
}

describe('scripts/runner.sh: vertrouwde basis is de echte remote-main', () => {
  test('lokale origin/main omgebogen naar een commit met gewijzigde compose.yaml: toch geweigerd', () => {
    const omgeving = maakRepo();
    commitFile(omgeving.repo, 'compose.yaml', 'services:\n  evil: {}\n');
    git(omgeving.repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');

    const resultaat = run(omgeving);

    expect([resultaat.status, resultaat.reachedDocker]).toStrictEqual([1, false]);
    expect(resultaat.stderr).toContain('compose.yaml');
  });

  test('remote-main ligt voor en het object ontbreekt lokaal: fout met "git fetch origin main"', () => {
    const omgeving = maakRepo();
    const ander = tmp('runner-tb-clone-');
    git(ander, 'clone', '-q', omgeving.bare, '.');
    commitFile(ander, 'src/nieuw.ts', 'export {};\n');
    git(ander, 'push', '-q', 'origin', 'main');

    const resultaat = run(omgeving);

    expect([resultaat.status, resultaat.reachedDocker]).toStrictEqual([1, false]);
    expect(resultaat.stderr).toContain('git fetch origin main');
  });
});

describe('compose.yaml: dicht falen zonder runner-invoer', () => {
  test('geen RUNNER_INPUT_DIR-verwijzing met een :- default; minstens vijf met :?', () => {
    const verwijzingen = COMPOSE.match(/\$\{RUNNER_INPUT_DIR[^}]*\}/g) ?? [];
    expect(verwijzingen.filter((v) => v.includes(':-'))).toStrictEqual([]);
    expect(verwijzingen.filter((v) => v.includes(':?')).length).toBeGreaterThanOrEqual(5);
  });

  // db/tests bevat in de template tests, dus geen PGTAP_ALLOW_EMPTY-uitzondering: leeg moet altijd falen.
  test('test-pgtap: een lege testmap geeft een niet-nul exitcode', () => {
    const start = COMPOSE.indexOf('set -- /db/tests/*.sql;');
    const einde = COMPOSE.indexOf('fi;', start);
    expect(start).toBeGreaterThan(-1);
    const leeg = tmp('runner-tb-pgtap-');
    const snippet = COMPOSE.slice(start, einde + 3)
      .replaceAll('$$', '$')
      .replaceAll('/db/tests', leeg);

    const result = spawnSync('sh', ['-c', snippet], { encoding: 'utf8' });

    expect(result.status).not.toBe(0);
  });
});

describe('kleine runner-punten', () => {
  test('.gitignore bevat .runner-canary.*', () => {
    const regels = readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
      .split('\n')
      .map((r) => r.trim());
    expect(regels).toContain('.runner-canary.*');
  });

  test('een niet-getrackt invoerbestand met linkcount > 1 wordt geweigerd', () => {
    const omgeving = maakRepo();
    writeFileSync(path.join(omgeving.repo, '.gitignore'), '.runner-output/\n');
    mkdirSync(path.join(omgeving.repo, 'src'));
    writeFileSync(path.join(omgeving.stubs, 'geheim.txt'), 'synthetisch');
    linkSync(path.join(omgeving.stubs, 'geheim.txt'), path.join(omgeving.repo, 'src/link.ts'));

    const resultaat = run(omgeving, OVERRIDE);

    expect([resultaat.status, resultaat.reachedDocker]).toStrictEqual([1, false]);
    expect(resultaat.stderr).toMatch(/hardlink|linkcount/i);
  });
});
