import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// check-docs: CODEOWNERS noemt precies de gates en jsonGates uit .claude/gates.json (framework §10, ADR 0045).
function repo(gates: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-gates-'));
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: {} }),
    '.github/CODEOWNERS': '/src/core/ @eigenaar\n/package.json @eigenaar\n**/*.test.* @eigenaar\n',
    '.claude/settings.json': JSON.stringify({ permissions: { ask: ['Edit(src/core/**)', 'Edit(package.json)'] } }),
    '.claude/gates.json': JSON.stringify({ voorReview: ['src/core/**', 'package.json'], ...gates }),
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

// GEWIJZIGD (spec padtabel AC-11, OV-1 ii): de fixtures staan in de oude vorm; check-docs meldt die erbij (ADR 0079 punt 6).
const OUDE_VORM = {
  key: 'docs:paden:oude-vorm',
  message: '.claude/gates.json: oude vorm zonder paden; zet de lijsten om naar paden (ADR 0079)',
};

test('gelijk: geen overtredingen, behalve de oude vorm', async () => {
  const root = repo({ gates: ['src/core/**', '**/*.test.*'], jsonGates: { 'package.json': ['scripts'] } });

  expect(await docsViolations(root)).toStrictEqual([OUDE_VORM]);
});

test('een gate die CODEOWNERS mist, en een CODEOWNERS-regel die geen gate is', async () => {
  const root = repo({ gates: ['src/core/**', 'deploy/**'], jsonGates: { 'package.json': ['scripts'] } });

  expect((await docsViolations(root)).map((violation) => violation.key)).toStrictEqual([
    'docs:spiegel:codeowners-gates:deploy/**',
    'docs:spiegel:gates:**/*.test.*',
    OUDE_VORM.key,
  ]);
});
