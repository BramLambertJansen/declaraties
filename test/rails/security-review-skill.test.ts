import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// De security-review draait als geforkte, read-only subagent met schone context (framework §8, ADR 0045).
const SKILL = '.claude/skills/security-review/SKILL.md';
const AGENT = '.claude/agents/reviewer.md';
const skill = existsSync(SKILL) ? readFileSync(SKILL, 'utf8') : '';
const agent = existsSync(AGENT) ? readFileSync(AGENT, 'utf8') : '';

function frontmatter(text: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  return Object.fromEntries(
    block
      .split('\n')
      .map((line) => /^([\w-]+):\s*(.*)$/.exec(line))
      .filter((match) => match !== null)
      .map((match) => [match[1] ?? '', match[2] ?? '']),
  );
}

describe('skill security-review: geforkte reviewer', () => {
  test('frontmatter: context fork en agent reviewer', () => {
    const meta = frontmatter(skill);

    expect([meta['context'], meta['agent']]).toStrictEqual(['fork', 'reviewer']);
  });

  test('de agent reviewer bestaat en heeft geen schrijftools', () => {
    expect(existsSync(AGENT)).toBe(true);
    expect(frontmatter(agent)['tools']).toBeDefined();
    expect(frontmatter(agent)['tools']).not.toMatch(/\b(Write|Edit|MultiEdit|NotebookEdit)\b/);
  });

  test('de skill noemt een bestaande agent', () => {
    const named = frontmatter(skill)['agent'] ?? '';

    expect(existsSync(`.claude/agents/${named}.md`)).toBe(true);
  });

  test.each([
    ['MFA of sessiesterkte', /mfa/i],
    ['IDOR', /idor/i],
    ['audit-regels', /audit/i],
    ['rate limits', /rate.?limit/i],
    ['tokenflows', /token/i],
  ])('behandelt %s', (_onderwerp, patroon) => {
    expect(skill).toMatch(patroon);
  });

  test('behoudt de zeven bestaande controlepunten', () => {
    for (const nummer of [1, 2, 3, 4, 5, 6, 7]) {
      expect(skill).toMatch(new RegExp(`^${String(nummer)}\\. `, 'm'));
    }
  });

  test('onafhankelijk of schone context: de hoofdsessie beoordeelt zijn eigen werk niet', () => {
    expect(skill).toMatch(/onafhankelijk|schone context/i);
  });
});
