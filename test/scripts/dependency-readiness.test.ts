import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const repo = path.join(import.meta.dirname, '../..');
const workspace = readFileSync(path.join(repo, 'pnpm-workspace.yaml'), 'utf8');
const packageManager: unknown = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8'));
function pinnedManager(manifest: unknown) {
  if (typeof manifest !== 'object' || manifest === null || !('packageManager' in manifest))
    throw new Error('package.json mist packageManager');
  const value = manifest.packageManager;
  if (typeof value !== 'string' || !value.startsWith('pnpm@')) throw new Error('pnpm moet gepind zijn');
  return value;
}
const manager = pinnedManager(packageManager);
const dirs: string[] = [];
const commands = [
  { name: 'run', args: ['run', 'probe'] },
  { name: 'exec', args: ['exec', 'node', 'probe.cjs'] },
];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function pnpm(dir: string, args: string[]) {
  // Geen CI-, verifyDepsBeforeRun- of purge-override: de gekopieerde repo-instelling is de controle.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^(ci|(?:npm|pnpm)_config_(?:verify_deps_before_run|confirm_modules_purge))$/i.test(key),
    ),
  );
  return spawnSync(process.env['npm_execpath'] ?? 'pnpm', args, { cwd: dir, env, encoding: 'utf8', timeout: 20_000 });
}

function manifest(extraDependency = false) {
  return JSON.stringify({
    name: 'dependency-readiness-fixture',
    version: '1.0.0',
    private: true,
    packageManager: manager,
    scripts: { probe: 'node probe.cjs', preinstall: 'node install.cjs' },
    dependencies: { local: 'file:../dependency', ...(extraDependency ? { extra: 'file:../dependency' } : {}) },
  });
}

function fixture() {
  const base = mkdtempSync(path.join(tmpdir(), 'dependency-readiness-'));
  dirs.push(base);
  const dir = path.join(base, 'project');
  const dependency = path.join(base, 'dependency');
  mkdirSync(dir);
  mkdirSync(dependency);
  writeFileSync(path.join(dependency, 'package.json'), JSON.stringify({ name: 'local', version: '1.0.0' }));
  writeFileSync(path.join(dependency, 'payload.txt'), 'lokale dependency blijft behouden\n');
  writeFileSync(path.join(dir, 'package.json'), manifest());
  // De CLI is al gepind: geen versiebeheer/downloads in de fixture. De pakketstore blijft lokaal.
  writeFileSync(
    path.join(dir, 'pnpm-workspace.yaml'),
    workspace + '\nstoreDir: ../store\nmanagePackageManagerVersions: false\n',
  );
  writeFileSync(path.join(dir, 'install.cjs'), "require('node:fs').writeFileSync('install-ran', 'install');\n");
  writeFileSync(
    path.join(dir, 'probe.cjs'),
    "require('node:fs').readFileSync('node_modules/local/payload.txt');\n" +
      "require('node:fs').writeFileSync('probe-ran', 'probe');\n",
  );
  const version = pnpm(dir, ['--version']);
  expect(version.status, version.stderr).toBe(0);
  expect(version.stdout.trim()).toBe(manager.slice('pnpm@'.length));
  const install = pnpm(dir, ['install', '--offline']);
  expect(install.status, install.stdout + install.stderr).toBe(0);
  expect(existsSync(path.join(dir, 'install-ran'))).toBe(true);
  rmSync(path.join(dir, 'install-ran'));
  return dir;
}

function snapshot(dir: string) {
  return Object.fromEntries(
    [
      'package.json',
      'pnpm-workspace.yaml',
      'pnpm-lock.yaml',
      'node_modules/.modules.yaml',
      'node_modules/.pnpm/lock.yaml',
      'node_modules/.pnpm-workspace-state-v1.json',
      'node_modules/local/package.json',
      'node_modules/local/payload.txt',
    ].map((file) => [file, readFileSync(path.join(dir, file))]),
  );
}

function mutate(dir: string, change: string) {
  if (change === 'manifest') writeFileSync(path.join(dir, 'package.json'), manifest(true));
  if (change === 'lockfile') {
    const lock = path.join(dir, 'pnpm-lock.yaml');
    writeFileSync(
      lock,
      readFileSync(lock, 'utf8').replace('specifier: file:../dependency', 'specifier: file:../missing'),
    );
    // Pnpm gebruikt mtimes als snelle ingang; maak de wijziging ook op grove filesystems ondubbelzinnig nieuw.
    const later = new Date(Date.now() + 2_000);
    utimesSync(lock, later, later);
  }
  if (change === 'workspace') {
    const config = path.join(dir, 'pnpm-workspace.yaml');
    writeFileSync(config, readFileSync(config, 'utf8') + '\nnodeLinker: hoisted\n');
  }
  if (change !== 'copy') return dir;
  const copied = path.join(path.dirname(dir), 'copied');
  cpSync(dir, copied, { recursive: true });
  return copied;
}

describe.each(commands)('installatiecontrole vóór pnpm $name', ({ args }) => {
  test('een passende installatie voert het werkcommando uit zonder installatie', () => {
    const dir = fixture();
    const before = snapshot(dir);
    const result = pnpm(dir, args);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(readFileSync(path.join(dir, 'probe-ran'), 'utf8')).toBe('probe');
    expect(existsSync(path.join(dir, 'install-ran'))).toBe(false);
    expect(snapshot(dir)).toEqual(before);
  });

  test.each(['manifest', 'lockfile', 'workspace', 'copy'])(
    '%s: weigert vóór het werkcommando en behoudt de installatie bytegelijk',
    (change) => {
      const dir = mutate(fixture(), change);
      const before = snapshot(dir);
      const result = pnpm(dir, args);
      const output = result.stdout + result.stderr;
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(output).toContain('ERR_PNPM_VERIFY_DEPS_BEFORE_RUN');
      expect(output).toContain('pnpm install');
      expect(output).not.toContain('ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY');
      expect(existsSync(path.join(dir, 'probe-ran'))).toBe(false);
      expect(existsSync(path.join(dir, 'install-ran'))).toBe(false);
      expect(snapshot(dir)).toEqual(before);
    },
  );
});
