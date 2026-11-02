import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { branch, cli, fixture, geenGh, veld, type Fixture } from './meting-semantiek-kit';

// meting-kerncijfers AC-2: `pnpm meting --pr-tabel [--branch X] [--json]`.
const BRANCH = 'feat/kern';

function schrijf(f: Fixture, regels: Record<string, unknown>[]) {
  const lijnen = regels.map((r) => JSON.stringify({ s: 'sessie', b: BRANCH, a: 'hoofdsessie', ...r }));
  writeFileSync(path.join(f.opslag, 'sessie.jsonl'), lijnen.join('\n') + '\n');
}

// Nep-gh: elke aanroep geeft de runs als JSON, of faalt met exit 1.
function ghStub(f: Fixture, runs: unknown[] | 'fout'): Fixture {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'kern-gh-')), 'gh');
  const body =
    runs === 'fout' ? 'process.exit(1);' : 'process.stdout.write(' + JSON.stringify(JSON.stringify(runs)) + ');';
  writeFileSync(file, '#!/usr/bin/env node\n' + body + '\n');
  chmodSync(file, 0o755);
  return { ...f, gh: file };
}

const run = (conclusion: string) => ({ databaseId: 1, createdAt: '2026-10-15T10:05:00.000Z', conclusion });

const events = [
  { e: 'PreToolUse', t: '2026-10-15T10:00:00.000Z', tool: 'Bash', id: 'a', k: 'pnpm lint' },
  { e: 'PostToolUse', t: '2026-10-15T10:00:01.000Z', tool: 'Bash', id: 'a', k: 'pnpm lint' },
  { e: 'PreToolUse', t: '2026-10-15T10:10:00.000Z', tool: 'Agent', id: 'r1', k: 'agent reviewer' },
  { e: 'PreToolUse', t: '2026-10-15T10:10:00.000Z', tool: 'Agent', id: 'r1', k: 'agent reviewer' },
  { e: 'PreToolUse', t: '2026-10-15T10:20:00.000Z', tool: 'Agent', id: 'r2', k: 'agent reviewer' },
  { e: 'PreToolUse', t: '2026-10-15T10:21:00.000Z', tool: 'Agent', id: 't1', k: 'agent tester' },
  { e: 'PreToolUse', t: '2026-10-15T10:25:30.000Z', tool: 'Bash', id: 'w', k: 'git' },
  { e: 'PermissionDenied', t: '2026-10-15T10:25:30.000Z', tool: 'Bash', id: 'w', k: 'git' },
];

function rij(stdout: string, naam: RegExp): string {
  return stdout.split('\n').find((l) => l.startsWith('|') && naam.test(l)) ?? '';
}

function tabel(f: Fixture) {
  branch(f, BRANCH);
  const result = cli(f, ['--pr-tabel', '--branch', BRANCH]);
  expect(result.status).toBe(0);
  return result.stdout;
}

test('meting-kerncijfers AC-2: de tabel heeft een rij per kerncijfer', () => {
  const f = ghStub(fixture(), [run('failure'), run('success'), run('failure')]);
  schrijf(f, events);

  const uit = tabel(f);

  expect(uit).toMatch(/^\|[^\n]*\|\n\|[\s:|-]+\|$/m);
  for (const naam of [/leespad/i, /doorlooptijd/i, /reviewrondes/i, /CI-rood/i, /weigeringen/i, /Codex/i])
    expect(rij(uit, naam), String(naam)).not.toBe('');
});

test('meting-kerncijfers AC-2: leespad verwijst naar pnpm leespad', () => {
  const f = ghStub(fixture(), []);
  schrijf(f, events);
  expect(rij(tabel(f), /leespad/i)).toMatch(/pnpm leespad/);
});

test('meting-kerncijfers AC-2: doorlooptijd is laatste min eerste t, leesbaar', () => {
  const f = ghStub(fixture(), []);
  schrijf(f, events);
  expect(rij(tabel(f), /doorlooptijd/i)).toMatch(/25:30/);
});

test('meting-kerncijfers AC-2: doorlooptijd is onbekend zonder events van de branch', () => {
  const f = ghStub(fixture(), []);
  schrijf(f, [{ e: 'Stop', b: 'andere/branch', t: '2026-10-15T10:00:00.000Z' }]);
  expect(rij(tabel(f), /doorlooptijd/i)).toMatch(/onbekend/i);
});

test('meting-kerncijfers AC-2: reviewrondes telt agent reviewer, ontdubbeld op tool_use_id', () => {
  const f = ghStub(fixture(), []);
  schrijf(f, events);
  expect(rij(tabel(f), /reviewrondes/i)).toMatch(/\b2\b/);
});

test('meting-kerncijfers AC-2: CI-rood telt runs met conclusion failure', () => {
  const f = ghStub(fixture(), [run('failure'), run('success'), run('failure'), run('cancelled')]);
  schrijf(f, events);
  expect(rij(tabel(f), /CI-rood/i)).toMatch(/\b2\b/);
});

test('meting-kerncijfers AC-2: CI-rood is onbekend bij een gh-fout, nooit 0', () => {
  const f = ghStub(fixture(), 'fout');
  schrijf(f, events);
  const r = rij(tabel(f), /CI-rood/i);
  expect(r).toMatch(/onbekend/i);
  expect(r).not.toMatch(/\b0\b/);
});

test('meting-kerncijfers AC-2: weigeringen draagt het label bovengrens', () => {
  const f = ghStub(fixture(), []);
  schrijf(f, events);
  const r = rij(tabel(f), /weigeringen/i);
  expect(r).toMatch(/bovengrens/i);
  expect(r).toMatch(/\b1\b/);
});

test('meting-kerncijfers AC-2: Codex-bevindingen is een handmatige rij', () => {
  const f = ghStub(fixture(), []);
  schrijf(f, events);
  expect(rij(tabel(f), /Codex/i)).toMatch(/handmatig:\s*gh api[^|]*comments/);
});

test('meting-kerncijfers AC-2: --json bevat dezelfde velden onder prTabel', () => {
  const f = ghStub(fixture(), [run('failure')]);
  schrijf(f, events);
  branch(f, BRANCH);

  const result = cli(f, ['--pr-tabel', '--json', '--branch', BRANCH]);

  expect(result.status).toBe(0);
  const data: unknown = JSON.parse(result.stdout);
  expect(veld(data, 'prTabel', 'doorlooptijd')).toBe(1530); // seconden, of 'onbekend'
  expect(veld(data, 'prTabel', 'reviewrondes')).toBe(2);
  expect(veld(data, 'prTabel', 'ciRood')).toBe(1);
  expect(veld(data, 'prTabel', 'weigeringen')).toBe(1);
  expect(String(veld(data, 'prTabel', 'leespad'))).toContain('leespad');
  expect(String(veld(data, 'prTabel', 'codexBevindingen'))).toMatch(/handmatig/);
});

test('meting-kerncijfers AC-2: --json geeft onbekend (geen 0) bij een gh-fout', () => {
  const f = ghStub(fixture(), 'fout');
  schrijf(f, events);
  const result = cli(f, ['--pr-tabel', '--json', '--branch', BRANCH]);
  expect(veld(JSON.parse(result.stdout), 'prTabel', 'ciRood')).toBe('onbekend');
});

test('meting-kerncijfers AC-2: --help noemt --pr-tabel en roept gh niet aan', () => {
  const f = fixture();
  const result = cli(f, ['--help', '--pr-tabel']);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('--pr-tabel');
  geenGh(f);
});
