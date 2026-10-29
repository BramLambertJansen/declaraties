import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { toolchainProbleem } from '../../scripts/kit/toolchain.mjs';
import { afterEach, describe, expect, test } from 'vitest';

// scripts/kit/toolchain.mjs en de voorcontrole in scripts/kit/feiten.mjs: één leesbare regel i.p.v. een stacktrace.
const REPO = path.join(import.meta.dirname, '../..');
const MISE = '[tools]\nnode = "26.11.1"\npnpm = "11"\n';
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('toolchainProbleem', () => {
  test('juiste versie en node_modules aanwezig: null', () => {
    expect(toolchainProbleem({ node: 'v26.11.1', miseToml: MISE, nodeModules: true })).toBeNull();
  });

  test.each(['v26.12.0', 'v26.11.2'])('%s valt binnen de engines-range met node_modules: null', (node) => {
    expect(toolchainProbleem({ node, miseToml: MISE, nodeModules: true })).toBeNull();
  });

  test.each(['v26.10.9', 'v27.0.0'])('%s valt buiten de engines-range: één regel die de versie noemt', (node) => {
    const regel = toolchainProbleem({ node, miseToml: MISE, nodeModules: true });

    expect(regel).not.toBeNull();
    expect(regel).not.toContain('\n');
    expect(regel).toMatch(/^✗ toolchain ontbreekt:/);
    expect(regel).toContain(node);
  });

  test.each([
    {
      naam: 'andere versie',
      node: 'v22.22.0',
      toml: MISE,
      nm: true,
      bevat: ['v22.22.0', '26.11.1'],
      mist: ['node_modules ontbreekt'],
    },
    {
      naam: 'geen node_modules',
      node: 'v26.11.1',
      toml: MISE,
      nm: false,
      bevat: ['node_modules ontbreekt'],
      mist: ['v22.22.0'],
    },
    {
      naam: 'beide',
      node: 'v22.22.0',
      toml: MISE,
      nm: false,
      bevat: ['v22.22.0', '26.11.1', 'node_modules ontbreekt'],
      mist: [],
    },
    {
      naam: 'geen node-regel, wel node_modules',
      node: 'v22.22.0',
      toml: '[tools]\npnpm = "11"\n',
      nm: true,
      bevat: [],
      mist: [],
      nul: true,
    },
    {
      naam: 'geen node-regel, geen node_modules',
      node: 'v22.22.0',
      toml: '[tools]\npnpm = "11"\n',
      nm: false,
      bevat: ['node_modules ontbreekt'],
      mist: ['v22.22.0'],
    },
  ])('$naam', ({ node, toml, nm, bevat, mist, nul }) => {
    const regel = toolchainProbleem({ node, miseToml: toml, nodeModules: nm });

    if (nul) {
      expect(regel).toBeNull();
      return;
    }
    expect(regel).not.toBeNull();
    expect(regel).not.toContain('\n');
    expect(regel).toMatch(/^✗ toolchain ontbreekt:/);
    expect(regel).toContain('bash scripts/cloud-setup.sh');
    expect(regel).toContain('docs/ENVIRONMENT.md');
    for (const tekst of bevat) expect(regel).toContain(tekst);
    for (const tekst of mist) expect(regel).not.toContain(tekst);
  });
});

describe('scripts/kit/feiten.mjs voorcontrole', () => {
  test('zonder node_modules: status 1, leesbare regel op stderr, geen stacktrace', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'feiten-'));
    dirs.push(root);
    const kit = path.join(root, 'scripts/kit');
    mkdirSync(kit, { recursive: true });
    for (const naam of readdirSync(path.join(REPO, 'scripts/kit')))
      if (/^(feiten|toolchain|gates|catalogus)\.mjs$|^catalogus-.*\.ts$/.test(naam))
        copyFileSync(path.join(REPO, 'scripts/kit', naam), path.join(kit, naam));
    copyFileSync(path.join(REPO, 'mise.toml'), path.join(root, 'mise.toml'));

    const r = spawnSync('node', ['scripts/kit/feiten.mjs', 'specs'], { cwd: root, encoding: 'utf8' });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('node_modules ontbreekt');
    expect(r.stdout + r.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(r.stdout + r.stderr).not.toContain('    at ');
  });

  test.each([
    { naam: 'lege map node_modules', bestanden: [] },
    { naam: 'node_modules met alleen .modules.yaml, zonder typescript', bestanden: ['.modules.yaml'] },
    { naam: 'node_modules met typescript maar zonder .modules.yaml', bestanden: ['typescript/package.json'] },
  ])('onvolledige installatie ($naam): status 1, leesbare regel, geen stacktrace', ({ bestanden }) => {
    const root = mkdtempSync(path.join(tmpdir(), 'feiten-'));
    dirs.push(root);
    const kit = path.join(root, 'scripts/kit');
    mkdirSync(kit, { recursive: true });
    for (const naam of readdirSync(path.join(REPO, 'scripts/kit')))
      if (/^(feiten|toolchain|gates|catalogus)\.mjs$|^catalogus-.*\.ts$/.test(naam))
        copyFileSync(path.join(REPO, 'scripts/kit', naam), path.join(kit, naam));
    copyFileSync(path.join(REPO, 'mise.toml'), path.join(root, 'mise.toml'));
    mkdirSync(path.join(root, 'node_modules'));
    for (const naam of bestanden) {
      const doel = path.join(root, 'node_modules', naam);
      mkdirSync(path.dirname(doel), { recursive: true });
      writeFileSync(doel, '{}');
    }

    const r = spawnSync('node', ['scripts/kit/feiten.mjs', 'specs'], { cwd: root, encoding: 'utf8' });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('node_modules ontbreekt of is onvolledig');
    expect(r.stdout + r.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
    expect(r.stdout + r.stderr).not.toContain('    at ');
  });

  test('in de echte repo: status 0 en geen ✗ toolchain', () => {
    expect(existsSync(path.join(REPO, 'node_modules'))).toBe(true);

    const r = spawnSync('node', ['scripts/kit/feiten.mjs', 'specs'], { cwd: REPO, encoding: 'utf8' });

    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).not.toContain('✗ toolchain');
  });
});
