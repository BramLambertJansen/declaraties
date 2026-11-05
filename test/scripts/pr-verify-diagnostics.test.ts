import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const CLI = path.resolve(import.meta.dirname, '../../scripts/kit/pr-verify.mjs');
const BRANCH = 'codex/diagnostics';
const REPOSITORY = 'example/template';
const SKILL = '.claude/skills/diagnostics/SKILL.md';
const CONTENT = 'PRIVATE-FILE-CONTENT-329';
const ROOTS: string[] = [];
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.test',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.test',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

interface Fixture {
  root: string;
  bin: string;
  log: string;
  head: string;
}

function git(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function write(root: string, file: string, content: string) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function stubGh(fixture: Fixture, prHead: string) {
  const pr = {
    number: 329,
    state: 'open',
    merged: false,
    base: { ref: 'main', repo: { full_name: REPOSITORY } },
    head: { repo: { full_name: REPOSITORY }, ref: BRANCH, sha: prHead },
  };
  const checks = {
    check_runs: [
      {
        id: 1,
        name: 'gate:fast',
        head_sha: fixture.head,
        status: 'completed',
        conclusion: 'success',
        app: { id: 15368 },
      },
    ],
  };
  const script = `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const endpoint = process.argv[3] ?? '';
appendFileSync(${JSON.stringify(fixture.log)}, endpoint + '\\n');
if (endpoint === 'repos/${REPOSITORY}/pulls/329') {
  console.log(${JSON.stringify(JSON.stringify(pr))});
} else if (endpoint === 'repos/${REPOSITORY}/commits/${fixture.head}/check-runs?per_page=100&page=1') {
  console.log(${JSON.stringify(JSON.stringify(checks))});
} else {
  process.exitCode = 2;
}
`;
  write(fixture.bin, 'gh', script);
  chmodSync(path.join(fixture.bin, 'gh'), 0o755);
}

function fixture(): Fixture {
  const temp = mkdtempSync(path.join(tmpdir(), 'pr-verify-diagnostics-'));
  ROOTS.push(temp);
  const root = path.join(temp, 'repo');
  mkdirSync(root);
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'remote.origin.url', `https://github.com/${REPOSITORY}.git`]);
  write(root, '.claude/gates.json', JSON.stringify({ werkmapNegeer: ['.claude/launch.json'] }));
  write(root, '.claude/decisions.json', JSON.stringify({ version: 1, requiredChecks: ['gate:fast'], decisions: [] }));
  write(root, SKILL, '# Skill\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-q', '-m', 'test: basis']);
  const head = git(root, ['rev-parse', 'HEAD']);
  git(root, ['update-ref', 'refs/remotes/origin/main', head]);
  git(root, ['switch', '-q', '-c', BRANCH]);
  const result = { root, head, bin: path.join(temp, 'bin'), log: path.join(temp, 'gh.log') };
  writeFileSync(result.log, '');
  stubGh(result, head);
  return result;
}

function run(fixture: Fixture) {
  const result = spawnSync(process.execPath, [CLI, '329'], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV, PATH: `${fixture.bin}:${process.env['PATH'] ?? ''}` },
  });
  expect(result.error).toBeUndefined();
  return {
    status: result.status,
    output: result.stdout + result.stderr,
    requests: readFileSync(fixture.log, 'utf8').trim().split('\n'),
  };
}

function unreadableStatus(fixture: Fixture) {
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const script = `#!${process.execPath}
import { spawnSync } from 'node:child_process';
if (process.argv[2] === 'status') process.exit(128);
const result = spawnSync(${JSON.stringify(realGit)}, process.argv.slice(2), { stdio: 'inherit' });
process.exit(result.status ?? 1);
`;
  write(fixture.bin, 'git', script);
  chmodSync(path.join(fixture.bin, 'git'), 0o755);
}

afterEach(() => {
  for (const root of ROOTS.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('pr:verify CLI: concrete diagnose vóór CI-bewijs', () => {
  test.each([
    { name: 'gewijzigde getrackte skill', file: SKILL },
    { name: 'onbekende ongetrackte MCP-configuratie', file: '.mcp.json' },
  ])('$name noemt het blokkerende pad zonder bestandsinhoud te tonen', ({ file }) => {
    const setup = fixture();
    write(setup.root, file, CONTENT);

    const result = run(setup);

    expect(result.status).toBe(1);
    expect(result.requests).toStrictEqual([`repos/${REPOSITORY}/pulls/329`]);
    expect(result.output).not.toContain(CONTENT);
    expect(result.output).toContain(file);
  });

  test('onleesbare git status meldt expliciet dat de werkmapstatus niet leesbaar is', () => {
    const setup = fixture();
    unreadableStatus(setup);

    const result = run(setup);

    expect(result.status).toBe(1);
    expect(result.requests).toStrictEqual([`repos/${REPOSITORY}/pulls/329`]);
    expect(result.output).toMatch(/status|werkmap/i);
    expect(result.output).toMatch(/onleesbaar|niet.*(?:leesbaar|lezen|gelezen)/i);
  });

  test.each([
    { name: 'een schone werkmap', launch: false },
    { name: 'toegestaan ongetrackt launch.json uit vertrouwde gates', launch: true },
  ])('$name leest groene checks voor de huidige HEAD', ({ launch }) => {
    const setup = fixture();
    if (launch) write(setup.root, '.claude/launch.json', CONTENT);

    const result = run(setup);

    expect(result.status).toBe(0);
    expect(result.output).toContain('gate:fast: success');
    expect(result.output).toContain(setup.head);
    expect(result.output).not.toContain(CONTENT);
    expect(result.requests).toContain(`repos/${REPOSITORY}/commits/${setup.head}/check-runs?per_page=100&page=1`);
  });

  test('een afwijkende PR-head blijft geweigerd zonder checks op te halen', () => {
    const setup = fixture();
    stubGh(setup, 'f'.repeat(40));

    const result = run(setup);

    expect(result.status).toBe(1);
    expect(result.output).toMatch(/PR|commit/);
    expect(result.requests).toStrictEqual([`repos/${REPOSITORY}/pulls/329`]);
    expect(result.output).not.toContain('gate:fast: success');
  });
});
