import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Tekstchecks op de skill `security-review` en haar frontmatter. Dit bewijst niet dat `context: fork` runtime wordt
// afgedwongen; het legt vast dat de skill de reviewer-agent aanwijst en de gerichte controlepunten benoemt.
// Het schrijfloze toolgereedschap van de reviewer staat al in test/hooks/agents.test.ts.
const SKILL = '.claude/skills/security-review/SKILL.md';
const skill = existsSync(SKILL) ? readFileSync(SKILL, 'utf8') : '';
// Zinsdelen (gescheiden door ; of .), zodat een punt met meer beweringen per bewering wordt getoetst.
const parts = skill.split(/[;.\n]/);

// Bewust lokaal: testbestanden importeren niets van elkaar, dus dezelfde korte parser als in agents.test.ts.
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

describe('skill security-review: frontmatter', () => {
  test('wijst de reviewer-agent aan met context fork', () => {
    const meta = frontmatter(skill);

    expect([meta['context'], meta['agent']]).toStrictEqual(['fork', 'reviewer']);
  });

  test('de aangewezen agent heeft een bestand in .claude/agents', () => {
    const named = frontmatter(skill)['agent'] ?? '';

    expect(existsSync(`.claude/agents/${named}.md`)).toBe(true);
  });
});

describe('skill security-review: controlepunten', () => {
  test('behoudt de zeven bestaande punten', () => {
    for (const nummer of [1, 2, 3, 4, 5, 6, 7]) {
      expect(skill).toMatch(new RegExp(`^${String(nummer)}\\. `, 'm'));
    }
  });

  test.each([
    ['MFA en sessiesterkte (punt 8)', ['MFA_REQUIRED', 'SESSION_FRESH_SECONDS']],
    ['IDOR (punt 9)', ['IDOR']],
    ['audit (punt 10)', ['ctx.audit', 'app.audit_account_action']],
    ['rate limits (punt 11)', ['duur']],
    ['tokenflows (punt 12)', ['EMAIL_CHANGE_TTL_SECONDS', 'limits.ts']],
  ])('noemt %s', (_onderwerp, termen) => {
    for (const term of termen) {
      expect(skill).toContain(term);
    }
  });

  test('eenmalig staat bij uitnodiging of reset, niet bij de e-mailwijziging', () => {
    const eenmalig = parts.filter((part) => /eenmalig/i.test(part));

    expect(eenmalig.length).toBeGreaterThan(0);
    for (const part of eenmalig) {
      expect(part).toMatch(/uitnodiging|reset/i);
      expect(part).not.toMatch(/e-?mailwijziging/i);
    }
  });

  test('de e-mailwijziging is als herbruikbaar binnen de TTL benoemd', () => {
    const regel = parts.find((part) => /e-?mailwijziging/i.test(part)) ?? '';

    expect(regel).toMatch(/herbruikbaar/i);
  });
});

describe('skill security-review: onafhankelijkheid', () => {
  test('noemt de aparte reviewer-subagent', () => {
    expect(skill).toContain('aparte reviewer-subagent');
  });

  test('claimt niet dat de hoofdsessie nooit eigen werk beoordeelt als afdwinging', () => {
    expect(skill.length).toBeGreaterThan(0);
    expect(skill).not.toMatch(/beoordeelt nooit eigen werk/i);
  });
});
