import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, globMatch, loadConfig } from '../../.claude/hooks/lib/rolhek.mjs';

// Rolhek (framework §8, ADR 0011): per regel een echte payload met de verwachte beslissing, ook bekende omzeilingen.
// De schijf is nagebootst: FILES zijn bestaande bestanden, COMMITTED staat in HEAD.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const FILES: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'x', scripts: { lint: 'eslint .' }, dependencies: { a: '1' } }, null, 2),
  'src/api/routes/a.test.ts': "test('a', () => {});\ntest('b', () => {});\n",
  'db/migrations/20261009000000_baseline.sql': 'create table a();',
  'docs/specs/x.md': 'status: voorstel\n',
  'src/core/web/ui/button.tsx': 'export {}',
};
const DIRS = new Set(['src/core', 'src/core/web']);

function ctx(branch = 'feat/x') {
  return {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => FILES[rel] ?? null,
    committed: (rel: string) => rel in FILES,
    isDir: (rel: string) => DIRS.has(rel),
    branch,
  };
}

type Verdict = 'allow' | 'ask' | 'deny' | 'context';

function verdict(payload: unknown, branch?: string): Verdict {
  const decision = decide(payload, ctx(branch));
  if (decision.deny.length > 0) return 'deny';
  if (decision.ask.length > 0) return 'ask';
  return decision.context.length > 0 ? 'context' : 'allow';
}

const bash = (command: string, agent?: string) => ({
  tool_name: 'Bash',
  tool_input: { command },
  ...(agent === undefined ? {} : { agent_type: agent }),
});
const write = (file: string, content: string, agent?: string) => ({
  tool_name: 'Write',
  tool_input: { file_path: `${ROOT}/${file}`, content },
  ...(agent === undefined ? {} : { agent_type: agent }),
});
const edit = (file: string, [from, to]: [string, string], agent?: string) => ({
  tool_name: 'Edit',
  tool_input: { file_path: `${ROOT}/${file}`, old_string: from, new_string: to },
  ...(agent === undefined ? {} : { agent_type: agent }),
});

describe('bestanden: hoofdsessie', () => {
  test.each([
    { name: 'gewone code', payload: write('src/web/features/a/page.tsx', 'x'), expected: 'allow' },
    { name: 'beschermd pad → de eigenaar kiest', payload: write('src/core/web/ui/x.tsx', 'x'), expected: 'ask' },
    {
      name: 'nieuwe test is vrij',
      payload: write('src/api/routes/b.test.ts', "test('x', () => {});"),
      expected: 'allow',
    },
    { name: 'spec schrijven is vrij', payload: write('docs/specs/y.md', 'status: voorstel\n'), expected: 'allow' },
    { name: 'gegenereerd bestand', payload: write('src/api/db/schema.ts', 'x'), expected: 'deny' },
    { name: 'gecommitte migratie', payload: write('db/migrations/20261009000000_baseline.sql', 'x'), expected: 'deny' },
    { name: 'nieuwe migratie', payload: write('db/migrations/20261011000000_x.sql', 'x'), expected: 'allow' },
    { name: 'spec zelf goedkeuren', payload: edit('docs/specs/x.md', ['voorstel', 'goedgekeurd']), expected: 'deny' },
    { name: 'buiten de repo', payload: write('../elders.txt', 'x'), expected: 'allow' },
  ])('$name', ({ payload, expected }) => {
    expect(verdict(payload)).toBe(expected);
  });
});

describe('bestanden: package.json alleen op scripts', () => {
  test('een dependency wijzigen is geen gate (dat bewaakt `ask` op pnpm add)', () => {
    expect(verdict(edit('package.json', ['"a": "1"', '"a": "2"']))).toBe('allow');
  });
  test('scripts wijzigen: hoofdsessie ask, developer deny', () => {
    const payload = edit('package.json', ['"lint": "eslint ."', '"lint": "true"']);
    expect([verdict(payload), verdict({ ...payload, agent_type: 'developer' })]).toStrictEqual(['ask', 'deny']);
  });
});

