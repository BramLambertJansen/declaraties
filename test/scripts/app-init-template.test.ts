import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { planAppInit } from '../../scripts/kit/app-init.mjs';

const root = path.join(import.meta.dirname, '../..');
const files = [
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'src/shared/app.ts',
  'src/web/index.html',
  '.github/CODEOWNERS',
  '.claude/gates.json',
];
const dirs: string[] = [];
const options = { slug: 'compatibility-app', name: 'Compatibiliteitsapp', owner: 'example/beheer', sha: 'abc1234' };
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, args: string[]) {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

function templateInputs(cwd: string): Record<string, string> {
  const local = Object.fromEntries(files.map((file) => [file, readFileSync(path.join(cwd, file), 'utf8')]));
  if (!local['CHANGELOG.md']?.includes('- Gestart vanaf template ')) return local;
  // Na app:init blijft de echte template-invoer in de gekoppelde Git-geschiedenis, ook in CI (fetch-depth: 0).
  const commits = git(cwd, ['log', 'HEAD', '--full-history', '--format=%H', '--', 'package.json']).split('\n');
  for (const sha of commits) {
    const pkg = git(cwd, ['show', `${sha}:package.json`]);
    if (!pkg.includes('"name": "app-template"')) continue;
    return Object.fromEntries(files.map((file) => [file, git(cwd, ['show', `${sha}:${file}`]) + '\n']));
  }
  throw new Error('Geen template-invoer gevonden: haal de volledige gekoppelde Git-geschiedenis op');
}

function copy(inputs = templateInputs(root)) {
  const dir = mkdtempSync(path.join(tmpdir(), 'app-init-template-'));
  dirs.push(dir);
  for (const [file, text] of Object.entries(inputs)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  return dir;
}

function initialize(dir: string) {
  const plan = planAppInit(dir, options);
  for (const change of plan) writeFileSync(path.join(dir, change.pad), change.inhoud);
  return plan;
}

test('app:init verwerkt alle actuele templatebestanden en bewaart de overige configuratie', () => {
  const inputs = templateInputs(root);
  const dir = copy(inputs);
  const plan = initialize(dir);
  expect(plan.map(({ pad }) => pad).toSorted()).toStrictEqual(files.toSorted());
  expect(readFileSync(path.join(dir, 'package.json'), 'utf8')).toBe(
    inputs['package.json']?.replace('"name": "app-template"', '"name": "compatibility-app"'),
  );
  expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toContain('# Compatibiliteitsapp');
  expect(readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8')).toContain('Gestart vanaf template abc1234');
  const owners = readFileSync(path.join(dir, '.github/CODEOWNERS'), 'utf8');
  expect(owners).not.toContain('@bramlambertjansen');
  expect(owners).toContain('@example/beheer');
  const gates: unknown = JSON.parse(readFileSync(path.join(dir, '.claude/gates.json'), 'utf8'));
  expect(gates).not.toHaveProperty('onderhoud');
  expect(gates).toHaveProperty('gates');
  expect(gates).toHaveProperty('schrijfrecht');
});

test('dezelfde compatibiliteitscontrole blijft bruikbaar nadat deze checkout al een app is geworden', () => {
  const inputs = templateInputs(root);
  const app = copy(inputs);
  git(app, ['init', '-q']);
  git(app, ['add', '.']);
  git(app, ['commit', '-qm', 'chore: template snapshot']);
  initialize(app);
  const recovered = templateInputs(app);
  const second = copy(recovered);
  expect(() => planAppInit(second, options)).not.toThrow();
  expect(recovered).toStrictEqual(inputs);
});

test.each([
  ['README.md', '# App-template', '# Gewijzigde template'],
  ['CHANGELOG.md', '## [Unreleased]', '## Geschiedenis'],
  ['.github/CODEOWNERS', '@bramlambertjansen', '@changed-owner'],
  ['.claude/gates.json', '"onderhoud": {', '"onderhoud":{'],
])('de echte invoercontrole detecteert incompatibele templatewijzigingen in %s', (file, before, after) => {
  const inputs = templateInputs(root);
  const original = inputs[file];
  if (original === undefined || !original.includes(before)) throw new Error(`Mutatie past niet op ${file}`);
  const dir = copy({ ...inputs, [file]: original.replaceAll(before, after) });
  expect(() => planAppInit(dir, options)).toThrow();
});
