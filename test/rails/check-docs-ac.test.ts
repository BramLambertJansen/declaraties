import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// check-docs: AC-traceerbaarheid. Elk AC-id van een spec met status `gebouwd` heeft een testbestand (`*.test.*`, `*.spec.*`,
// `db/tests/**`, `e2e/**`, `test/**`) met `<namespace>/AC-n`, of met het AC-id (als heel woord) samen met de specnaam of de
// namespace. Sleutel: `docs:ac:<spec>:<AC-n>`. Specnaam `mijn-spec`, namespace `mijn`: bewust verschillend.
function spec(status: string, name = 'mijn-spec', namespace = 'mijn'): string {
  return [
    '---',
    `status: ${status}`,
    `namespace: ${namespace}`,
    '---',
    '',
    `# ${name}`,
    '',
    '## Hergebruik en UX',
    '',
    'Geen nieuwe UI.',
    '',
    '## Acceptatiecriteria',
    '',
    `- **${namespace}/AC-1** — Gegeven iets, dan dit.`,
    '',
  ].join('\n');
}

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-ac-'));
  const all = { 'package.json': JSON.stringify({ scripts: {} }), ...files };
  for (const [file, content] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function acKeys(files: Record<string, string>): Promise<string[]> {
  const violations = await docsViolations(repo(files));
  return violations.map((violation) => violation.key).filter((key) => key.startsWith('docs:ac:'));
}

const SPEC = 'docs/specs/mijn-spec.md';

test('een gebouwde spec met een AC zonder test: overtreding docs:ac:<spec>:<AC-n>', async () => {
  expect(await acKeys({ [SPEC]: spec('gebouwd') })).toStrictEqual(['docs:ac:mijn-spec:AC-1']);
});

test.each([
  ['unit', 'src/a/a.test.ts'],
  ['spec', 'e2e/a.spec.ts'],
  ['test/', 'test/api/a.int.test.ts'],
  ['db/tests', 'db/tests/a.sql'],
])('gedekt via <namespace>/AC-n in een testbestand (%s): geen overtreding', async (_soort, file) => {
  expect(await acKeys({ [SPEC]: spec('gebouwd'), [file]: "test('mijn/AC-1: doet iets', () => {});\n" })).toStrictEqual(
    [],
  );
});

test.each([
  ['specnaam', "// mijn-spec\ntest('AC-1: doet iets', () => {});\n"],
  ['namespace', "// spec mijn\ntest('AC-1: doet iets', () => {});\n"],
])('gedekt via het AC-id en de %s in hetzelfde bestand: geen overtreding', async (_soort, content) => {
  expect(await acKeys({ [SPEC]: spec('gebouwd'), 'src/a/a.test.ts': content })).toStrictEqual([]);
});

test('het AC-id in een test die een andere spec noemt: overtreding', async () => {
  const keys = await acKeys({
    [SPEC]: spec('gebouwd'),
    'src/a/a.test.ts': "// andere-spec en andere\ntest('AC-1: doet iets anders', () => {});\n",
    'test/b.test.ts': "test('andere/AC-1: nog iets', () => {});\n",
  });

  expect(keys).toStrictEqual(['docs:ac:mijn-spec:AC-1']);
});

test('het AC-id en de specnaam in verschillende bestanden dekken niet', async () => {
  const keys = await acKeys({
    [SPEC]: spec('gebouwd'),
    'src/a/a.test.ts': "test('AC-1: doet iets', () => {});\n",
    'src/b/b.test.ts': "// mijn-spec\ntest('doet iets', () => {});\n",
  });

  expect(keys).toStrictEqual(['docs:ac:mijn-spec:AC-1']);
});

test.each(['goedgekeurd', 'voorstel', 'vervallen'])(
  'een spec met status %s wordt niet gecontroleerd',
  async (status) => {
    expect(await acKeys({ [SPEC]: spec(status) })).toStrictEqual([]);
  },
);

test.each([
  ['<namespace>/AC-10', "test('mijn/AC-10: iets', () => {});\n"],
  ['AC-10 met de specnaam', "// mijn-spec\ntest('AC-10: iets', () => {});\n"],
  ['AC-1 als deel van een woord (XAC-1, AC-1a)', "// mijn-spec\ntest('XAC-1 en AC-1a', () => {});\n"],
])('een ander AC-id telt niet als dekking van AC-1: %s', async (_soort, content) => {
  expect(await acKeys({ [SPEC]: spec('gebouwd'), 'src/a/a.test.ts': content })).toStrictEqual([
    'docs:ac:mijn-spec:AC-1',
  ]);
});

test('een bestand buiten de testpaden dekt niet', async () => {
  const keys = await acKeys({ [SPEC]: spec('gebouwd'), 'src/a/a.ts': '// mijn/AC-1 en mijn-spec AC-1\n' });

  expect(keys).toStrictEqual(['docs:ac:mijn-spec:AC-1']);
});

test('een kruisverwijzing naar een AC van een andere spec in de spec zelf is geen eigen AC', async () => {
  const text = spec('gebouwd').replace('Gegeven iets, dan dit.', 'Gegeven iets, dan dit; zie ook accounts/AC-42.');

  const keys = await acKeys({ [SPEC]: text, 'src/a/a.test.ts': "test('mijn/AC-1: doet iets', () => {});\n" });

  expect(keys).toStrictEqual([]);
});
