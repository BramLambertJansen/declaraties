import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../.claude/hooks/lib/rolhek.mjs';

// WS-02: railgaten dichten. Hulpbestanden in testpaden (fixtures, setup, harnesses), configs die checks bepalen
// en de docs-rol die geen gate-paden mag schrijven. Laadt de echte .claude/gates.json: faalt tot die is bijgewerkt.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const FILES: Record<string, string> = {
  'test/rails/fixtures/secdef/goed.sql': 'create function f() returns void;\n',
  'test/setup/git-env.ts': 'export const env = {};\n',
  'test/setup/git-env.test.ts': "test('a', () => {});\ntest('b', () => {});\n",
  'test/rails/fixtures/depcruise/src/api/testing.int.test.ts': "test('x', () => {});\n",
  'test/rails/check-docs-schrijfrecht.test.ts': "test('a', () => {});\ntest('b', () => {});\n",
  'test/api/account-harness.ts': 'export const harness = 1;\n',
  'e2e/support/login.ts': 'export const login = 1;\n',
  'vitest.config.ts': 'export default {};\n',
  'docs/framework.md': '# Framework\n',
  'docs/reviews/x.md': '# x\n',
};

function run(payload: unknown) {
  return decide(payload, {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => FILES[rel] ?? null,
    committed: (rel: string) => rel in FILES,
    isDir: () => false,
    branch: 'feat/x',
  });
}

type Verdict = 'allow' | 'ask' | 'deny' | 'context';
function verdict(payload: unknown): Verdict {
  const decision = run(payload);
  if (decision.deny.length > 0) return 'deny';
  if (decision.ask.length > 0) return 'ask';
  return decision.context.length > 0 ? 'context' : 'allow';
}

const as = (agent: string | undefined) => (agent === undefined ? {} : { agent_type: agent });
const bash = (command: string, agent?: string) => ({ tool_name: 'Bash', tool_input: { command }, ...as(agent) });
const write = (file: string, content: string, agent?: string) => ({
  tool_name: 'Write',
  tool_input: { file_path: `${ROOT}/${file}`, content },
  ...as(agent),
});
const edit = (file: string, [from, to]: [string, string], agent?: string) => ({
  tool_name: 'Edit',
  tool_input: { file_path: `${ROOT}/${file}`, old_string: from, new_string: to },
  ...as(agent),
});

describe('WS-02: fixtures en setup zijn een gate (hoofdsessie ask, subagent deny)', () => {
  const fixture = 'test/rails/fixtures/secdef/goed.sql';
  test.each([
    { name: 'fixture wijzigen, developer', payload: edit(fixture, ['void', 'int'], 'developer'), expected: 'deny' },
    { name: 'fixture wijzigen, tester', payload: edit(fixture, ['void', 'int'], 'tester'), expected: 'deny' },
    { name: 'fixture wijzigen, hoofdsessie', payload: edit(fixture, ['void', 'int']), expected: 'ask' },
    { name: 'fixture verwijderen, tester', payload: bash(`rm ${fixture}`, 'tester'), expected: 'deny' },
    { name: 'fixture verwijderen, hoofdsessie', payload: bash(`rm ${fixture}`), expected: 'ask' },
    {
      name: 'setup wijzigen, tester',
      payload: edit('test/setup/git-env.ts', ['{}', '{ a: 1 }'], 'tester'),
      expected: 'deny',
    },
    {
      name: 'setup wijzigen, hoofdsessie',
      payload: edit('test/setup/git-env.ts', ['{}', '{ a: 1 }']),
      expected: 'ask',
    },
    {
      name: 'Bash sed -i op setup, developer',
      payload: bash("sed -i 's/env/other/' test/setup/git-env.ts", 'developer'),
      expected: 'deny',
    },
    {
      name: 'Bash redirect naar fixture, developer',
      payload: bash(`echo x > ${fixture}`, 'developer'),
      expected: 'deny',
    },
  ])('$name → $expected', ({ payload, expected }) => {
    expect(verdict(payload)).toBe(expected);
  });

  test('een nieuwe fixture toevoegen blijft vrij (regressiebewaker)', () => {
    expect(verdict(write('test/rails/fixtures/secdef/nieuw.sql', 'x', 'tester'))).toBe('allow');
  });
});