describe('bestaande tests', () => {
  const file = 'src/api/routes/a.test.ts';
  test.each([
    { name: 'wijzigen → melden', payload: edit(file, ["test('a'", "test('aa'"]), expected: 'context' },
    { name: 'skippen', payload: edit(file, ["test('a'", "test.skip('a'"]), expected: 'ask' },
    { name: 'een geval weghalen', payload: edit(file, ["test('b', () => {});\n", '']), expected: 'ask' },
    { name: 'verwijderen via rm', payload: bash(`rm ${file}`), expected: 'ask' },
    { name: 'omzeiling: git rm', payload: bash(`git rm -q ${file}`), expected: 'ask' },
    { name: 'omzeiling: mv weg', payload: bash(`mv ${file} /tmp/a.ts`), expected: 'ask' },
    { name: 'developer skipt', payload: edit(file, ["test('a'", "test.skip('a'"], 'developer'), expected: 'deny' },
  ])('$name', ({ payload, expected }) => {
    expect(verdict(payload)).toBe(expected);
  });
});

describe('rollen', () => {
  test.each([
    { name: 'tester in testpad', payload: write('test/x.test.ts', 'x', 'tester'), expected: 'allow' },
    { name: 'tester in code', payload: write('src/api/x.ts', 'x', 'tester'), expected: 'deny' },
    {
      name: 'architect in spec',
      payload: write('docs/specs/z.md', 'status: voorstel', 'architect'),
      expected: 'allow',
    },
    { name: 'architect in code', payload: write('src/api/x.ts', 'x', 'architect'), expected: 'deny' },
    { name: 'docs in docs/', payload: write('docs/gouden-pad.md', 'x', 'docs'), expected: 'allow' },
    { name: 'reviewer schrijft niets', payload: write('docs/x.md', 'x', 'reviewer'), expected: 'deny' },
    { name: 'developer op beschermd pad', payload: write('src/core/x.ts', 'x', 'developer'), expected: 'deny' },
    {
      name: 'onbekende subagent telt als developer',
      payload: write('src/core/x.ts', 'x', 'Explore'),
      expected: 'deny',
    },
    { name: 'reviewer leest', payload: bash('git diff main...HEAD', 'reviewer'), expected: 'allow' },
    { name: 'reviewer draait checks', payload: bash('pnpm gate:fast', 'reviewer'), expected: 'allow' },
    { name: 'reviewer: gh pr view', payload: bash('gh pr view 12', 'reviewer'), expected: 'allow' },
    { name: 'reviewer: iets anders', payload: bash('node -e 1', 'reviewer'), expected: 'deny' },
    { name: 'reviewer: tweede commando', payload: bash('git status && touch a', 'reviewer'), expected: 'deny' },
  ])('$name', ({ payload, expected }) => {
    expect(verdict(payload)).toBe(expected);
  });
});

describe('Bash: schrijfdoelen', () => {
  test.each([
    { name: 'redirect naar beschermd pad', command: 'echo x > src/core/x.ts', expected: 'ask' },
    { name: 'redirect met aanhalingstekens', command: 'echo x > "src/core/x.ts"', expected: 'ask' },
    { name: 'append via tee', command: 'echo x | tee -a scripts/a.sh', expected: 'ask' },
    { name: 'sed -i', command: "sed -i 's/a/b/' AGENTS.md", expected: 'ask' },
    { name: 'cp naar een beschermde map', command: 'cp x.ts src/core/', expected: 'ask' },
    { name: 'git checkout -- pad', command: 'git checkout -- eslint.config.js', expected: 'ask' },
    {
      name: 'heredoc naar gegenereerd bestand',
      command: "cat > src/api/db/schema.ts <<'EOF'\nx\nEOF",
      expected: 'deny',
    },
    {
      name: 'heredoc-tekst is geen commando',
      command: "cat > notes.md <<'EOF'\nrm src/core/x.ts > AGENTS.md\nEOF",
      expected: 'allow',
    },
    { name: 'tweede commando na een leesvorm', command: 'cat AGENTS.md; echo x > AGENTS.md', expected: 'ask' },
    { name: 'naar /dev/null en stderr', command: 'pnpm lint > /dev/null 2>&1', expected: 'allow' },
    { name: 'gewoon lezen', command: 'cat src/core/web/ui/button.tsx | head', expected: 'allow' },
  ])('$name', ({ command, expected }) => {
    expect(verdict(bash(command))).toBe(expected);
  });
});

