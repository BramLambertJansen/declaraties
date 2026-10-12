import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// WS-04 punt 5: een migratie is "gecommit" als hij in de merge-base met origin/main staat (zoals check:migrations),
// niet zodra hij in HEAD staat. Echte tijdelijke repo's met een bare remote, door het echte hook-script beoordeeld.
const hook = path.join(process.cwd(), '.claude/hooks/rolhek.mjs');
const gates = path.join(process.cwd(), '.claude/gates.json');
const MIGRATION = 'db/migrations/20261012000000_x.sql';
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

function commitMigration(dir: string) {
  mkdirSync(path.join(dir, 'db/migrations'), { recursive: true });
  writeFileSync(path.join(dir, MIGRATION), 'create table a();\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'migration');
}

/** Repo met een eerste commit op main; met `remote` staat die ook op origin/main (bare remote). */
function makeRepo(remote: boolean): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'rolhek-mig-'));
  dirs.push(dir);
  git(dir, 'init', '-q', '-b', 'main');
  mkdirSync(path.join(dir, '.claude'));
  cpSync(gates, path.join(dir, '.claude/gates.json'));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  if (remote) {
    const bare = mkdtempSync(path.join(tmpdir(), 'rolhek-bare-'));
    dirs.push(bare);
    git(bare, 'init', '-q', '--bare', '-b', 'main');
    git(dir, 'remote', 'add', 'origin', bare);
    git(dir, 'push', '-q', 'origin', 'main');
    git(dir, 'fetch', '-q', 'origin');
  }
  return dir;
}

function editMigration(dir: string) {
  const payload = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: path.join(dir, MIGRATION), old_string: 'table a', new_string: 'table b' },
    agent_type: 'developer',
    cwd: dir,
  });
  const result = spawnSync('node', [hook], { input: payload, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('rolhek: gecommitte migratie = staat in de merge-base met origin/main', () => {
  test('alleen op de branch gecommit: Edit door de developer is toegestaan', () => {
    const dir = makeRepo(true);
    git(dir, 'checkout', '-q', '-b', 'feat/x');
    commitMigration(dir);

    const result = editMigration(dir);

    expect([result.status, result.output]).toStrictEqual([0, '']);
  });

  // Regressie: slaagt ook op de oude code.
  test('regressie: migratie die op origin/main staat: deny', () => {
    const dir = makeRepo(true);
    commitMigration(dir);
    git(dir, 'push', '-q', 'origin', 'main');
    git(dir, 'fetch', '-q', 'origin');
    git(dir, 'checkout', '-q', '-b', 'feat/x');

    const result = editMigration(dir);

    expect(result.status).toBe(2);
    expect(result.output).toContain('gecommitte migratie');
  });

  test('zonder origin/main: terugval op HEAD (deny) met de melding git fetch origin', () => {
    const dir = makeRepo(false);
    commitMigration(dir);

    const result = editMigration(dir);

    expect(result.status).toBe(2);
    expect(result.output).toContain('git fetch origin');
  });
});
