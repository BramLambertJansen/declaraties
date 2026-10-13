import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// check-docs (framework §10): per soort fout een fixture die faalt, plus een schone repo die groen is.
const SETTINGS = JSON.stringify({
  permissions: { deny: ['Edit(!.env.example)'], ask: ['Edit(AGENTS.md)', 'Edit(src/core/**)'] },
});
const OWNERS = '/AGENTS.md @eigenaar\n/src/core/ @eigenaar\n**/*.test.* @eigenaar\n/docs/specs/ @eigenaar\n';
const SPEC_OK = 'status: goedgekeurd\n\n## Hergebruik en UX\n\n- Button\n';

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-'));
  const all: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: { 'gate:fast': 'x' } }),
    'AGENTS.md': 'Zie `src/core/a.ts`, `a.ts`, `/login` en `pnpm gate:fast` of `pnpm add`.',
    'src/core/a.ts': '',
    '.github/CODEOWNERS': OWNERS,
    '.claude/settings.json': SETTINGS,
    'docs/adr/0001-x.md': '# 0001 — X\n\nStatus: geaccepteerd (2026-10-10)\n',
    'docs/specs/a.md': SPEC_OK,
    'docs/specs/_template.md': 'status: voorstel\n',
    'docs/b.md': '[ADR](adr/0001-x.md) [extern](https://example.test) [kop](#kop)',
    ...files,
  };
  for (const [file, content] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function keys(root: string): Promise<string[]> {
  return (await docsViolations(root)).map((violation) => violation.key);
}

test('een schone repo: geen overtredingen', async () => {
  expect(await keys(repo({}))).toStrictEqual([]);
});

test('een pad of script tussen backticks dat niet bestaat', async () => {
  const root = repo({ 'CLAUDE.md': 'Gebruik `src/api/weg.ts` en `pnpm check:weg`.' });

  expect(await keys(root)).toStrictEqual(['docs:CLAUDE.md:pad:src/api/weg.ts', 'docs:CLAUDE.md:script:check:weg']);
});

test('een relatieve link in docs/ die nergens heen wijst', async () => {
  expect(await keys(repo({ 'docs/c.md': '[weg](adr/9999-weg.md)' }))).toStrictEqual([
    'docs:docs/c.md:link:adr/9999-weg.md',
  ]);
});

test('een ADR- of specstatus buiten de woordenlijst, en een goedgekeurde spec zonder "Hergebruik en UX"', async () => {
  const root = repo({
    'docs/adr/0002-y.md': '# 0002 — Y\n\nStatus: besloten\n',
    'docs/specs/b.md': 'status: klaar\n',
    'docs/specs/c.md': 'status: goedgekeurd\n\n## Hergebruik en UX\n\n## Volgende\n',
  });

  expect(await keys(root)).toStrictEqual([
    'docs:docs/adr/0002-y.md:status',
    'docs:docs/specs/b.md:status',
    'docs:docs/specs/c.md:hergebruik',
  ]);
});

test('CODEOWNERS en `ask` lopen uit elkaar (tests en specs staan alleen in CODEOWNERS)', async () => {
  const root = repo({
    '.github/CODEOWNERS': `${OWNERS}/scripts/ @eigenaar\n`,
    '.claude/settings.json': JSON.stringify({
      permissions: { ask: ['Edit(AGENTS.md)', 'Edit(src/core/**)', 'Edit(deploy/**)'] },
    }),
  });

  expect(await keys(root)).toStrictEqual(['docs:spiegel:ask:scripts/**', 'docs:spiegel:codeowners:deploy/**']);
});

test('twee ADR-bestanden met hetzelfde nummer', async () => {
  const root = repo({ 'docs/adr/0001-andere.md': '# 0001 — Andere\n\nStatus: voorgesteld\n' });

  expect(await keys(root)).toStrictEqual(['docs:adr:0001:dubbel']);
});
