import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { coreFouten } from '../../scripts/kit/check-core.mjs';

const dirs: string[] = [];
const REFS = { base: 'main', head: 'work', template: 'template' };

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function write(root: string, file: string, content: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), content);
}

function commit(root: string, message: string): void {
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', message);
}

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'core-downgrade-'));
  dirs.push(root);
  git(root, 'init', '-q', '-b', 'template');
  write(root, 'src/core/version.ts', 'export const version = 1;\n');
  write(root, 'src/web/app.ts', 'export const app = 1;\n');
  commit(root, 'template v1');
  git(root, 'switch', '-qc', 'old-template');
  write(root, 'old-docs.md', 'Historical documentation.\n');
  commit(root, 'old template documentation');
  git(root, 'switch', '-q', 'template');
  write(root, 'src/core/version.ts', 'export const version = 2;\n');
  commit(root, 'template v2');
  git(root, 'switch', '-qc', 'main');
  write(root, 'src/web/app.ts', 'export const app = 42;\n');
  commit(root, 'app retains installed v2');
  git(root, 'switch', '-q', 'template');
  git(root, 'merge', '-q', '--no-edit', 'old-template');
  git(root, 'switch', '-qc', 'work', 'main');
  return root;
}

test('een oudere vertrouwde template-merge mag de geïnstalleerde core niet terugzetten', () => {
  const root = fixture();
  git(root, 'merge', '-q', '--no-commit', '--no-ff', 'old-template');
  git(root, 'restore', '--source=old-template', '--staged', '--worktree', '--', 'src/core');
  commit(root, 'merge old template with downgraded core');

  expect(readFileSync(path.join(root, 'src/web/app.ts'), 'utf8')).toContain('42');
  expect(coreFouten(root, REFS).some((error) => error.includes('oudere core'))).toBe(true);
});

test('omgedraaide merge-ouders mogen een nieuwere core niet overschrijven', () => {
  const root = fixture();
  git(root, 'switch', '-qc', 'reverse', 'old-template');
  git(root, 'merge', '-q', '--no-edit', '--no-ff', '-s', 'ours', 'main');
  git(root, 'branch', '-f', 'work', 'HEAD');

  expect(coreFouten(root, REFS).some((error) => error.includes('oudere core'))).toBe(true);
});

test('een oude template-merge die de nieuwere core behoudt blijft toegestaan', () => {
  const root = fixture();
  git(root, 'merge', '-q', '--no-edit', 'old-template');

  expect(coreFouten(root, REFS)).toStrictEqual([]);
  expect(readFileSync(path.join(root, 'src/core/version.ts'), 'utf8')).toContain('2');
  expect(readFileSync(path.join(root, 'src/web/app.ts'), 'utf8')).toContain('42');
});

test('een echte nieuwere core-update behoudt app-code en blijft toegestaan', () => {
  const root = fixture();
  git(root, 'switch', '-q', 'template');
  write(root, 'src/core/version.ts', 'export const version = 3;\n');
  commit(root, 'template v3');
  git(root, 'switch', '-q', 'work');
  git(root, 'merge', '-q', '--no-edit', 'template');

  expect(coreFouten(root, REFS)).toStrictEqual([]);
  expect(readFileSync(path.join(root, 'src/core/version.ts'), 'utf8')).toContain('3');
  expect(readFileSync(path.join(root, 'src/web/app.ts'), 'utf8')).toContain('42');
});

test('een update zonder core-wijzigingen blijft toegestaan', () => {
  const root = fixture();
  git(root, 'merge', '-q', '--no-edit', 'template');
  expect(coreFouten(root, REFS)).toStrictEqual([]);
});

test('ook een downgrade van de branch terug naar oudere app-main wordt geweigerd', () => {
  const root = fixture();
  git(root, 'switch', '-q', 'template');
  write(root, 'src/core/version.ts', 'export const version = 3;\n');
  commit(root, 'template v3');
  git(root, 'switch', '-q', 'work');
  git(root, 'merge', '-q', '--no-edit', 'template');
  const newer = git(root, 'rev-parse', 'HEAD');
  const oldTree = git(root, 'rev-parse', 'main^{tree}');
  const merge = git(root, 'commit-tree', oldTree, '-p', newer, '-p', 'main', '-m', 'synthetic main downgrade');
  git(root, 'branch', '-f', 'candidate', merge);

  expect(coreFouten(root, { ...REFS, head: 'candidate' }).some((error) => error.includes('oudere core'))).toBe(true);
});
