import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { toolchainProbleemIn } from '../../scripts/kit/toolchain.mjs';

// claude-sandbox-werkstraat/AC-2 (fixturedeel): de synchrone preflight controleert de gevonden CLI en exacte pin.
// Alleen de externe pnpm-CLI is een fixture; geen API/database of private helper wordt vervangen.
// Nieuwe shells en echte Git-hooks na setup vergen afzonderlijk native bewijs in de PR.
const dirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(manager: unknown = 'pnpm@11.28.2') {
  const root = mkdtempSync(path.join(tmpdir(), 'toolchain-pnpm-'));
  dirs.push(root);
  mkdirSync(path.join(root, 'bin'));
  mkdirSync(path.join(root, 'node_modules/typescript'), { recursive: true });
  writeFileSync(path.join(root, 'node_modules/.modules.yaml'), 'layoutVersion: 5\n');
  writeFileSync(path.join(root, 'node_modules/typescript/package.json'), '{}\n');
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ packageManager: manager }));
  writeFileSync(path.join(root, 'mise.toml'), '[tools]\nnode = "26.11.1"\n');
  // Een ontbrekende CLI mag niet terugvallen op de pnpm waarmee Vitest zelf gestart is.
  vi.stubEnv('PATH', path.join(root, 'bin'));
  return root;
}

function cli(root: string, body: string) {
  const file = path.join(root, 'bin/pnpm');
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
}

function expectDiagnosis(root: string, versions: string[]) {
  const result = toolchainProbleemIn(root);
  expect(result).not.toBeNull();
  expect(result).toMatch(/^✗ toolchain ontbreekt:/);
  expect(result).not.toContain('\n');
  expect(result).toContain('pnpm');
  expect(result).toContain('scripts/cloud-setup.sh');
  expect(result).toContain('docs/ENVIRONMENT.md');
  for (const version of versions) expect(result).toContain(version);
}

test.each(['11.28.2', '12.3.4'])('exacte CLI %s bij dezelfde packageManager-pin: door', (version) => {
  const root = fixture(`pnpm@${version}`);
  cli(root, `printf '%s\\n' '${version}'`);
  expect(toolchainProbleemIn(root)).toBeNull();
});

test('verkeerde CLI met exit 0: diagnose noemt verwacht en aangetroffen', () => {
  const root = fixture();
  cli(root, "printf '%s\\n' '11.28.5'");
  expectDiagnosis(root, ['11.28.2', '11.28.5']);
});

test('SQLite-waarschuwing gevolgd door verkeerde CLI en exit 0: geen schijnsucces', () => {
  const root = fixture();
  cli(root, "printf '%s\\n' 'WARN Failed to update SQLite cache: readonly database' >&2\nprintf '%s\\n' '11.28.5'");
  expectDiagnosis(root, ['11.28.2', '11.28.5']);
});

test('CLI ontbreekt ondanks aanwezige installatiemerkers: stoppen met setupdiagnose', () => {
  expectDiagnosis(fixture(), ['11.28.2']);
});

test('CLI print de juiste versie maar faalt: geen succes op alleen stdout', () => {
  const root = fixture();
  cli(root, "printf '%s\\n' '11.28.2'\nexit 7");
  expectDiagnosis(root, ['11.28.2']);
});

test.each(['', 'pnpm@11', 'pnpm@^11.28.2', 'pnpm@11.28.2junk', 'pnpm@v11.28.2', 'yarn@11.28.2', null, 11])(
  'ongeldige packageManager %j wordt gesloten geweigerd',
  (manager) => {
    const root = fixture(manager);
    cli(root, "printf '%s\\n' '11.28.2'");
    expectDiagnosis(root, ['packageManager']);
  },
);

test('ontbrekende packageManager wordt gesloten geweigerd', () => {
  const root = fixture();
  writeFileSync(path.join(root, 'package.json'), '{}\n');
  cli(root, "printf '%s\\n' '11.28.2'");
  expectDiagnosis(root, ['packageManager']);
});
