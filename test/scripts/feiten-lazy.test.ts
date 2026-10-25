import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, expect, test } from 'vitest';

const root = path.join(import.meta.dirname, '../..');
const dir = mkdtempSync(path.join(tmpdir(), 'feiten-imports-'));
const hook = path.join(dir, 'block-catalogue.mjs');
writeFileSync(
  hook,
  `import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('/catalogus.mjs')) throw new Error('CATALOGUE_IMPORT');
  return nextResolve(specifier, context);
} });
`,
);
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(section: string) {
  return spawnSync(process.execPath, ['--import', hook, 'scripts/kit/feiten.mjs', section, '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
}

test.each(['gates', 'adr', 'specs', 'migraties', 'routes', 'permissies', 'foutcodes', 'fase'])(
  '%s laadt geen UI-catalogus of TypeScript-compiler',
  (section) => {
    const result = run(section);
    expect(result.stderr).not.toContain('CATALOGUE_IMPORT');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toHaveProperty(section);
  },
);

test('een onbekende sectie geeft de gebruiksfout zonder de catalogus te laden', () => {
  const result = run('unknown');
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('Onbekende sectie');
  expect(result.stderr).not.toContain('CATALOGUE_IMPORT');
});

test('de importproef detecteert de catalogus wanneer die wel nodig is', () => {
  const result = run('componenten');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('CATALOGUE_IMPORT');
});
