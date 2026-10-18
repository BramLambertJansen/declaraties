import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// ADR 0029 punt 5: een mini-spec (`sjabloon: mini`) heeft vaste koppen en `check-docs` controleert het frontmatterveld.
// Sleutel: `docs:<spec>:sjabloon`. Het volledige sjabloon (`_template.md`) heeft het veld niet en blijft ongewijzigd.
const KOPPEN = ['Doel', 'Rollen en wie wat ziet', 'Routes en foutcodes', 'Acceptatiecriteria', 'Hergebruik en UX'];

function mini(opties: { sjabloon?: string; zonder?: string; status?: string } = {}): string {
  const koppen = KOPPEN.filter((kop) => kop !== opties.zonder).map((kop) => `## ${kop}\n\nTekst.\n`);
  const sjabloon = opties.sjabloon === undefined ? [] : [`sjabloon: ${opties.sjabloon}`];
  return [
    '---',
    `status: ${opties.status ?? 'voorstel'}`,
    'namespace: demo',
    ...sjabloon,
    '---',
    '',
    '# Demo',
    '',
    ...koppen,
  ].join('\n');
}

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-mini-'));
  const all = { 'package.json': JSON.stringify({ scripts: {} }), ...files };
  for (const [file, content] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function sjabloonKeys(files: Record<string, string>): Promise<string[]> {
  const violations = await docsViolations(repo(files));
  return violations.map((violation) => violation.key).filter((key) => key.includes(':sjabloon'));
}

const SPEC = 'docs/specs/demo.md';

test('een mini-spec met alle koppen: geen overtreding', async () => {
  expect(await sjabloonKeys({ [SPEC]: mini({ sjabloon: 'mini' }) })).toStrictEqual([]);
});

test.each(KOPPEN)('een mini-spec zonder de kop "%s": overtreding', async (kop) => {
  expect(await sjabloonKeys({ [SPEC]: mini({ sjabloon: 'mini', zonder: kop }) })).toStrictEqual([
    `docs:${SPEC}:sjabloon`,
  ]);
});

test('een onbekende waarde van sjabloon: overtreding', async () => {
  expect(await sjabloonKeys({ [SPEC]: mini({ sjabloon: 'kort' }) })).toStrictEqual([`docs:${SPEC}:sjabloon`]);
});

test('een spec zonder sjabloonveld wordt niet als mini-spec getoetst', async () => {
  expect(await sjabloonKeys({ [SPEC]: mini({ zonder: 'Doel' }) })).toStrictEqual([]);
});

test('het sjabloon _mini.md zelf is geen spec en wordt niet getoetst', async () => {
  expect(await sjabloonKeys({ 'docs/specs/_mini.md': mini({ sjabloon: 'mini', zonder: 'Doel' }) })).toStrictEqual([]);
});
