import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

// Labels in de tekstuitvoer van scripts/kit/meting.mjs (#320, #364) en de help over deny-regels (#365).
const root = process.cwd();

type Regel = { m?: string; e: string; s?: string; b?: string; k?: string; id?: string; tool?: string };

function map(regels: Regel[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'meting-labels-'));
  const inhoud = regels.map((r) => JSON.stringify({ t: '2026-10-15T10:00:00.000Z', a: 'hoofdsessie', s: 'a', ...r }));
  writeFileSync(path.join(dir, 'a.jsonl'), `${inhoud.join('\n')}\n`);
  return dir;
}

function meting(env: Record<string, string>, ...args: string[]) {
  const result = spawnSync('node', [path.join(root, 'scripts/kit/meting.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, METING_GH: path.join(root, 'bestaat-niet-gh'), ...env },
  });
  return { status: result.status, stdout: result.stdout };
}

const tekst = (regels: Regel[]) => meting({ METING_DIR: map(regels) });

const metPermissievragen: Regel[] = [
  { e: 'UserPromptSubmit', b: 'main', m: 'default' },
  { e: 'PermissionRequest', b: 'main', tool: 'Bash', k: 'pnpm lint', m: 'default' },
  { e: 'PermissionRequest', b: 'main', tool: 'Bash', k: 'pnpm lint', m: 'default' },
  { e: 'PermissionRequest', b: 'feat/x', tool: 'Edit', k: 'src/a.ts', m: 'auto' },
  { e: 'Stop', b: 'main' },
];

test('tekstuitvoer noemt PermissionRequest-tellingen permissievragen, per sessie en per branch', () => {
  const uit = tekst(metPermissievragen);

  expect(uit.status).toBe(0);
  expect(uit.stdout).toMatch(/^ {2}permissievragen 3\b/m);
  expect(uit.stdout).toMatch(/^ {2}permissievragen per modus\b/m);
  expect(uit.stdout).toMatch(/^ {2}branch main: permissievragen 2\b/m);
  expect(uit.stdout).toMatch(/^ {2}branch feat\/x: permissievragen 1\b/m);
  expect(uit.stdout).toMatch(/^ {4}permissievragen per modus\b/m);
});

test('geen regel in de tekstuitvoer begint nog met het woord prompts', () => {
  const uit = tekst(metPermissievragen);

  expect(uit.status).toBe(0);
  expect(uit.stdout).not.toMatch(/^\s*prompts\b/m);
  expect(uit.stdout).not.toMatch(/:\s*prompts\b/);
});

test('#364: alleen eigenaarberichten, geen permissievragen, leest niet als "berichten niet geteld"', () => {
  const uit = tekst([
    { e: 'UserPromptSubmit', b: 'main', m: 'acceptEdits' },
    { e: 'UserPromptSubmit', b: 'main', m: 'acceptEdits' },
    { e: 'Stop', b: 'main', m: 'acceptEdits' },
  ]);

  expect(uit.status).toBe(0);
  expect(uit.stdout).toMatch(/^ {2}permissievragen 0\b/m);
  expect(uit.stdout).toMatch(/eigenaarberichten 1\b/);
  expect(uit.stdout).not.toMatch(/^\s*prompts\b/m);
});

test('#365: help zegt dat een Read- of Edit-weigering door een deny-regel geen hook-event geeft', () => {
  const uit = meting({ METING_DIR: map([]) }, '--help');

  expect(uit.status).toBe(0);
  const regel = uit.stdout
    .split('\n')
    .find((r) => [/\bRead\b/, /\bEdit\b/, /deny/i, /\b(?:geen|niet)\b/i, /event/i].every((p) => p.test(r)));
  expect(regel, 'één helpregel over Read/Edit-deny zonder event').toBeDefined();
  expect(uit.stdout).not.toContain('Een geregistreerde Read-weigering telt');
});
