import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// De vijf rollen en de skills (framework §8, ADR 0011): vaste frontmatter, zodat de werkstraat niet ongemerkt verschuift.
// Schrijfrecht per rol bepaalt het rolhek (.claude/gates.json), niet de tools-lijst; alleen de reviewer is hier beperkt.
function frontmatter(file: string): Record<string, string> {
  const text = readFileSync(file, 'utf8');
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  return Object.fromEntries(
    block
      .split('\n')
      .map((line) => /^([\w-]+):\s*(.*)$/.exec(line))
      .filter((match) => match !== null)
      .map((match) => [match[1] ?? '', match[2] ?? '']),
  );
}

const ROLES = { architect: 'opus', developer: 'inherit', tester: 'sonnet', reviewer: 'opus', docs: 'sonnet' } as const;

describe('subagents', () => {
  test('precies de vijf rollen uit framework §8', () => {
    expect(
      readdirSync('.claude/agents')
        .filter((file) => file.endsWith('.md'))
        .sort(),
    ).toStrictEqual(
      Object.keys(ROLES)
        .map((role) => `${role}.md`)
        .sort(),
    );
  });

  test.each(Object.entries(ROLES))('%s: name, model %s, maxTurns en "eerst de feiten"', (role, model) => {
    const meta = frontmatter(`.claude/agents/${role}.md`);

    expect([meta['name'], meta['model'], Number(meta['maxTurns']) > 0]).toStrictEqual([role, model, true]);
    expect(readFileSync(`.claude/agents/${role}.md`, 'utf8')).toMatch(/Begin met de feiten/);
  });

  test('reviewer: alleen lezen (Read, Grep, Glob, Bash) en het rapport onder "## Bevindingen" (SubagentStop-hook)', () => {
    expect(frontmatter('.claude/agents/reviewer.md')['tools']).toBe('Read, Grep, Glob, Bash');
    expect(readFileSync('.claude/agents/reviewer.md', 'utf8')).toContain('## Bevindingen');
  });
});

// WS-06: MCP-tools zijn voor deze rollen uit het gereedschap gehaald (naast het rolhek, dat subagent-MCP weigert).
describe('subagents: geen MCP (WS-06)', () => {
  test.each(['tester', 'docs', 'architect'])('%s: disallowedTools bevat mcp__*', (role) => {
    const list = (frontmatter(`.claude/agents/${role}.md`)['disallowedTools'] ?? '')
      .split(',')
      .map((tool) => tool.trim());

    expect(list).toContain('mcp__*');
  });
});

describe('skills', () => {
  const skills = readdirSync('.claude/skills', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  test('de skills uit de roadmap (zonder release: fase 3)', () => {
    expect(skills.sort()).toStrictEqual(
      ['migratie', 'nieuw-component', 'nieuw-route', 'nieuw-scherm', 'opleveren', 'security-review', 'spec'].sort(),
    );
  });

  test.each(skills)('%s: naam, beschrijving en de live feiten via !-injectie', (skill) => {
    const meta = frontmatter(`.claude/skills/${skill}/SKILL.md`);

    expect([meta['name'], (meta['description'] ?? '').length > 20]).toStrictEqual([skill, true]);
    expect(readFileSync(`.claude/skills/${skill}/SKILL.md`, 'utf8')).toContain('!`node scripts/kit/feiten.mjs');
  });
});
