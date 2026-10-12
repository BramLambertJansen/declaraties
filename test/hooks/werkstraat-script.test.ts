import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

// Het echte entry-script (.claude/hooks/werkstraat.mjs) via stdin, op de snelle paden (geen gate:fast in gate:fast).
const root = process.cwd();

function run(event: string, input: string, projectDir: string = root) {
  const result = spawnSync('node', [path.join(root, '.claude/hooks/werkstraat.mjs'), event], {
    cwd: root,
    input,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('stop met stop_hook_active: direct door (geen lus)', () => {
  expect(run('stop', JSON.stringify({ stop_hook_active: true }))).toStrictEqual({ status: 0, stdout: '', stderr: '' });
});

test('reviewer zonder rapport: blokkeert via decision block', () => {
  const result = run('subagent-stop', JSON.stringify({ agent_type: 'reviewer', last_assistant_message: 'ok' }));

  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ decision: 'block' });
});

test('stop met kapotte invoer: blokkeert met de fout van de hook zelf', () => {
  const result = run('stop', 'geen json');

  expect(result.stdout).toContain('werkstraat-hook stop');
  expect(JSON.parse(result.stdout)).toMatchObject({ decision: 'block' });
});

test('session-start: de feiten als tekst', () => {
  const result = run('session-start', '{}');

  expect([result.status, result.stdout.includes('Branch: '), result.stdout.includes('## specs')]).toStrictEqual([
    0,
    true,
    true,
  ]);
});

test('.claude/settings.json registreert de vier werkstraat-hooks', () => {
  const settings = readFileSync('.claude/settings.json', 'utf8');

  for (const event of ['post-edit', 'stop', 'subagent-stop', 'session-start'])
    expect(settings).toContain(`.claude/hooks/werkstraat.mjs\\" ${event}`);
  expect(settings).toContain('"matcher": "developer|tester|reviewer"');
});

// Root uit de payload (WS-03): in een worktree werkt de hook op `cwd` uit de payload, niet op CLAUDE_PROJECT_DIR.
function tempRepo(branch: string, gateFast: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'werkstraat-root-'));
  const git = (...args: string[]) =>
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: dir });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'tmp', scripts: { 'gate:fast': gateFast } }));
  git('init', '-b', branch);
  git('add', '.');
  git('commit', '-m', 'init');
  return dir;
}

const FAILS = 'node -e "process.exit(1)"';
const PASSES = 'node -e "process.exit(0)"';

test('subagent-stop developer: draait gate:fast in de git-root van payload.cwd, niet in CLAUDE_PROJECT_DIR', () => {
  const worktree = tempRepo('worktree-branch', FAILS);
  const projectDir = tempRepo('project-branch', PASSES);

  const result = run('subagent-stop', JSON.stringify({ agent_type: 'developer', cwd: worktree }), projectDir);

  expect(result.stdout).toContain('"decision":"block"');
});

test('stop: kijkt naar de gewijzigde bestanden van payload.cwd, niet van CLAUDE_PROJECT_DIR', () => {
  const worktree = tempRepo('worktree-branch', PASSES);
  writeFileSync(path.join(worktree, 'nieuw.ts'), 'export const x: number = "geen getal";\n');
  const projectDir = tempRepo('project-branch', PASSES);

  const result = run('stop', JSON.stringify({ cwd: worktree }), projectDir);

  expect(result.stdout).toContain('"decision":"block"');
});

test('session-start: leest stdin en toont de branch van payload.cwd', () => {
  const worktree = tempRepo('worktree-branch', PASSES);
  const projectDir = tempRepo('project-branch', PASSES);

  const result = run('session-start', JSON.stringify({ cwd: worktree }), projectDir);

  expect(result.stdout).toContain('Branch: worktree-branch');
});

test('session-start: zonder git-repo in payload.cwd geldt CLAUDE_PROJECT_DIR', () => {
  const notRepo = mkdtempSync(path.join(tmpdir(), 'werkstraat-geen-repo-'));
  const projectDir = tempRepo('project-branch', PASSES);

  const result = run('session-start', JSON.stringify({ cwd: notRepo }), projectDir);

  expect(result.stdout).toContain('Branch: project-branch');
});
