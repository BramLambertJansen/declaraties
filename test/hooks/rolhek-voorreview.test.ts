import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../.claude/hooks/lib/rolhek.mjs';

// ADR 0029 punt 9 (stap 7): het rolhek vraagt (hoofdsessie ask, developer deny) alleen nog op paden in `voorReview`
// (.claude/gates.json). Op de andere gate-paden is de schrijfactie toegestaan, met een melding "beschermd pad ... noem het
// in de PR". Migraties, gegenereerde bestanden, bestaande tests en de andere rollen blijven ongewijzigd.
// Laadt de echte .claude/gates.json: faalt tot `voorReview` er staat.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const FILES: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'x', scripts: { lint: 'eslint .' }, dependencies: { a: '1' } }, null, 2),
  'db/migrations/20261009000000_baseline.sql': 'create table a();',
  'src/api/routes/a.test.ts': "test('a', () => {});\ntest('b', () => {});\n",
  'test/rails/fixtures/secdef/goed.sql': 'create function f() returns void;\n',
  'docs/adr/0001-x.md': '# x\n',
  'src/core/web/ui/button.tsx': 'export {}',
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

const BUITEN_VOOR_REVIEW = [
  'docs/adr/0099-x.md',
  'docs/roadmap.md',
  'docs/nieuwe-app.md',
  'src/api/kit.ts',
  'src/api/server.ts',
  'src/api/env.ts',
  'deploy/x/y.ts',
  'renovate.json',
  '.gitattributes',
  'src/core/web/ui/x.tsx',
];

const IN_VOOR_REVIEW = [
  'scripts/kit/x.mjs',
  '.claude/gates.json',
  '.claude/hooks/lib/x.mjs',
  '.github/workflows/x.yml',
  'tsconfig.json',
  'tsconfig.build.json',
  '.env.example',
  'AGENTS.md',
  'docs/framework.md',
  'vite.config.ts',
  'eslint.config.js',
  'Dockerfile',
  'pnpm-lock.yaml',
  '.kit/baseline.json',
  'db/init/x.sql',
];

describe('gate-pad buiten voorReview: toegestaan met melding (hoofdsessie en developer)', () => {
  test.each(BUITEN_VOOR_REVIEW.flatMap((file) => [[file, undefined] as const, [file, 'developer'] as const]))(
    '%s (%s): geen ask of deny, wel de melding',
    (file, agent) => {
      const decision = run(write(file, 'x', agent));

      expect([decision.deny, decision.ask]).toStrictEqual([[], []]);
      const melding = decision.context.join('\n');
      expect(melding).toContain('beschermd pad');
      expect(melding).toContain('noem het in de PR');
    },
  );

  test('Edit op een bestaand pad buiten voorReview (docs/adr) volgt dezelfde regel', () => {
    const decision = run(edit('docs/adr/0001-x.md', ['# x', '# y']));

    expect([decision.deny, decision.ask]).toStrictEqual([[], []]);
    expect(decision.context.join('\n')).toContain('noem het in de PR');
  });

  test.each([
    { command: 'echo x > deploy/a.ts', agent: undefined },
    { command: 'echo x > deploy/a.ts', agent: 'developer' },
    { command: 'echo {} > renovate.json', agent: undefined },
    { command: "sed -i 's/a/b/' docs/roadmap.md", agent: undefined },
  ])('Bash $command ($agent): geen ask of deny', ({ command, agent }) => {
    expect(['context', 'allow']).toContain(verdict(bash(command, agent)));
    expect(run(bash(command, agent)).context.join('\n')).toContain('beschermd pad');
  });
});

// ADR 0029 punt 18: geen gate meer, dus ook geen gate-melding.
describe('src/api/app.ts en src/shared/permissions.ts: geen gate meer', () => {
  test.each(
    ['src/api/app.ts', 'src/shared/permissions.ts'].flatMap((f) => [
      [f, undefined] as const,
      [f, 'developer'] as const,
    ]),
  )('%s (%s): geen ask, deny of melding', (file, agent) => {
    const decision = run(write(file, 'x', agent));

    expect([decision.deny, decision.ask]).toStrictEqual([[], []]);
    expect(decision.context.join('\n')).not.toContain('beschermd pad');
  });
});

describe('gate-pad in voorReview: ongewijzigd (hoofdsessie ask, developer deny)', () => {
  test.each(IN_VOOR_REVIEW)('%s', (file) => {
    expect([verdict(write(file, 'x')), verdict(write(file, 'x', 'developer'))]).toStrictEqual(['ask', 'deny']);
  });

  test('package.json: de scripts-sleutel wijzigen blijft een gate', () => {
    const payload = (agent?: string) => edit('package.json', ['"lint": "eslint ."', '"lint": "true"'], agent);

    expect([verdict(payload()), verdict(payload('developer'))]).toStrictEqual(['ask', 'deny']);
  });

  test('package.json: een dependency wijzigen is geen gate', () => {
    expect(verdict(edit('package.json', ['"a": "1"', '"a": "2"']))).toBe('allow');
  });

  test.each([
    { command: 'echo x > scripts/a.sh', expected: ['ask', 'deny'] },
    { command: 'echo x > tsconfig.json', expected: ['ask', 'deny'] },
  ])('Bash $command', ({ command, expected }) => {
    expect([verdict(bash(command)), verdict(bash(command, 'developer'))]).toStrictEqual(expected);
  });
});

describe('ongewijzigd: migraties, gegenereerde bestanden, bestaande tests, fixtures', () => {
  test.each([
    { name: 'gecommitte migratie wijzigen', payload: edit('db/migrations/20261009000000_baseline.sql', ['a', 'b']) },
    { name: 'gegenereerd bestand schrijven', payload: write('src/api/db/schema.ts', 'x') },
    { name: 'bestaande test verwijderen', payload: bash('rm src/api/routes/a.test.ts') },
    {
      name: 'testgevallen weghalen',
      payload: write('src/api/routes/a.test.ts', "test('a', () => {});\n"),
    },
    { name: 'fixture wijzigen', payload: edit('test/rails/fixtures/secdef/goed.sql', ['void', 'int']) },
  ])('$name: hoofdsessie vraagt of weigert nog steeds, developer weigert', ({ payload }) => {
    expect(['ask', 'deny']).toContain(verdict(payload));
    expect(verdict({ ...payload, agent_type: 'developer' })).toBe('deny');
  });
});

describe('andere rollen: schrijfrecht ongewijzigd', () => {
  test.each([
    { agent: 'architect', file: 'docs/adr/0099-x.md', expected: 'allow' },
    { agent: 'architect', file: 'docs/specs/y.md', expected: 'allow' },
    { agent: 'architect', file: 'src/core/web/ui/x.tsx', expected: 'deny' },
    { agent: 'architect', file: 'deploy/x/y.ts', expected: 'deny' },
    { agent: 'tester', file: 'docs/adr/0099-x.md', expected: 'deny' },
    { agent: 'tester', file: 'deploy/x/y.ts', expected: 'deny' },
    { agent: 'tester', file: 'src/api/routes/b.test.ts', expected: 'allow' },
    { agent: 'reviewer', file: 'docs/adr/0099-x.md', expected: 'deny' },
    { agent: 'docs', file: 'docs/adr/0099-x.md', expected: 'deny' },
    { agent: 'docs', file: 'docs/roadmap.md', expected: 'deny' },
    { agent: 'docs', file: 'docs/reviews/x.md', expected: 'allow' },
  ])('$agent schrijft $file → $expected', ({ agent, file, expected }) => {
    expect(verdict(write(file, 'x', agent))).toBe(expected);
  });
});
