import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence';

// Regelboek, skill en gebouwde spec voor de agent-merge zonder Codex-tegoed (ADR 0069 herzien, spec agent-merge-zonder-codex
// AC-7, AC-8). Structuurtests op sleutelwoorden, geen hele zinnen. De bytemeting tegen main staat in de PR (AC-7).
const lees = (pad: string): string => readFileSync(pad, 'utf8');
const regel = (id: string): string =>
  lees('docs/framework.md')
    .split('\n')
    .find((r) => r.startsWith(`- **${id}** `)) ?? '';

describe('agent-merge-zonder-codex/AC-7 regelboek en skill', () => {
  test('agent-merge-zonder-codex/AC-7 R-REPO-01 noemt de omvanggrens naast de toegestane lijst', () => {
    const tekst = regel('R-REPO-01');
    expect(tekst).toMatch(/toegestane lijst `agentMerge`/);
    expect(tekst).toMatch(/omvanggrens `agentMerge\.maxRegels`/);
  });

  test('agent-merge-zonder-codex/AC-7 R-ROL-10 noemt Codex niet', () => {
    const tekst = regel('R-ROL-10');
    expect(tekst).toMatch(/^- \*\*R-ROL-10\*\* /);
    expectAbsent(tekst, /codex/i, { recognizes: ['Codex', 'codex', '`agentMerge.codex`', '@codex review', 'CODEX'] });
  });

  test('agent-merge-zonder-codex/AC-7 skill opleveren, Mergen stap 3: spoor, vragen, niet ontwijken, steekproef, terugval', () => {
    const skill = lees('.claude/skills/opleveren/SKILL.md');
    const mergen = skill.slice(skill.indexOf('## Mergen'), skill.indexOf('## Opruimen'));
    const stap3 = mergen.slice(mergen.indexOf('\n3. '), mergen.indexOf('\n4. '));
    expect(stap3).toMatch(/afgeronde review op de PR of een niet-gemergde PR van zijn branch/);
    expect(stap3).toMatch(/`@codex review` op de nieuwe head/);
    expect(stap3).toMatch(/Zonder spoor: geen extra review, niet ontwijken \(draft, commentaar weghalen\)/);
    expect(stap3).toMatch(/"steekproef"/);
    expect(mergen).toMatch(/geen `pr:merge` meer \(ADR 0069 punt 5\)/);
  });
});

describe('agent-merge-zonder-codex/AC-8 gebouwde spec agent-merge-niet-kritiek', () => {
  const spec = lees('docs/specs/agent-merge-niet-kritiek.md');
  const ac = (n: number): string => {
    const start = spec.indexOf(`- **agent-merge-niet-kritiek/AC-${String(n)}**`);
    const einde = spec.indexOf('\n- **', start + 1);
    return spec.slice(start, einde === -1 ? undefined : einde);
  };

  test('agent-merge-zonder-codex/AC-8 status blijft gebouwd', () => {
    expect(spec).toMatch(/^status: gebouwd\b/m);
  });

  test.each([
    [1, /agentMerge\.maxRegels/],
    [3, /"indien-aanwezig"/],
    [3, /agentMerge\.maxRegels/],
    [5, /maxRegels/],
  ])('agent-merge-zonder-codex/AC-8 AC-%i noemt %s en verwijst naar de nieuwe spec', (n, patroon) => {
    expect(ac(n)).toMatch(patroon);
    expect(ac(n)).toMatch(/\(agent-merge-zonder-codex\.md\)/);
  });
});
