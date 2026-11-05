import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

const root = path.join(import.meta.dirname, '../..');
const script = readFileSync(path.join(root, 'scripts/runner.sh'), 'utf8');
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'runner-inputs-'));
  dirs.push(dir);
  for (const name of ['scripts', 'src', 'test', 'node_modules', 'stubs']) mkdirSync(path.join(dir, name));
  writeFileSync(path.join(dir, 'scripts/runner.sh'), script);
  writeFileSync(path.join(dir, 'package.json'), '{}');
  writeFileSync(path.join(dir, '.gitignore'), '*.private\n.env*\nnode_modules/\n.runner-output/\n');
  writeFileSync(path.join(dir, 'src/main.ts'), 'export const live = true;');
  const git = spawnSync('git', ['init', '-q'], { cwd: dir, encoding: 'utf8' });
  if (git.status !== 0) throw new Error(git.stderr);
  const add = spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' });
  if (add.status !== 0) throw new Error(add.stderr);
  writeFileSync(
    path.join(dir, 'stubs/docker'),
    `#!/bin/bash
if [[ "$*" == *" run --rm --build "* ]]; then
  test -n "$RUNNER_INPUT_DIR" || exit 91
  find "$RUNNER_INPUT_DIR" -type f -printf '%P\\n' | sort > "$STUB_DIR/inputs"
  cat "$RUNNER_INPUT_DIR/src/main.ts" > "$STUB_DIR/source"
  if [[ -f "$RUNNER_INPUT_DIR/.prettierrc.json" ]]; then
    cat "$RUNNER_INPUT_DIR/.prettierrc.json" > "$STUB_DIR/formatting"
  fi
  test -f "$RUNNER_PRIVATE_CANARY" || exit 92
  echo "$RUNNER_INPUT_DIR" > "$STUB_DIR/snapshot"
fi
`,
  );
  chmodSync(path.join(dir, 'stubs/docker'), 0o755);
  return dir;
}

function run(dir: string) {
  // Alleen fixturecode en een Docker-stub: geen echte runneroverride of Docker-aanroep.
  return spawnSync('bash', ['scripts/runner.sh', 'db', '--sta-wijzigingen-toe'], {
    cwd: dir,
    encoding: 'utf8',
    env: { HOME: dir, TMPDIR: tmpdir(), PATH: `${dir}/stubs:/usr/bin:/bin`, STUB_DIR: `${dir}/stubs` },
  });
}

test('runner krijgt actuele broncode en nieuwe tests, geen werkmapgeheimen of Git-metadata', () => {
  const dir = fixture();
  writeFileSync(path.join(dir, 'src/main.ts'), 'export const live = false;');
  writeFileSync(path.join(dir, 'test/new.int.test.ts'), 'new test');
  writeFileSync(path.join(dir, 'src/token.private'), 'synthetic secret');
  writeFileSync(path.join(dir, 'private-notes.md'), 'synthetic private notes');
  const result = run(dir);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  const inputs = readFileSync(path.join(dir, 'stubs/inputs'), 'utf8');
  expect(inputs).toContain('test/new.int.test.ts');
  expect(inputs).not.toMatch(/token\.private|private-notes|\.git\//);
  expect(readFileSync(path.join(dir, 'stubs/source'), 'utf8')).toContain('live = false');
  const snapshot = readFileSync(path.join(dir, 'stubs/snapshot'), 'utf8').trim();
  expect(spawnSync('test', ['-e', snapshot]).status).toBe(1);
});

test.each(['src', 'node_modules', '.runner-output', '.prettierrc.json'])(
  'weigert een symlink als mountbron of bronmap: %s',
  (name) => {
    const dir = fixture();
    rmSync(path.join(dir, name), { recursive: true, force: true });
    symlinkSync(path.join(dir, 'stubs'), path.join(dir, name));
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/symlink|veilig pad/);
  },
);

test('weigert ook een geneste symlink in nieuwe broncode', () => {
  const dir = fixture();
  symlinkSync('/etc', path.join(dir, 'src/escape'));
  const result = run(dir);
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/symlink|veilig pad/);
});

test('weigert ook een symlinkouder met een regeleinde boven een getrackt bestand', () => {
  const dir = fixture();
  const parent = path.join(dir, 'src/escape\nhidden');
  mkdirSync(parent);
  writeFileSync(path.join(parent, 'sensitive.ts'), 'safe baseline');
  const tracked = spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8' });
  if (tracked.status !== 0) throw new Error(tracked.stderr);
  rmSync(parent, { recursive: true });
  writeFileSync(path.join(dir, 'stubs/sensitive.ts'), 'synthetic private source');
  symlinkSync(path.join(dir, 'stubs'), parent);
  // De index blijft het kind bevatten; de genegeerde vervangende symlink staat niet in --others.
  writeFileSync(path.join(dir, '.gitignore'), 'src/escape*\nnode_modules/\n.runner-output/\n');
  const result = run(dir);
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/symlink|veilig pad/);
});

test('compose bindt geen hele werkmap meer aan /repo', () => {
  expect(readFileSync(path.join(root, 'compose.yaml'), 'utf8')).not.toMatch(/-\s+\.:\/repo:ro/);
});

test('projectopmaak voor de schemagenerator gaat mee, persoonlijke formatterconfig niet', () => {
  const dir = fixture();
  const config = JSON.stringify({ singleQuote: true, printWidth: 100 });
  writeFileSync(path.join(dir, '.prettierrc.json'), config);
  writeFileSync(path.join(dir, '.prettierrc.private'), 'synthetic private config');
  writeFileSync(path.join(dir, '.prettierrc.local.json'), 'synthetic local config');
  const result = run(dir);
  expect(result.status).toBe(0);
  const inputs = readFileSync(path.join(dir, 'stubs/inputs'), 'utf8').split('\n');
  expect(inputs).toContain('.prettierrc.json');
  expect(inputs).not.toContain('.prettierrc.private');
  expect(inputs).not.toContain('.prettierrc.local.json');
  expect(readFileSync(path.join(dir, 'stubs/formatting'), 'utf8')).toBe(config);
});
