import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { AppInitError, planAppInit } from '../../scripts/kit/app-init.mjs';

// pnpm app:init (roadmap stuk 6): vaste template-invoer, ook nadat de checkout zelf al een app geworden is.
const ROOT = path.join(import.meta.dirname, '../..');
const FILES: Readonly<Record<string, string>> = {
  'package.json': '{\n  "name": "app-template",\n  "type": "module"\n}\n',
  'README.md':
    '# App-template\n\nFundering voor apps.\n\n## Nieuwe app starten\n\nSetup.\n\n## Lokaal draaien\n\nStart.\n',
  'CHANGELOG.md': '# Changelog\n\n## [Unreleased]\n\n- Template.\n\n## [0.1.0]\n\n- Basis.\n',
  'src/shared/app.ts': "export const APP_NAME = 'App-template';\n",
  'src/web/index.html': '<!doctype html><html lang="nl"><head><title>App-template</title></head></html>\n',
  '.github/CODEOWNERS': '/AGENTS.md                @bramlambertjansen\n',
};
const TEMPLATE_GATES = '{\n  "onderhoud": { "repository": "BramLambertJansen/template" },\n  "altijdVragen": []\n}\n';
const dirs: string[] = [];

function copy(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'app-init-'));
  dirs.push(dir);
  for (const [file, content] of Object.entries(FILES)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const options = { slug: 'urenregistratie', name: 'Urenregistratie', sha: 'abc1234' };

test('de initialisatietests blijven slagen in een hernoemde app', () => {
  const dir = copy();
  for (const change of planAppInit(dir, options)) writeFileSync(path.join(dir, change.pad), change.inhoud);
  for (const file of ['scripts/kit/app-init.mjs', 'test/scripts/app-init.test.ts']) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    cpSync(path.join(ROOT, file), path.join(dir, file));
  }
  writeFileSync(path.join(dir, 'vitest.config.mjs'), 'export default { test: { maxWorkers: 1 } };\n');
  symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'node_modules/vitest/vitest.mjs'),
      'run',
      'test/scripts/app-init.test.ts',
      '--config',
      'vitest.config.mjs',
      '--testNamePattern',
      '^planAppInit',
    ],
    { cwd: dir, encoding: 'utf8' },
  );
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
});

function changed(plan: { pad: string; inhoud: string }[], file: string): string {
  const found = plan.find((change) => change.pad === file);
  if (found === undefined) throw new Error(`${file} niet in het plan`);
  return found.inhoud;
}

describe('planAppInit', () => {
  test('hernoemt package.json, README, CHANGELOG, app-naam en paginatitel', () => {
    const plan = planAppInit(copy(), options);
    expect(plan.map((change) => change.pad)).toEqual([
      'package.json',
      'README.md',
      'CHANGELOG.md',
      'src/shared/app.ts',
      'src/web/index.html',
    ]);
    expect(JSON.parse(changed(plan, 'package.json'))).toMatchObject({ name: 'urenregistratie' });
    const readme = changed(plan, 'README.md');
    expect(readme.split('\n').slice(0, 3)).toEqual([
      '# Urenregistratie',
      '',
      'Gebouwd op [BramLambertJansen/template](https://github.com/BramLambertJansen/template).',
    ]);
    expect(readme).not.toContain('## Nieuwe app starten');
    expect(readme).toContain('## Lokaal draaien');
    expect(changed(plan, 'CHANGELOG.md')).toMatch(/## \[Unreleased\]\n\n- Gestart vanaf template abc1234\.\n/);
    expect(changed(plan, 'src/shared/app.ts')).toContain("export const APP_NAME = 'Urenregistratie';");
    expect(changed(plan, 'src/web/index.html')).toContain('<title>Urenregistratie</title>');
  });

  test('schrijft niets: alleen een plan', () => {
    const dir = copy();
    planAppInit(dir, options);
    expect(readFileSync(path.join(dir, 'package.json'), 'utf8')).toContain('"name": "app-template"');
  });

  test('haalt de onderhoudsmodus uit .claude/gates.json: die hoort bij de template-repo (ADR 0045 punt 8)', () => {
    const dir = copy();
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    writeFileSync(path.join(dir, '.claude/gates.json'), TEMPLATE_GATES);
    const gates: unknown = JSON.parse(changed(planAppInit(dir, options), '.claude/gates.json'));
    expect(typeof gates === 'object' && gates !== null && 'onderhoud' in gates).toBe(false);
    expect(typeof gates === 'object' && gates !== null && 'altijdVragen' in gates).toBe(true);
  });

  test('weigert luid als de onderhoud-regel in .claude/gates.json niet meer te vinden is', () => {
    const dir = copy();
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    const gates = TEMPLATE_GATES.replace('"onderhoud": {', '"onderhoud":{');
    writeFileSync(path.join(dir, '.claude/gates.json'), gates);
    expect(() => planAppInit(dir, options)).toThrow(/onderhoud-regel/);
  });

  test('--owner mag ook een team zijn', () => {
    const codeowners = changed(planAppInit(copy(), { ...options, owner: 'acme/beheer' }), '.github/CODEOWNERS');
    expect(codeowners).toContain('/AGENTS.md                @acme/beheer');
  });

  test('een README die anders begint, weigert hij in plaats van blind te overschrijven', () => {
    const dir = copy();
    writeFileSync(path.join(dir, 'README.md'), '# App-template\n[![badge](x)](y)\nFundering\n');
    expect(() => planAppInit(dir, options)).toThrow(/README\.md: begint niet met/);
  });

  test('--owner zonder template-handle in CODEOWNERS: fout in plaats van stil niets', () => {
    const dir = copy();
    writeFileSync(path.join(dir, '.github/CODEOWNERS'), '/AGENTS.md @iemand-anders\n');
    expect(() => planAppInit(dir, { ...options, owner: 'acme' })).toThrow(
      /CODEOWNERS: @bramlambertjansen niet gevonden/,
    );
  });

  test('--owner vervangt de handle in CODEOWNERS', () => {
    const codeowners = changed(planAppInit(copy(), { ...options, owner: 'acme-team' }), '.github/CODEOWNERS');
    expect(codeowners).toContain('/AGENTS.md                @acme-team');
    expect(codeowners).not.toContain('@bramlambertjansen');
  });

  test('een naam met een quote breekt app.ts niet', () => {
    const plan = planAppInit(copy(), { ...options, name: "Jan's Uren" });
    expect(changed(plan, 'src/shared/app.ts')).toContain("export const APP_NAME = 'Jan\\'s Uren';");
  });

  test.each([
    ['slug met hoofdletters', { slug: 'Uren' }],
    ['slug met spatie', { slug: 'uren registratie' }],
    ['lege naam', { name: ' ' }],
    ['naam met <', { name: '<b>Uren</b>' }],
    ['geen git-hash', { sha: 'main' }],
    ['ongeldige owner', { owner: 'a b' }],
    ['naam met backslash', { name: 'Uren\\' }],
  ])('weigert: %s', (_case, override) => {
    expect(() => planAppInit(copy(), { ...options, ...override })).toThrow(AppInitError);
  });

  test('draait maar één keer: een hernoemde app weigert', () => {
    const dir = copy();
    writeFileSync(path.join(dir, 'package.json'), changed(planAppInit(dir, options), 'package.json'));
    expect(() => planAppInit(dir, options)).toThrow(/maar één keer/);
  });
});
import { spawnSync } from 'node:child_process';
