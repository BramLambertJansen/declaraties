import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// De deny-regel op `*secret*` wordt ook sandbox-`denyRead`, en de sandbox maskeert elk bestand dat past. Over de hele
// repo (`./**/*secret*`) raakte dat ook node_modules (better-auth `secret-utils.mjs`, jose `generate_secret.js`): typed
// lint, unit-tests en de pre-push-hook faalden alleen in de sandbox. `allowRead` kan dat niet heropenen (een specifiekere
// weigering wint). Daarom één regel per getrackte map, en deze test faalt zodra een getrackte map niet gedekt is: zo is
// de bescherming niet smaller dan vóór de wijziging (docs/reviews/2026-10-13-wrijving.md, S-2).
type Json = Record<string, unknown>;

function section(value: unknown): Json {
  return typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

const settings = section(JSON.parse(readFileSync('.claude/settings.json', 'utf8')));
const deny = strings(section(settings['permissions'])['deny']);
const sandbox = section(settings['sandbox']);
const filesystem = section(sandbox['filesystem']);

const trackedDirs = [
  ...new Set(
    execFileSync('git', ['ls-files'], { encoding: 'utf8' })
      .split('\n')
      .filter((file) => file.includes('/'))
      .map((file) => file.split('/')[0] ?? ''),
  ),
].filter((dir) => dir !== '');

test('geen *secret*-weigering over de hele repo: die maskeert node_modules', () => {
  expect(deny).not.toContain('Read(./**/*secret*)');
});

test('elke getrackte map en de root zijn gedekt door een *secret*-weigering', () => {
  expect(trackedDirs.length).toBeGreaterThan(5);
  expect(deny).toContain('Read(./*secret*)');
  expect(trackedDirs.filter((dir) => !deny.includes(`Read(./${dir}/**/*secret*)`))).toStrictEqual([]);
});

test('allowRead heropent alleen .env.example (geen inloggegevens, geen hele mappen)', () => {
  expect(strings(filesystem['allowRead'])).toStrictEqual(['./.env.example']);
});

test('de grens blijft: sandbox verplicht, geen ontsnapping, inloggegevens en .env afgeschermd', () => {
  expect(sandbox['enabled']).toBe(true);
  expect(sandbox['failIfUnavailable']).toBe(true);
  expect(sandbox['allowUnsandboxedCommands']).toBe(false);
  expect(strings(filesystem['denyRead'])).toStrictEqual(expect.arrayContaining(['~/.ssh', '~/.aws']));
  expect(deny).toStrictEqual(
    expect.arrayContaining(['Read(.env)', 'Read(.env.*)', 'Read(~/.ssh/**)', 'Read(~/.aws/**)']),
  );
});
