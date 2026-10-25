import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { subagentStop } from '../../rails/hooks/lib/werkstraat.mjs';

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