describe('WS-02: overige hulpbestanden', () => {
  const harness = 'test/api/account-harness.ts';
  test('verwijderen via rm: tester deny, hoofdsessie ask', () => {
    expect([verdict(bash(`rm ${harness}`, 'tester')), verdict(bash(`rm ${harness}`))]).toStrictEqual(['deny', 'ask']);
  });

  test('e2e/support verwijderen is ook een gate', () => {
    expect(verdict(bash('rm e2e/support/login.ts', 'tester'))).toBe('deny');
  });

  test('wijzigen mag, met de melding "hulpbestand gewijzigd"', () => {
    const decision = run(edit(harness, ['harness = 1', 'harness = 2'], 'tester'));

    expect(decision.deny).toStrictEqual([]);
    expect(decision.ask).toStrictEqual([]);
    expect(decision.context.join('\n')).toContain('hulpbestand gewijzigd');
  });

  test('e2e/support wijzigen mag, met dezelfde melding', () => {
    const decision = run(edit('e2e/support/login.ts', ['login = 1', 'login = 2'], 'tester'));

    expect(decision.deny).toStrictEqual([]);
    expect(decision.context.join('\n')).toContain('hulpbestand gewijzigd');
  });

  test('een nieuw hulpbestand toevoegen is vrij, zonder melding', () => {
    const decision = run(write('test/api/nieuw-harness.ts', 'export {};\n', 'tester'));

    expect([decision.deny, decision.ask, decision.context]).toStrictEqual([[], [], []]);
  });

  test('regressie: een gewoon bestaand testbestand buiten fixtures/setup wijzigen blijft een melding, geen deny', () => {
    const decision = run(edit('test/rails/check-docs-schrijfrecht.test.ts', ["test('a'", "test('aa'"], 'tester'));

    expect(decision.deny).toStrictEqual([]);
    expect(decision.ask).toStrictEqual([]);
    expect(decision.context.join('\n')).toContain('bestaande test');
    expect(decision.context.join('\n')).not.toContain('hulpbestand gewijzigd');
  });
});

describe('WS-02 follow-up: een fixture met een testbestandnaam is ook vergrendeld', () => {
  const locked = 'test/rails/fixtures/depcruise/src/api/testing.int.test.ts';
  const change: [string, string] = ["test('x'", "test('y'"];
  test.each([
    { name: 'Edit door developer', payload: edit(locked, change, 'developer'), expected: 'deny' },
    { name: 'Edit door tester', payload: edit(locked, change, 'tester'), expected: 'deny' },
    { name: 'Edit door hoofdsessie', payload: edit(locked, change), expected: 'ask' },
    { name: 'rm via Bash door tester', payload: bash(`rm ${locked}`, 'tester'), expected: 'deny' },
    { name: 'rm via Bash door hoofdsessie', payload: bash(`rm ${locked}`), expected: 'ask' },
    {
      name: 'Edit op setup/git-env.test.ts door tester (setup is vergrendeld)',
      payload: edit('test/setup/git-env.test.ts', ["test('a'", "test('aa'"], 'tester'),
      expected: 'deny',
    },
    {
      name: 'Write van een nieuw testbestand in fixtures is vrij',
      payload: write('test/rails/fixtures/x/nieuw.test.ts', "test('n', () => {});\n", 'tester'),
      expected: 'allow',
    },
  ])('$name → $expected', ({ payload, expected }) => {
    expect(verdict(payload)).toBe(expected);
  });
});

describe('WS-02: configs zijn een gate', () => {
  test.each([
    'vitest.config.ts',
    'playwright.config.ts',
    'vite.config.ts',
    '.prettierrc.json',
    '.prettierignore',
    'Dockerfile',
    '.dockerignore',
    'db/test.env',
    'docs/nieuwe-app.md',
  ])('%s: developer deny, hoofdsessie ask', (file) => {
    expect([verdict(write(file, 'x', 'developer')), verdict(write(file, 'x'))]).toStrictEqual(['deny', 'ask']);
  });

  test('Edit door developer op vitest.config.ts → deny', () => {
    expect(verdict(edit('vitest.config.ts', ['{}', '{ a: 1 }'], 'developer'))).toBe('deny');
  });
});

describe('WS-02: de docs-rol schrijft geen gate-paden', () => {
  test.each([
    { file: 'docs/framework.md', expected: 'deny' },
    { file: 'docs/dod.md', expected: 'deny' },
    { file: 'docs/roadmap.md', expected: 'deny' },
    { file: 'docs/adr/0001-x.md', expected: 'deny' },
    { file: 'docs/specs/a.md', expected: 'deny' },
    { file: 'docs/nieuwe-app.md', expected: 'deny' },
    { file: 'docs/reviews/x.md', expected: 'allow' },
    { file: 'docs/operations/runbook.md', expected: 'allow' },
    { file: 'docs/README.md', expected: 'allow' },
    { file: 'docs/gouden-pad.md', expected: 'allow' },
    { file: 'README.md', expected: 'allow' },
    { file: 'CHANGELOG.md', expected: 'allow' },
  ])('docs schrijft $file → $expected', ({ file, expected }) => {
    const payload =
      file === 'docs/framework.md' ? edit(file, ['# Framework', '# F'], 'docs') : write(file, 'x', 'docs');
    expect(verdict(payload)).toBe(expected);
  });
});
