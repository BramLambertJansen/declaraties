import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('de componentskill belooft geen catalogusuitzondering die de verplichte dekking tegenspreekt', () => {
  const skill = readFileSync('.claude/skills/nieuw-component/SKILL.md', 'utf8');
  const coverage = skill.split('\n').find((line) => line.startsWith('3. '));
  expect(coverage).not.toContain('of een uitzondering');
  expect(coverage).toContain('elk component en elke eindige variant');
});
