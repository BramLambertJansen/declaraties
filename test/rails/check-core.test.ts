import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { coreFouten, isTemplateRepo } from '../../scripts/kit/check-core.mjs';

// check-core (ADR 0008 "Afdwingen"): bewijst dat een app-PR die src/core wijzigt faalt, ook via een merge van een andere
// branch of een eigen wijziging in de merge zelf, en dat een zuivere template-merge en een merge van main groen zijn.
// De branch `tmpl` speelt template/main, `main` de main van de app en `werk` de PR-branch.
const REFS = { base: 'main', head: 'werk', template: 'tmpl' };

function git(root: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd: root,
    stdio: 'ignore',
  });
}

function schrijf(root: string, pad: string, inhoud: string): void {
  mkdirSync(path.dirname(path.join(root, pad)), { recursive: true });
  writeFileSync(path.join(root, pad), inhoud);
}

function commit(root: string, bericht: string): void {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', bericht);
}

function repo(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-core-'));
  git(root, 'init', '-q', '-b', 'tmpl');
  schrijf(root, 'src/core/a.ts', 'export const a = 1;\n');
  schrijf(root, 'src/web/app.ts', 'export const app = 1;\n');
  commit(root, 'template');
  git(root, 'switch', '-q', '-c', 'main');
  git(root, 'switch', '-q', '-c', 'werk');
  return root;
}

// De template schuift door met een core-wijziging.
function templateUpdate(root: string): void {
  git(root, 'switch', '-q', 'tmpl');
  schrijf(root, 'src/core/a.ts', 'export const a = 2;\n');
  commit(root, 'template: core-update');
  git(root, 'switch', '-q', 'werk');
}

test('een app-wijziging buiten src/core is groen', () => {
  const root = repo();
  schrijf(root, 'src/web/app.ts', 'export const app = 2;\n');
  commit(root, 'app');

  expect(coreFouten(root, REFS)).toStrictEqual([]);
});

test('een commit die src/core wijzigt faalt', () => {
  const root = repo();
  schrijf(root, 'src/core/a.ts', 'export const a = 99;\n');
  commit(root, 'core aanpassen');

  const fouten = coreFouten(root, REFS);
  expect(fouten).toHaveLength(1);
  expect(fouten[0]).toContain('wijzigt src/core/ buiten een template-merge');
});

test('een nieuw bestand in src/core faalt ook', () => {
  const root = repo();
  schrijf(root, 'src/core/b.ts', 'export const b = 1;\n');
  commit(root, 'core uitbreiden');

  expect(coreFouten(root, REFS)).toHaveLength(1);
});

test('een zuivere template-merge is groen', () => {
  const root = repo();
  templateUpdate(root);
  // --no-ff: zoals in een app, waar main eigen commits heeft en de merge nooit fast-forward is.
  git(root, 'merge', '-q', '--no-edit', '--no-ff', 'tmpl');

  expect(coreFouten(root, REFS)).toStrictEqual([]);
});

test('een template-merge met een eigen core-wijziging in de merge zelf faalt', () => {
  const root = repo();
  templateUpdate(root);
  git(root, 'merge', '-q', '--no-commit', '--no-ff', 'tmpl');
  schrijf(root, 'src/core/a.ts', 'export const a = 3;\n');
  commit(root, 'merge template met eigen core-wijziging');

  const fouten = coreFouten(root, REFS);
  expect(fouten).toHaveLength(1);
  expect(fouten[0]).toContain('de merge wijzigt src/core/ zelf');
});

test('een template-merge plus een losse core-commit faalt op die commit', () => {
  const root = repo();
  templateUpdate(root);
  git(root, 'merge', '-q', '--no-edit', 'tmpl');
  schrijf(root, 'src/core/a.ts', 'export const a = 4;\n');
  commit(root, 'core na de merge');

  const fouten = coreFouten(root, REFS);
  expect(fouten).toHaveLength(1);
  expect(fouten[0]).toContain('buiten een template-merge');
});

test('een merge van een andere branch die src/core wijzigt faalt', () => {
  const root = repo();
  git(root, 'switch', '-q', '-c', 'ander', 'main');
  schrijf(root, 'src/core/a.ts', 'export const a = 5;\n');
  commit(root, 'core op een andere branch');
  git(root, 'switch', '-q', 'werk');
  schrijf(root, 'src/web/app.ts', 'export const app = 3;\n');
  commit(root, 'app');
  git(root, 'merge', '-q', '--no-edit', 'ander');

  const fouten = coreFouten(root, REFS);
  expect(fouten.some((fout) => fout.includes('niet in template/main of main staat'))).toBe(true);
});

test('een merge van main die een eerdere template-merge meebrengt is groen', () => {
  const root = repo();
  schrijf(root, 'src/web/app.ts', 'export const app = 4;\n');
  commit(root, 'app');
  templateUpdate(root);
  git(root, 'switch', '-q', 'main');
  git(root, 'merge', '-q', '--no-edit', 'tmpl');
  git(root, 'switch', '-q', 'werk');
  git(root, 'merge', '-q', '--no-edit', 'main');

  expect(coreFouten(root, REFS)).toStrictEqual([]);
});

test('een onleesbare template/main faalt dicht', () => {
  const root = repo();

  const fouten = coreFouten(root, { ...REFS, template: 'refs/guard/template' });
  expect(fouten).toHaveLength(1);
  expect(fouten[0]).toContain('niet te lezen');
});

test.each([
  ['{ "onderhoud": { "repository": "Eigenaar/template" } }', 'eigenaar/TEMPLATE', true],
  ['{ "onderhoud": { "repository": "Eigenaar/template" } }', 'eigenaar/meldpunt', false],
  ['{ "gates": [] }', 'eigenaar/template', false],
  ['{ "onderhoud": "Eigenaar/template" }', 'eigenaar/template', false],
])('isTemplateRepo(%s, %s) is %s', (json, repository, verwacht) => {
  expect(isTemplateRepo(json, repository)).toBe(verwacht);
});

test('in deze template staat check-core uit (onderhoud.repository in .claude/gates.json)', () => {
  const gates = readFileSync(path.join(import.meta.dirname, '../../.claude/gates.json'), 'utf8');

  expect(isTemplateRepo(gates, 'BramLambertJansen/template')).toBe(true);
});
