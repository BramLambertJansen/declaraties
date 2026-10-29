import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

const ROOT = path.join(import.meta.dirname, '../..');
const dirs: string[] = [];
type Options = { stack?: boolean; fail?: string; hooks?: boolean; osRelease?: string };

function stub(root: string, name: string, body: string) {
  const file = path.join(root, 'bin', name);
  writeFileSync(file, `#!/usr/bin/env bash\nprintf '%s\\n' '${name}' >> "$STUB_LOG"\n${body}\n`);
  chmodSync(file, 0o755);
}

function fixture(options: Options) {
  const root = mkdtempSync(path.join(tmpdir(), 'doctor-'));
  dirs.push(root);
  for (const folder of ['bin', 'scripts', '.git/hooks']) mkdirSync(path.join(root, folder), { recursive: true });
  for (const file of ['mise.toml', 'package.json', 'scripts/doctor.sh', 'scripts/bootstrap.sh'])
    cpSync(path.join(ROOT, file), path.join(root, file));
  if (options.hooks !== false) {
    writeFileSync(path.join(root, '.git/hooks/pre-commit'), '#!/bin/sh\nlefthook run pre-commit\n');
    chmodSync(path.join(root, '.git/hooks/pre-commit'), 0o755);
  }
  writeFileSync(path.join(root, 'log'), '');
  writeFileSync(path.join(root, 'os-release'), options.osRelease ?? 'NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"\n');
  stub(
    root,
    'mise',
    `
if [[ -n "\${STUB_FAIL:-}" && " $* " == *" $STUB_FAIL "* ]]; then exit 3; fi
if [[ "\${1:-}" != exec || "\${4:-}" != --version && "\${4:-}" != version ]]; then exit 0; fi
tool="$3"
if [[ "$tool" == pnpm ]]; then sed -nE 's/.*"packageManager": "pnpm@([^"]+)".*/\\1/p' package.json
else
  version=$(sed -nE 's/^'"$tool"' = "([^"]+)"/\\1/p' mise.toml)
  [[ "$tool" == node ]] && printf v
  printf '%s\\n' "$version"
fi`,
  );
  stub(root, 'sysctl', '[[ "$*" == *max_user_watches* ]] && echo 524288 || echo 0');
  stub(root, 'timeout', '[[ "$STUB_STACK" == up ]]');
  for (const tool of ['bwrap', 'docker']) stub(root, tool, `[[ "$STUB_FAIL" != ${tool} ]]`);
  for (const tool of ['git', 'gh', 'jq', 'socat']) stub(root, tool, 'true');
  return root;
}

function run(script: string, args: string[], options: Options = {}) {
  const root = fixture(options);
  const result = spawnSync('bash', [path.join(root, 'scripts', script), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      HOME: root,
      PATH: `${root}/bin:/usr/bin:/bin`,
      STUB_LOG: path.join(root, 'log'),
      STUB_STACK: options.stack === true ? 'up' : 'down',
      STUB_FAIL: options.fail ?? '',
      DOCTOR_OS_RELEASE: path.join(root, 'os-release'),
    },
  });
  return { ...result, calls: readFileSync(path.join(root, 'log'), 'utf8').split('\n') };
}

afterEach(() => {
  for (const root of dirs.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('bootstrap en machinecontrole slagen zonder draaiende app', () => {
  for (const [script, args] of [
    ['doctor.sh', ['--machine']],
    ['bootstrap.sh', []],
  ] satisfies [string, string[]][]) {
    const result = run(script, args);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).not.toContain('niet bereikbaar');
    expect(result.calls).not.toContain('timeout');
    expect(result.calls).toContain('docker');
    expect(result.calls).toContain('bwrap');
  }
});

test.each(['node', 'docker', 'bwrap'])('machinecontrole blijft falen op ontbrekende voorwaarde %s', (fail) => {
  const result = run('doctor.sh', ['--machine'], { fail });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('✗');
});

test('ontbrekende git-hooks blijven een installatiefout', () => {
  const result = run('doctor.sh', ['--machine'], { hooks: false });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('git-hooks ontbreken');
});

test('volledige doctor vereist nog steeds alle appdiensten', () => {
  const stopped = run('doctor.sh', []);
  expect(stopped.status).toBe(1);
  for (const service of ['Postgres', 'Mailpit', 'API', 'Web'])
    expect(stopped.stdout).toContain(`${service} niet bereikbaar`);
  expect(run('doctor.sh', [], { stack: true }).status).toBe(0);
});

test('quick behoudt diagnostische exitcode nul en start geen machinechecks', () => {
  const result = run('doctor.sh', ['--quick']);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('niet bereikbaar');
  expect(result.calls).not.toContain('mise');
  expect(result.calls).not.toContain('docker');
});

test('bootstrap stopt bij een mislukte installatie, zonder doctor te starten', () => {
  const result = run('bootstrap.sh', [], { fail: 'install' });
  expect(result.status).toBe(3);
  expect(result.calls).not.toContain('docker');
  expect(result.calls).not.toContain('bwrap');
});

test.each([{ args: ['--onbekend'] }, { args: ['--machine', '--quick'] }])(
  'doctor weigert ongeldige argumenten $args',
  ({ args }) => {
    const result = run('doctor.sh', args);
    expect(result.status).toBe(2);
    expect(result.calls).not.toContain('mise');
  },
);

test.each(['24.04', '26.04'])('machinecontrole accepteert Ubuntu %s', (version) => {
  const result = run('doctor.sh', ['--machine'], { osRelease: `ID=ubuntu\nVERSION_ID="${version}"\n` });
  expect(result.status, result.stdout).toBe(0);
  expect(result.stdout).toContain(`✓ Ubuntu ${version}`);
});

test.each([
  { osRelease: 'ID=ubuntu\nVERSION_ID="22.04"\n', label: "'ubuntu 22.04'" },
  { osRelease: 'ID=debian\nVERSION_ID="13"\n', label: "'debian 13'" },
  { osRelease: '', label: "'onbekend onbekend'" },
])('machinecontrole faalt op een niet-ondersteund besturingssysteem $label', ({ osRelease, label }) => {
  const result = run('doctor.sh', ['--machine'], { osRelease });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain(`✗ besturingssysteem ${label} is niet ondersteund (Ubuntu 24.04 of 26.04)`);
});
