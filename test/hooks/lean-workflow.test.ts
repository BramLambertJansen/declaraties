import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { changedFiles, subagentStop } from '../../rails/hooks/lib/werkstraat.mjs';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function developer(changed: string[], failure = '') {
  const calls: string[] = [];
  const result = subagentStop(
    { agent_type: 'developer' },
    {
      changed: () => changed,
      read: () => null,
      run: (command: string, args: readonly string[]) => {
        const line = [command, ...args].join(' ');
        calls.push(line);
        return { code: failure !== '' && line.includes(failure) ? 1 : 0, output: line };
      },
    },
  );
  return { calls, result };
}

test('developer krijgt gerichte feedback zonder een volledige eindgate te herhalen', () => {
  const { result, calls } = developer(['src/a.ts', 'docs/example.md']);
  expect(result).toStrictEqual({});
  expect(calls).toStrictEqual([
    'pnpm exec tsc -b',
    'pnpm exec eslint --max-warnings 0 --no-warn-ignored src/a.ts',
    'pnpm exec vitest related --run --project unit --project web src/a.ts',
  ]);
});

test.each(['tsc', 'eslint', 'vitest'])('developer kan met een rode gerichte %s-controle niet afronden', (failure) => {
  expect(developer(['src/a.ts'], failure).result.stdout).toContain('"decision":"block"');
});

test.each([{ changed: [] }, { changed: ['docs/example.md'] }])(
  'geen codefeedback starten zonder gewijzigde code: $changed',
  ({ changed }) => {
    expect(developer(changed)).toStrictEqual({ calls: [], result: {} });
  },
);

// Git als nep: de werkmap (`status`, porcelain) en wat de branch sinds origin/main heeft gecommit (`diff -z`).
function gitRun(committed: string[], opties: { mergeBase?: number; diff?: number; status?: string } = {}) {
  return (command: string, args: readonly string[]) => {
    const line = [command, ...args].join(' ');
    if (command === 'git' && args.includes('status')) return { code: 0, output: opties.status ?? '' };
    if (line.startsWith('git merge-base')) return { code: opties.mergeBase ?? 0, output: 'abc123\n' };
    if (line.startsWith('git diff'))
      return { code: opties.diff ?? 0, output: committed.map((file) => `${file}\0`).join('') };
    return { code: line.includes('tsc') ? 1 : 0, output: `${line}: error TS2322` };
  };
}

test('gecommitte rode code met een schone werkmap: developer krijgt toch feedback', () => {
  const run = gitRun(['src/a.ts', 'docs/b.md']);
  const result = subagentStop(
    { agent_type: 'developer' },
    { run, read: () => null, changed: () => changedFiles(run, () => true) },
  );

  expect(result.stdout).toContain('"decision":"block"');
  expect(result.stdout).toContain('TS2322');
});

test('changedFiles: werkmap en branchdiff ontdubbeld, verwijderde bestanden eruit, zonder origin/main alleen de werkmap', () => {
  const both = gitRun(['src/a.ts', 'src/weg.ts', 'src/b.ts'], { status: '?? src/a.ts\n' });

  expect(changedFiles(both, (file) => file !== 'src/weg.ts')).toStrictEqual(['src/a.ts', 'src/b.ts']);
  expect(changedFiles(gitRun(['src/b.ts'], { mergeBase: 128 }), () => true)).toStrictEqual([]);
});

test('changedFiles: faalt git diff, dan blijft de werkmap staan', () => {
  const run = gitRun(['src/b.ts'], { diff: 128, status: ' M src/a.ts\n' });

  expect(changedFiles(run, () => true)).toStrictEqual(['src/a.ts']);
});

// Echte git: paden met een spatie en niet-ASCII komen ongeciteerd terug, uit de werkmap én uit de branchdiff.
function realRun(dir: string) {
  return (command: string, args: readonly string[]) => {
    const result = spawnSync(command, [...args], { cwd: dir, encoding: 'utf8' });
    return { code: result.status ?? 1, output: `${result.stdout}${result.stderr}` };
  };
}

test('changedFiles: paden met spatie en niet-ASCII-tekens uit echte git', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lean-paden-'));
  dirs.push(dir);
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], { cwd: dir });
    if (result.status !== 0) throw new Error(String(result.stderr));
  };
  git('init', '-q', '-b', 'main');
  writeFileSync(path.join(dir, 'basis.md'), 'x\n');
  git('add', '.');
  git('commit', '-qm', 'basis');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  writeFileSync(path.join(dir, 'gecommit met spatie é.ts'), 'export {};\n');
  git('add', '.');
  git('commit', '-qm', 'branch');
  writeFileSync(path.join(dir, 'nieuw ü.ts'), 'export {};\n');

  const files = changedFiles(realRun(dir), (file) => existsSync(path.join(dir, file)));

  expect(files.toSorted()).toStrictEqual(['gecommit met spatie é.ts', 'nieuw ü.ts']);
});

test('developer met stop_hook_active: geen tweede ronde (de payload telt)', () => {
  const run = gitRun(['src/a.ts']);
  const deps = { run, read: () => null, changed: () => changedFiles(run, () => true) };

  expect(subagentStop({ agent_type: 'developer', stop_hook_active: true }, deps)).toStrictEqual({});
});

function prePush(status: number) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lean-pre-push-'));
  dirs.push(dir);
  const init = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8' });
  if (init.status !== 0) throw new Error(init.stderr);
  copyFileSync('lefthook.yml', path.join(dir, 'lefthook.yml'));
  const add = spawnSync('git', ['add', 'lefthook.yml'], { cwd: dir, encoding: 'utf8' });
  if (add.status !== 0) throw new Error(add.stderr);
  const commit = spawnSync(
    'git',
    ['-c', 'user.name=test', '-c', 'user.email=test@example.test', 'commit', '-m', 'fixture'],
    {
      cwd: dir,
      encoding: 'utf8',
    },
  );
  if (commit.status !== 0) throw new Error(commit.stderr);
  const calls = path.join(dir, 'calls');
  writeFileSync(calls, '');
  const pnpm = path.join(dir, 'pnpm');
  writeFileSync(pnpm, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS_PATH"\nexit "$GATE_STATUS"\n');
  chmodSync(pnpm, 0o755);
  const result = spawnSync(path.resolve('node_modules/.bin/lefthook'), ['run', 'pre-push', '--no-tty'], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env['PATH'] ?? ''}`,
      CALLS_PATH: calls,
      GATE_STATUS: String(status),
    },
  });
  if (readFileSync(calls, 'utf8') === '') throw new Error(`${result.stdout}${result.stderr}`);
  return { status: result.status, calls: readFileSync(calls, 'utf8').trim().split('\n') };
}

test.each([0, 1])('de echte pre-push-config voert gate:fast eenmaal uit en behoudt uitslag %i', (status) => {
  expect(prePush(status)).toStrictEqual({ status, calls: ['gate:fast'] });
});
