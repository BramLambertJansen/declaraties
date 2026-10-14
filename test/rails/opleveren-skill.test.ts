import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// ADR 0030 punten 1, 7 (PR 1) en 8: de skill `opleveren`, framework §8 stap 6 en CLAUDE.md.
const SKILL = '.claude/skills/opleveren/SKILL.md';
const skill = existsSync(SKILL) ? readFileSync(SKILL, 'utf8') : '';
const framework = readFileSync('docs/framework.md', 'utf8');
const claude = readFileSync('CLAUDE.md', 'utf8');

function step6(): string {
  const start = framework.indexOf('6. **Opleveren**');
  const end = framework.indexOf('7. **Eigenaar**');
  return start === -1 || end === -1 ? '' : framework.slice(start, end);
}

describe('skill opleveren', () => {
  test('bestaat met frontmatter name en description', () => {
    expect(existsSync(SKILL)).toBe(true);
    const front = /^---\n([\s\S]*?)\n---/.exec(skill)?.[1] ?? '';
    expect(front).toMatch(/^name: opleveren$/m);
    expect(front).toMatch(/^description: \S.{10,}/m);
  });

  test.each([
    'pnpm pr:verify',
    '--watch',
    'gh run view',
    '--log-failed',
    'Opruimen',
    'state',
    'mergedAt',
    'git merge --ff-only origin/main',
    'git branch -D',
    'git push origin --delete',
  ])('noemt %s', (term) => {
    expect(skill).toContain(term);
  });

  test('geen --json merged (het veld bestaat niet in gh)', () => {
    expect(skill.length).toBeGreaterThan(0);
    expect(skill).not.toMatch(/--json[^\n]*\bmerged\b(?!At)/);
  });

  test.each([
    { name: 'afzwakken', pattern: /afzwak/i },
    { name: 'drie keer dezelfde fout', pattern: /drie keer/i },
    { name: 'oorzaak buiten de code', pattern: /buiten de code/i },
    { name: 'gate-pad', pattern: /gate-pad/i },
  ])('stopgrond: $name', ({ pattern }) => {
    expect(skill).toMatch(pattern);
  });

  test('bij modus eigenaar blijft mergen bij de eigenaar', () => {
    expect(skill).toMatch(/eigenaar/);
    expect(skill).toMatch(/merget?[^\n]*eigenaar|eigenaar[^\n]*merget?/i);
  });
});

describe('framework §8 stap 6 en CLAUDE.md', () => {
  test('stap 6 beschrijft de CI-lus tot groen met pr:verify en het opruimen', () => {
    const text = step6();
    expect(text).toContain('pnpm pr:verify');
    expect(text).toMatch(/tot groen/);
    expect(text).toMatch(/opruimen/i);
    expect(text).toContain('opleveren');
  });

  test('CLAUDE.md: CI-lus is uitgezonderd van "na twee mislukte correctiepogingen"', () => {
    const line = claude.split('\n').find((l) => l.includes('twee mislukte correctiepogingen')) ?? '';
    const around = claude.slice(claude.indexOf(line), claude.indexOf(line) + 600);
    expect(around).toMatch(/CI-lus/);
    expect(around).toMatch(/uitzondering|behalve/i);
  });

  test('docs/framework.md bevat nergens meer --json merged', () => {
    expect(framework).not.toMatch(/--json\s+[^\s`]*\bmerged\b(?!At)/);
  });
});
