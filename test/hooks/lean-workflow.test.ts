import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// Git als nep: een schone werkmap (lege status), en de branch heeft sinds origin/main `committed` gecommit.
function gitRun(committed: string, mergeBase = 0) {
  return (command: string, args: readonly string[]) => {
    const line = [command, ...args].join(' ');
    if (line.startsWith('git status')) return { code: 0, output: '' };
    if (line.startsWith('git merge-base')) return { code: mergeBase, output: 'abc123\n' };
    if (line.startsWith('git diff')) return { code: 0, output: committed };
    return { code: line.includes('tsc') ? 1 : 0, output: `${line}: error TS2322` };
  };
}

test('gecommitte rode code met een schone werkmap: developer krijgt toch feedback', () => {
  const run = gitRun('src/a.ts\ndocs/b.md\n');
  const result = subagentStop(
    { agent_type: 'developer' },
    { run, read: () => null, changed: () => changedFiles(run, () => true) },
  );

  expect(result.stdout).toContain('"decision":"block"');
  expect(result.stdout).toContain('TS2322');
});

test('changedFiles: werkmap en branchdiff ontdubbeld, verwijderde bestanden eruit, zonder origin/main alleen de werkmap', () => {
  const both = (command: string, args: readonly string[]) =>
    args[0] === 'status'
      ? { code: 0, output: '?? src/a.ts\n' }
      : gitRun('src/a.ts\nsrc/weg.ts\nsrc/b.ts\n')(command, args);

  expect(changedFiles(both, (file) => file !== 'src/weg.ts')).toStrictEqual(['src/a.ts', 'src/b.ts']);
  expect(changedFiles(gitRun('src/b.ts\n', 128), () => true)).toStrictEqual([]);
});

test('developer met stop_hook_active: geen tweede ronde (de payload telt)', () => {
  const run = gitRun('src/a.ts\n');
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
