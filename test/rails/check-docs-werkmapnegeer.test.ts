import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// ADR 0031 besluit 5: check-docs faalt als een pad in `werkmapNegeer` (.claude/gates.json) getrackt is of niet onder
// `.claude/` valt. Aanname: de overtreding heeft een sleutel met "werkmapNegeer" en een bericht met het pad.
const GATES = ['docs/framework.md', 'scripts/**', 'test/**', '.claude/**'];
const OWNERS = '/docs/framework.md @e\n/scripts/ @e\n/test/ @e\n/.claude/ @e\n';
const SETTINGS = JSON.stringify({
  permissions: { ask: ['Edit(docs/framework.md)', 'Edit(scripts/**)', 'Edit(.claude/**)'] },
});

const ROOTS: string[] = [];

afterEach(() => {
  for (const root of ROOTS.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repo(werkmapNegeer: unknown, tracked: string[] = []): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-werkmapnegeer-'));
  ROOTS.push(root);
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: {} }),
    '.github/CODEOWNERS': OWNERS,
    '.claude/settings.json': SETTINGS,
    '.claude/gates.json': JSON.stringify({
      jsonGates: {},
      gates: GATES,
      testpaden: ['test/**'],
      schrijfrecht: { reviewer: [], developer: ['**'] },
      werkmapNegeer,
    }),
  };
  for (const file of tracked) files[file] = 'x\n';
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function found(werkmapNegeer: unknown, tracked: string[] = []) {
  return (await docsViolations(repo(werkmapNegeer, tracked))).filter((violation) =>
    violation.key.includes('werkmapNegeer'),
  );
}

test('werkmapNegeer: geldige lijst onder .claude/, niets getrackt: geen schending', async () => {
  expect(await found(['.claude/launch.json', '.claude/routines/'])).toStrictEqual([]);
});

test('werkmapNegeer: een getrackt bestand onder een genegeerd pad faalt, met het pad in het bericht', async () => {
  const violations = await found(['.claude/launch.json'], ['.claude/launch.json']);

  expect(violations.length).toBeGreaterThan(0);
  expect(violations.every((violation) => violation.message.includes('.claude/launch.json'))).toBe(true);
});

test('werkmapNegeer: een getrackt bestand onder een genegeerde map faalt', async () => {
  const violations = await found(['.claude/routines/'], ['.claude/routines/dagelijks.md']);

  expect(violations.length).toBeGreaterThan(0);
});

test.each(['src/', 'scripts/x.mjs', '.mcp.json', 'docs/', '../buiten', '.claudeX/y', '.claude'])(
  'werkmapNegeer: pad %s valt niet onder .claude/ en faalt',
  async (pad) => {
    const violations = await found([pad]);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((violation) => violation.message.includes(pad))).toBe(true);
  },
);

test('werkmapNegeer: een pad met ../ dat via .claude/ ontsnapt faalt', async () => {
  expect((await found(['.claude/../src/'])).length).toBeGreaterThan(0);
});

test.each([['kapot'], [[1]], [{ a: 1 }]])('werkmapNegeer: ongeldige vorm %j faalt', async (waarde) => {
  expect((await found(waarde)).length).toBeGreaterThan(0);
});
