import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { branch, cli, fixture, veld, type Fixture } from './meting-semantiek-kit';

// meting-kerncijfers AC-2: bevindingen uit de review (zonder branch, subagents versus gewone commando's).
const BRANCH = 'feat/kern';

function schrijf(f: Fixture, regels: Record<string, unknown>[]) {
  const lijnen = regels.map((r) => JSON.stringify({ s: 'sessie', b: BRANCH, a: 'hoofdsessie', ...r }));
  writeFileSync(path.join(f.opslag, 'sessie.jsonl'), lijnen.join('\n') + '\n');
}

test('meting-kerncijfers AC-2: --pr-tabel zonder --branch geeft een foutmelding en exit 1, geen gh-aanroep', () => {
  const f = fixture();
  schrijf(f, [{ e: 'Stop', t: '2026-10-15T10:00:00.000Z' }]);
  for (const args of [['--pr-tabel'], ['--pr-tabel', '--branch'], ['--pr-tabel', '--branch', '']]) {
    const r = cli(f, args);
    expect(r.status, args.join(' ')).toBe(1);
    expect(r.stderr).toMatch(/--branch/);
    expect(r.stdout).toBe('');
  }
});

test('meting-kerncijfers AC-2: alleen een Agent- of Task-aanroep is geen weigering, een Bash- of Read-sleutel agent wel', () => {
  const f = fixture();
  branch(f, BRANCH);
  schrijf(f, [
    { e: 'PreToolUse', t: '2026-10-15T10:00:00.000Z', tool: 'Agent', id: 'a1', k: 'agent reviewer' },
    { e: 'PreToolUse', t: '2026-10-15T10:00:01.000Z', tool: 'Task', id: 'a2', k: 'agent' },
    { e: 'PreToolUse', t: '2026-10-15T10:00:02.000Z', tool: 'Bash', id: 'b1', k: 'agent' },
    { e: 'PreToolUse', t: '2026-10-15T10:00:03.000Z', tool: 'Read', id: 'b2', k: 'agent x' },
  ]);
  const r = cli(f, ['--pr-tabel', '--json', '--branch', BRANCH]);
  expect(r.status).toBe(0);
  expect(veld(JSON.parse(r.stdout), 'prTabel', 'weigeringen')).toBe(2);
});
