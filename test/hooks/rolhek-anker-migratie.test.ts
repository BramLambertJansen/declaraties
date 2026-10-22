import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

// ADR 0045: een migratie is ook "gecommit" als hij in de merge-base met het anker staat, niet alleen met de lokale origin/main.
// Een agent kan die ref terugzetten (`git update-ref`); het anker kan hij niet verleggen. Echte tijdelijke repo's.
const hook = path.join(process.cwd(), 'rails/hooks/rolhek.mjs');
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

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

/** Een repo waarin de migratie gecommit is, met een lokale origin/main die er een commit voor staat. Geeft de map en de SHA met migratie. */
function makeRepo(): { dir: string; anker: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'rolhek-anker-'));
  dirs.push(dir);
  git(dir, 'init', '-q', '-b', 'main');
  mkdirSync(path.join(dir, '.claude'));
  cpSync(gates, path.join(dir, '.claude/gates.json'));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  mkdirSync(path.join(dir, 'db/migrations'), { recursive: true });
  writeFileSync(path.join(dir, MIGRATION), 'create table a();\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'migration');
  const anker = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD~1');
  git(dir, 'checkout', '-q', '-b', 'feat/x');
  return { dir, anker };
}

function editMigration(dir: string, env: Record<string, string>) {
  const payload = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: path.join(dir, MIGRATION), old_string: 'table a', new_string: 'table b' },
    agent_type: 'developer',
    cwd: dir,
  });
  const result = spawnSync('node', [hook], {
    input: payload,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV, ...env },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test('zonder anker telt alleen de lokale origin/main: de migratie is niet gecommit, Edit is toegestaan', () => {
  const { dir } = makeRepo();

  expect(editMigration(dir, { RAILS_ANKER: '' }).status).toBe(0);
});

test('met een anker waarin de migratie staat is hij gecommit, ook al is origin/main teruggezet: deny', () => {
  const { dir, anker } = makeRepo();

  const result = editMigration(dir, { RAILS_ANKER: anker });

  expect(result.status).toBe(2);
  expect(result.output).toContain('gecommitte migratie');
});
