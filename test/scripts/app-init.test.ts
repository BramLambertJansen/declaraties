import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { AppInitError, planAppInit } from '../../scripts/kit/app-init.mjs';

// pnpm app:init (roadmap stuk 6): de hernoemstap uit docs/nieuwe-app.md op een kopie van de echte bestanden.
const ROOT = path.join(import.meta.dirname, '../..');
const FILES = [
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'src/shared/app.ts',
  'src/web/index.html',
  '.github/CODEOWNERS',
];
const dirs: string[] = [];

function copy(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'app-init-'));
  dirs.push(dir);
  for (const file of FILES) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    cpSync(path.join(ROOT, file), path.join(dir, file));
  }
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const options = { slug: 'urenregistratie', name: 'Urenregistratie', sha: 'abc1234' };

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

  test('haalt de onderhoudsmodus uit .claude/gates.json: die hoort bij de template-repo (ADR 0033 punt 2)', () => {
    const dir = copy();
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    cpSync(path.join(ROOT, '.claude/gates.json'), path.join(dir, '.claude/gates.json'));
    const gates: unknown = JSON.parse(changed(planAppInit(dir, options), '.claude/gates.json'));
    expect(typeof gates === 'object' && gates !== null && 'onderhoud' in gates).toBe(false);
    expect(typeof gates === 'object' && gates !== null && 'altijdVragen' in gates).toBe(true);
  });

  test('weigert luid als de onderhoud-regel in .claude/gates.json niet meer te vinden is', () => {
    const dir = copy();
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    const gates = readFileSync(path.join(ROOT, '.claude/gates.json'), 'utf8').replace(
      '"onderhoud": {',
      '"onderhoud":{',
    );
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
