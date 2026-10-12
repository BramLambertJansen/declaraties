import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// WS-02: check-docs meldt als `schrijfrecht` van een rol overlapt met `gates` (.claude/gates.json). Uitzonderingen:
// architect → docs/adr/** en tester → testpaden (en developer, die per definitie `**` heeft). Aanname: de overtreding
// heeft een sleutel die "schrijfrecht" bevat, en een bericht met de rolnaam.
const GATES = ['docs/framework.md', 'docs/adr/**', 'scripts/**', 'test/**'];
const OWNERS = '/docs/framework.md @e\n/docs/adr/ @e\n/scripts/ @e\n/test/ @e\n';
const SETTINGS = JSON.stringify({
  permissions: { ask: ['Edit(docs/framework.md)', 'Edit(docs/adr/**)', 'Edit(scripts/**)'] },
});

function repo(schrijfrecht: Record<string, string[]>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-schrijfrecht-'));
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: {} }),
    '.github/CODEOWNERS': OWNERS,
    '.claude/settings.json': SETTINGS,
    '.claude/gates.json': JSON.stringify({
      gates: GATES,
      testpaden: ['test/**'],
      jsonGates: {},
      schrijfrecht: { reviewer: [], developer: ['**'], ...schrijfrecht },
    }),
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function overlaps(schrijfrecht: Record<string, string[]>) {
  return (await docsViolations(repo(schrijfrecht))).filter((violation) => violation.key.includes('schrijfrecht'));
}

test('docs: ["docs/**"] overlapt met gate-paden → schending, met de rol in het bericht', async () => {
  const found = await overlaps({ docs: ['docs/**'] });

  expect(found.length).toBeGreaterThan(0);
  expect(found.every((violation) => violation.message.includes('docs'))).toBe(true);
});

test('de nieuwe expliciete docs-lijst → geen schending', async () => {
  const docs = [
    'docs/reviews/**',
    'docs/operations/**',
    'docs/README.md',
    'docs/gouden-pad.md',
    'README.md',
    'CHANGELOG.md',
  ];

  expect(await overlaps({ docs })).toStrictEqual([]);
});

test('uitzonderingen: architect → docs/adr/** en tester → testpaden geven geen schending', async () => {
  const found = await overlaps({ architect: ['docs/adr/**'], tester: ['test/**'] });

  expect(found).toStrictEqual([]);
});

test('een andere rol op docs/adr/** of de tester op een gate buiten de testpaden → schending', async () => {
  const docsOnAdr = await overlaps({ docs: ['docs/adr/**'] });
  const testerOnScripts = await overlaps({ tester: ['test/**', 'scripts/**'] });

  expect([docsOnAdr.length > 0, testerOnScripts.length > 0]).toStrictEqual([true, true]);
});
