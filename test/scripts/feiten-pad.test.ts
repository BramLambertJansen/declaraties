import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// padtabel/AC-13 (ADR 0079 punt 7): `node scripts/kit/feiten.mjs pad <pad>` toont het afgeleide niveau met zijn bronnen, op de
// echte .claude/gates.json.
const REPO = path.join(import.meta.dirname, '../..');

function feiten(...args: string[]) {
  return spawnSync('node', ['scripts/kit/feiten.mjs', ...args], { cwd: REPO, encoding: 'utf8' });
}

describe('padtabel/AC-13 feiten.mjs pad <pad>', () => {
  test('docs/adr/0001-x.md: schrijven gate en besluit besluit-pr, beide uit docs/adr/** (padtabel/AC-13)', () => {
    const uit = feiten('pad', 'docs/adr/0001-x.md');
    expect(uit.status).toBe(0);
    expect(uit.stdout).toContain('docs/adr/0001-x.md: ');
    expect(uit.stdout).toContain('schrijven gate (docs/adr/**)');
    expect(uit.stdout).toContain('besluit besluit-pr (docs/adr/**)');
  });

  test('notities.md: vrij en eigenaar uit de standaard (padtabel/AC-13)', () => {
    const uit = feiten('pad', 'notities.md');
    expect(uit.status).toBe(0);
    expect(uit.stdout).toContain('notities.md: schrijven vrij (standaard), besluit eigenaar (standaard)');
  });

  test('zonder argument: gebruiksregel en exit 1 (padtabel/AC-13)', () => {
    const uit = feiten('pad');
    expect(uit.status).toBe(1);
    expect(uit.stderr).toContain('Gebruik: node scripts/kit/feiten.mjs pad <pad>');
  });
});
