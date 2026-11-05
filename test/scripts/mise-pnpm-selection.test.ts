import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

// claude-sandbox-werkstraat/AC-1: echte mise-evaluatie, geen eigen imitatie van Tera of shellafleiding.
// CI levert mise 2026.9.18; lokaal draait dezelfde proef met de aanwezige mise-versie.
const miseToml = readFileSync('mise.toml', 'utf8');
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test('mise verwijst shellvrij naar package.json zonder tweede pnpm-versieliteral', () => {
  const selection = /^pnpm\s*=\s*(.*)$/m.exec(miseToml)?.[1];
  expect(selection).toContain('package.json');
  expect(selection).toContain('packageManager');
  expect(selection).not.toMatch(/^['"]+\d|\b\d+\.\d+(?:\.\d+)?\b/);
  expect(selection).not.toMatch(/\b(?:exec|shell|command)\s*\(|\$\(|`/);
});

test.each(['11.28.2', '12.3.4'])('mise selecteert exact %s uit de enige versiebron', (version) => {
  const root = mkdtempSync(path.join(tmpdir(), 'mise-pnpm-selection-'));
  dirs.push(root);
  writeFileSync(path.join(root, 'mise.toml'), miseToml);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ packageManager: `pnpm@${version}` }));
  const result = spawnSync('mise', ['ls', 'pnpm', '--json'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      MISE_TRUSTED_CONFIG_PATHS: root,
      MISE_CONFIG_DIR: path.join(root, 'config'),
      MISE_CACHE_DIR: path.join(root, 'cache'),
      MISE_DATA_DIR: path.join(root, 'data'),
      MISE_OFFLINE: 'true',
    },
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const selected: unknown = JSON.parse(result.stdout);
  expect(selected).toEqual(expect.arrayContaining([expect.objectContaining({ requested_version: version })]));
});