describe('Bash: altijd verboden', () => {
  test.each([
    { name: 'push naar main', command: 'git push origin main' },
    { name: 'push HEAD:main', command: 'git push origin HEAD:main' },
    { name: 'push refs/heads/main', command: 'git push origin +refs/heads/main' },
    { name: 'push --mirror', command: 'git push --mirror' },
    { name: '--no-verify', command: 'git commit --no-verify -m x' },
    { name: 'commit -n in een cluster', command: 'git commit -anm x' },
    { name: 'LEFTHOOK=0', command: 'LEFTHOOK=0 git commit -m x' },
    { name: 'export LEFTHOOK', command: 'export LEFTHOOK=0 && git commit -m x' },
    { name: 'core.hooksPath zetten', command: 'git config core.hooksPath /tmp' },
    { name: 'git -c core.hooksPath', command: 'git -c core.hooksPath=/dev/null commit -m x' },
    { name: 'gh pr review', command: 'gh pr review 12 --approve' },
    { name: 'label gate-wijziging', command: 'gh pr edit 12 --add-label gate-wijziging' },
    { name: 'gh api status zetten', command: 'gh api repos/o/r/statuses/abc -f state=success' },
    { name: 'gh api review', command: 'gh api -X POST repos/o/r/pulls/1/reviews' },
    {
      name: 'graphql-mutatie',
      command: "gh api graphql -f query='mutation { addPullRequestReview(input: {}) { clientMutationId } }'",
    },
  ])('$name', ({ command }) => {
    expect(verdict(bash(command))).toBe('deny');
  });

  test('push zonder refspec: verboden op main, toegestaan op een feature-branch', () => {
    expect([verdict(bash('git push'), 'main'), verdict(bash('git push'), 'feat/x')]).toStrictEqual(['deny', 'allow']);
  });

  test.each([
    { name: 'commit -m met "-n" in de tekst', command: 'git commit -m "fix -n bug"' },
    { name: 'core.hooksPath lezen', command: 'git config --get core.hooksPath' },
    { name: 'gh api lezen', command: 'gh api repos/o/r/pulls/1/reviews' },
    { name: 'push naar een feature-branch', command: 'git push -u origin feat/main-menu' },
    { name: 'gh pr view', command: 'gh pr view 12 --json labels' },
  ])('mag: $name', ({ command }) => {
    expect(verdict(bash(command))).toBe('allow');
  });
});

describe('Bash: alleen de hoofdsessie', () => {
  test.each([
    { name: 'push', command: 'git push -u origin feat/x' },
    { name: 'merge', command: 'git merge origin/main' },
    { name: 'rebase', command: 'git rebase main' },
    { name: 'reset --hard', command: 'git reset --hard HEAD~1' },
    { name: 'gh pr merge', command: 'gh pr merge 12 --squash' },
    // ADR 0016 (OV-4): de generator schrijft gate-bestanden niet, maar wel paden die het rolhek in een script niet ziet.
    { name: 'new:resource', command: 'pnpm new:resource invoices --rollen user' },
    { name: 'new:resource via run', command: 'pnpm run new:resource invoices' },
    { name: 'new:resource via node', command: 'node scripts/kit/new-resource.mjs invoices' },
  ])('subagent: $name verboden', ({ command }) => {
    expect([verdict(bash(command)), verdict(bash(command, 'developer'))]).toStrictEqual(['allow', 'deny']);
  });
});

