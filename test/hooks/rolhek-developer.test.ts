import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, decideChange, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// Spec samenhang-checks-rollen/AC-4 (ADR 0068 punt 4): het rolhek weigert de developer specs en bestaande tests, via Edit,
// Write en de toets op effect; architect, tester en hoofdsessie houden wat ze hadden.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

type Ctx = Parameters<typeof decide>[1];
type Authority = NonNullable<Ctx['authority']>;

const spec = (status: string, tekst = 'Bestaande kit.'): string =>
  `---\nstatus: ${status}\nnamespace: demo\n---\n\n# Demo\n\n## Hergebruik en UX\n\n${tekst}\n`;
const SPEC = 'docs/specs/demo.md';
const SPEC_NIEUW = 'docs/specs/nieuw.md';
const TEST = 'test/rails/demo.test.ts';
const TEST_NIEUW = 'test/rails/nieuw.test.ts';
const TEST_TEKST = "import { test } from 'vitest';\n\ntest('a', () => {\n  expect(1).toBe(1);\n});\n";

const FILES: Record<string, string> = { [SPEC]: spec('voorstel'), [TEST]: TEST_TEKST };

function authority(werkmap: Record<string, string> = FILES): Authority {
  return {
    registry: { version: 1, requiredChecks: ['gate:fast'], decisions: [] },
    repository: 'BramLambertJansen/template',
    branch: 'feat/x',
    trusted: (file) => FILES[file] ?? null,
    working: (file) => werkmap[file] ?? null,
    safe: () => true,
  };
}

function ctx(werkmap: Record<string, string> = FILES): Ctx {
  return {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => werkmap[rel] ?? null,
    committed: (rel: string) => rel in FILES,
    isDir: () => false,
    branch: 'feat/x',
    authority: authority(werkmap),
  };
}

const as = (agent: string | undefined) => (agent === undefined ? {} : { agent_type: agent });
const write = (file: string, content: string, agent?: string) =>
  decide({ tool_name: 'Write', tool_input: { file_path: `${ROOT}/${file}`, content }, ...as(agent) }, ctx());
const edit = (file: string, [from, to]: [string, string], agent?: string) =>
  decide(
    { tool_name: 'Edit', tool_input: { file_path: `${ROOT}/${file}`, old_string: from, new_string: to }, ...as(agent) },
    ctx(),
  );

describe('samenhang-checks-rollen/AC-4: de developer schrijft geen spec', () => {
  test.each([
    ['een nieuwe spec', () => write(SPEC_NIEUW, spec('voorstel'), 'developer')],
    ['inhoud van een voorstel', () => edit(SPEC, ['Bestaande kit.', 'Andere kit.'], 'developer')],
  ])('samenhang-checks-rollen/AC-4 %s: geweigerd, met verwijzing naar de architect', (_naam, maak) => {
    expect(maak().deny.join('\n')).toContain('dat doet de architect');
  });

  test('samenhang-checks-rollen/AC-4 status terug naar voorstel, ook zonder vastgelegde basis: geweigerd', () => {
    const werkmap = { [SPEC]: spec('goedgekeurd') };
    const zonderBasis: Ctx = { ...ctx(werkmap), authority: null };
    const besluit = decide(
      {
        tool_name: 'Edit',
        tool_input: { file_path: `${ROOT}/${SPEC}`, old_string: 'status: goedgekeurd', new_string: 'status: voorstel' },
        agent_type: 'developer',
      },
      zonderBasis,
    );
    expect(besluit.deny).not.toHaveLength(0);
  });

  test('samenhang-checks-rollen/AC-4 een spec verwijderen via de toets op effect: geweigerd', () => {
    const besluit = decideChange({ rel: SPEC, change: { kind: 'delete', after: null }, agentType: 'developer' }, ctx());
    expect(besluit.deny).not.toHaveLength(0);
  });

  test('samenhang-checks-rollen/AC-4 een spec veranderd door een ander programma (toets op effect): geweigerd', () => {
    const besluit = decideChange(
      { rel: SPEC, change: { kind: 'write', after: spec('voorstel', 'Geformatteerd.') }, agentType: 'developer' },
      ctx(),
    );
    expect(besluit.deny.join('\n')).toContain('dat doet de architect');
  });

  test('samenhang-checks-rollen/AC-4 terugzetten naar precies de tekst op main: toegestaan', () => {
    const gewijzigd = { ...FILES, [SPEC]: spec('voorstel', 'Lokaal gewijzigd.') };
    const besluit = decide(
      {
        tool_name: 'Write',
        tool_input: { file_path: `${ROOT}/${SPEC}`, content: spec('voorstel') },
        agent_type: 'developer',
      },
      ctx(gewijzigd),
    );
    expect([besluit.deny, besluit.ask]).toStrictEqual([[], []]);
  });

  test.each([
    ['architect', 'architect'],
    ['hoofdsessie', undefined],
  ])('samenhang-checks-rollen/AC-4 %s: een spec schrijven blijft toegestaan', (_rol, agent) => {
    expect(write(SPEC_NIEUW, spec('voorstel'), agent).deny).toStrictEqual([]);
    expect(edit(SPEC, ['Bestaande kit.', 'Andere kit.'], agent).deny).toStrictEqual([]);
  });
});

describe('samenhang-checks-rollen/AC-4: de developer wijzigt geen bestaande test', () => {
  test('samenhang-checks-rollen/AC-4 developer wijzigt een bestaande test: geweigerd, met verwijzing naar hoofdsessie of tester', () => {
    const tekst = edit(TEST, ['toBe(1)', 'toBe(2)'], 'developer').deny.join('\n');
    expect(tekst).toContain('de hoofdsessie doet dat');
    expect(tekst).toContain('de tester');
  });

  test('samenhang-checks-rollen/AC-4 developer wijzigt een bestaande test via de toets op effect: geweigerd', () => {
    const besluit = decideChange(
      { rel: TEST, change: { kind: 'write', after: TEST_TEKST.replace('toBe(1)', 'toBe(2)') }, agentType: 'developer' },
      ctx(),
    );
    expect(besluit.deny).not.toHaveLength(0);
  });

  test('samenhang-checks-rollen/AC-4 developer voegt een nieuwe test toe: toegestaan', () => {
    expect(write(TEST_NIEUW, TEST_TEKST, 'developer').deny).toStrictEqual([]);
  });

  test.each([
    ['hoofdsessie', undefined],
    ['tester', 'tester'],
  ])('samenhang-checks-rollen/AC-4 %s wijzigt een bestaande test: geen weigering', (_rol, agent) => {
    const besluit = edit(TEST, ['toBe(1)', 'toBe(2)'], agent);
    expect(besluit.deny).toStrictEqual([]);
  });
});
