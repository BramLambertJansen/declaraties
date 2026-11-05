import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { branch, cli, fixture, veld, type Fixture } from './meting-semantiek-kit';

// meting-volume (issue #412): grote meetbestanden mogen niet crashen of kwadratisch vertragen.
const BRANCH = 'feat/volume';
const BASIS = Date.parse('2026-10-15T10:00:00.000Z');
const root = process.cwd();

/** Als `cli` uit de kit, maar met een ruime timeout voor grote invoer. */
function groot(f: Fixture, args: string[]) {
  return spawnSync(process.execPath, [path.join(root, 'scripts/kit/meting.mjs'), ...args], {
    cwd: f.cwd,
    env: { ...process.env, METING_DIR: f.opslag, METING_GH: f.gh, METING_GH_TIMEOUT_MS: '1000' },
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function bestand(f: Fixture, naam: string, regels: Record<string, unknown>[]) {
  writeFileSync(path.join(f.opslag, `${naam}.jsonl`), regels.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

test('meting-volume AC-1: --pr-tabel crasht niet bij 150.000 events over 150 sessies en telt juist', () => {
  const f = fixture();
  branch(f, BRANCH);
  for (let i = 0; i < 150; i += 1) {
    const s = `sessie-${String(i).padStart(3, '0')}`;
    const regels = Array.from({ length: 1000 }, (_, j) => ({
      e: 'Stop',
      s,
      b: BRANCH,
      t: new Date(BASIS + (i * 1000 + j) * 1000).toISOString(),
    }));
    bestand(f, s, regels);
  }

  const result = groot(f, ['--pr-tabel', '--json', '--branch', BRANCH]);

  expect(result.stderr).not.toMatch(/Maximum call stack|RangeError/);
  expect(result.status).toBe(0);
  const data: unknown = JSON.parse(result.stdout);
  expect(veld(data, 'prTabel', 'doorlooptijd')).toBe(149_999);
  expect(veld(data, 'prTabel', 'reviewrondes')).toBe(0);
});

test('meting-volume AC-2: één sessie met 40.000 events wordt lineair verwerkt', () => {
  const f = fixture();
  const regels = Array.from({ length: 40_000 }, (_, j) => ({
    e: 'Stop',
    s: 'groot',
    b: BRANCH,
    t: new Date(BASIS + j * 1000).toISOString(),
  }));
  bestand(f, 'groot', regels);

  const start = performance.now();
  const result = groot(f, ['--json', '--branch', BRANCH]);
  const ms = performance.now() - start;

  expect(result.status).toBe(0);
  const data: unknown = JSON.parse(result.stdout);
  expect(veld(data, 'sessies', 'groot', 'beurten')).toBe(40_000);
  expect(veld(data, 'sessies', 'groot', 'branches', BRANCH, 'beurten')).toBe(40_000);
  expect(ms).toBeLessThan(3000);
});

// Spec rolhek-vooraf-krimp AC-7: zonder regels van de toets op effect zijn de effecttellers onbekend, nooit 0.
const ONBEKEND = { blokkades: 'onbekend', overnames: 'onbekend', schaduw: 'onbekend', schaduwAnders: 'onbekend' };

test('meting-volume AC-3: gemengde events geven ongewijzigde tellingen per sessie en branch', () => {
  const f = fixture();
  bestand(f, 'sessie', [
    { e: 'UserPromptSubmit', b: 'feat/a' },
    { e: 'UserPromptSubmit', b: 'feat/a' },
    { e: 'PermissionRequest', b: 'feat/a', m: 'default', k: 'git push' },
    { e: 'PreToolUse', b: 'feat/a', id: 'p1', k: 'git push', tool: 'Bash' },
    { e: 'PermissionDenied', b: 'feat/a', id: 'd1', k: 'rm', tool: 'Bash' },
    { e: 'PreToolUse', b: 'feat/a', id: 'd1', k: 'rm', tool: 'Bash' },
    { e: 'PreToolUse', b: 'feat/a', id: 'ok1', k: 'git push', tool: 'Bash' },
    { e: 'PostToolUse', b: 'feat/a', id: 'ok1', k: 'git push', tool: 'Bash' },
    { e: 'Stop', b: 'feat/a' },
    { e: 'UserPromptSubmit', b: 'feat/b' },
    { e: 'PermissionRequest', b: 'feat/b', m: 'plan', k: 'Edit' },
    { e: 'Stop', b: 'feat/b' },
    { e: 'Stop', b: 'feat/b' },
    { e: 'PreToolUse', b: 'feat/b', id: 'ok2', k: 'git push', tool: 'Bash' },
    { e: 'PostToolUse', b: 'feat/b', id: 'ok2', k: 'git push', tool: 'Bash' },
  ]);

  const result = cli(f, ['--json']);

  expect(result.status).toBe(0);
  const data: unknown = JSON.parse(result.stdout);
  expect(veld(data, 'sessies', 'sessie')).toEqual({
    prompts: 2,
    promptsPerSleutel: { 'git push': 1, Edit: 1 },
    promptsPerModus: { default: 1, plan: 1 },
    weigeringen: 2,
    weigeringenPerSleutel: { 'git push': 1, rm: 1 },
    beurten: 3,
    eigenaarberichten: 2,
    pushes: 2,
    ciRondes: 'onbekend',
    effect: ONBEKEND,
    branches: {
      'feat/a': {
        prompts: 1,
        promptsPerSleutel: { 'git push': 1 },
        promptsPerModus: { default: 1 },
        weigeringen: 2,
        weigeringenPerSleutel: { 'git push': 1, rm: 1 },
        beurten: 1,
        eigenaarberichten: 1,
        pushes: 1,
        ciRondes: 'onbekend',
        effect: ONBEKEND,
      },
      'feat/b': {
        prompts: 1,
        promptsPerSleutel: { Edit: 1 },
        promptsPerModus: { plan: 1 },
        weigeringen: 0,
        weigeringenPerSleutel: {},
        beurten: 2,
        eigenaarberichten: 1,
        pushes: 1,
        ciRondes: 'onbekend',
        effect: ONBEKEND,
      },
    },
  });
});