test('globMatch: * binnen één map, ** over mappen heen', () => {
  expect([
    globMatch('src/core/**', 'src/core/web/ui/a.tsx'),
    globMatch('**/*.test.*', 'a.test.ts'),
    globMatch('**/*.test.*', 'src/a/b.test.tsx'),
    globMatch('tsconfig*.json', 'tsconfig.web.json'),
    globMatch('tsconfig*.json', 'src/tsconfig.json'),
    globMatch('compose*.yaml', 'compose.yaml'),
  ]).toStrictEqual([true, true, true, true, false, true]);
});

test('loadConfig: een ontbrekende sleutel is een fout (de hook faalt dan dicht)', () => {
  expect(() => loadConfig('{"gates": []}')).toThrow('testpaden');
});

// WS-06: MCP-tools onder het rolhek. Aanname: de leeslijst staat als `config.mcpLezen` (uit .claude/gates.json via loadConfig).
describe('MCP-tools (WS-06)', () => {
  const READ_ONLY = 'mcp__claude_ai_Vercel__list_projects';
  const mcp = (tool: string, agent?: string) => ({
    tool_name: tool,
    tool_input: {},
    ...(agent === undefined ? {} : { agent_type: agent }),
  });
  const withReadList = (payload: unknown): Verdict => {
    const base = ctx();
    const decision = decide(payload, { ...base, config: Object.assign({}, config, { mcpLezen: [READ_ONLY] }) });
    if (decision.deny.length > 0) return 'deny';
    return decision.ask.length > 0 ? 'ask' : 'allow';
  };

  test('gates.json: mcpLezen is standaard een lege lijst', () => {
    expect(Object.entries(config).find(([key]) => key === 'mcpLezen')?.[1]).toStrictEqual([]);
  });

  test.each([
    { name: 'developer', payload: mcp('mcp__Supabase__execute_sql', 'developer'), expected: 'deny' },
    { name: 'tester', payload: mcp('mcp__Supabase__execute_sql', 'tester'), expected: 'deny' },
    { name: 'reviewer', payload: mcp('mcp__Supabase__execute_sql', 'reviewer'), expected: 'deny' },
    { name: 'onbekende subagent', payload: mcp('mcp__Supabase__execute_sql', 'Explore'), expected: 'deny' },
    { name: 'hoofdsessie → de eigenaar kiest', payload: mcp('mcp__Supabase__execute_sql'), expected: 'ask' },
    {
      name: 'claude.ai-connector, subagent',
      payload: mcp('mcp__claude_ai_Supabase__apply_migration', 'developer'),
      expected: 'deny',
    },
    {
      name: 'plugin-server, hoofdsessie',
      payload: mcp('mcp__plugin_design_figma__get_screenshot'),
      expected: 'ask',
    },
  ])('niet in mcpLezen: $name', ({ payload, expected }) => {
    expect(verdict(payload)).toBe(expected);
    expect(withReadList(payload)).toBe(expected);
  });

  test.each([
    { name: 'hoofdsessie', payload: mcp(READ_ONLY) },
    { name: 'developer', payload: mcp(READ_ONLY, 'developer') },
    { name: 'tester', payload: mcp(READ_ONLY, 'tester') },
  ])('in mcpLezen: $name mag door', ({ payload }) => {
    expect(withReadList(payload)).toBe('allow');
  });

  test.each([
    { name: 'langere naam', tool: `${READ_ONLY}_and_delete` },
    { name: 'korter', tool: 'mcp__claude_ai_Vercel__list_project' },
    { name: 'andere tool, zelfde server', tool: 'mcp__claude_ai_Vercel__delete_project' },
  ])('exacte match: $tool ($name) is niet vrijgegeven', ({ tool }) => {
    expect([withReadList(mcp(tool)), withReadList(mcp(tool, 'developer'))]).toStrictEqual(['ask', 'deny']);
  });

  test('een gewone tool of een naam zonder mcp__-prefix wordt niet geraakt', () => {
    expect([verdict(mcp('Read', 'tester')), verdict(mcp('xmcp__a__b', 'tester'))]).toStrictEqual(['allow', 'allow']);
  });
});
