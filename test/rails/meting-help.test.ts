import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { cli, fixture, geenGh, log, stuur } from './meting-semantiek-kit';

function verwachtHelp(stdout: string) {
  for (const optie of ['--json', '--sessie', '--branch', '--help']) expect(stdout).toContain(optie);
  expect(stdout).toMatch(/(?:gebruik|usage)[^\n]*meting/i);
  expect(stdout).toMatch(/prompts[^\n]*PermissionRequest/i);
  expect(stdout).toMatch(/(?:niet|geen)[^\n]*UserPromptSubmit/i);
  expect(stdout).toMatch(/(?:niet|geen)[^\n]*eigenaarberichten/i);
  expect(stdout).toMatch(/modus[^\n]*(?:alleen|uitsluitend)[^\n]*permissie/i);
  expect(stdout).toMatch(/le(?:ge|eg)[^\n]*(?:geen bewijs|bewijst niet)[^\n]*(?:modus|mode)/i);
}

test('directe CLI --help legt de telbetekenis en alle bestaande opties uit', () => {
  const f = fixture();

  const result = cli(f, ['--help']);

  expect(result.status).toBe(0);
  verwachtHelp(result.stdout);
  expect(result.stderr).toBe('');
  geenGh(f);
});

test.each([
  ['--help'],
  ['--json', '--help', '--sessie', 'sessie', '--branch', 'feat/een'],
  ['--sessie', 'sessie', '--branch', 'feat/een', '--help', '--json'],
])('help heeft voorrang op filters en JSON: %j', (...args) => {
  const f = fixture();
  stuur(f, { hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'pnpm lint' } });
  const voor = log(f);

  const result = cli(f, args);

  expect(result.status).toBe(0);
  verwachtHelp(result.stdout);
  expect(result.stdout).not.toContain('"sessies"');
  expect(log(f)).toBe(voor);
  geenGh(f);
});

test('help leest geen jsonl: een jsonl-map zou bij lezen EISDIR veroorzaken', () => {
  const f = fixture();
  mkdirSync(path.join(f.opslag, 'onleesbaar.jsonl'));

  const result = cli(f, ['--json', '--help']);

  expect(result.status).toBe(0);
  verwachtHelp(result.stdout);
  expect(result.stderr).toBe('');
  geenGh(f);
});

test('help werkt ook als de opslagmap door een gewoon bestand wordt geblokkeerd', () => {
  const f = fixture();
  const blok = path.join(f.dir, 'geen-map');
  writeFileSync(blok, 'ongeldige opslagmap');

  const result = cli(f, ['--help', '--branch', 'feat/een'], path.join(blok, 'sub'));

  expect(result.status).toBe(0);
  verwachtHelp(result.stdout);
  expect(result.stderr).toBe('');
  geenGh(f);
});
