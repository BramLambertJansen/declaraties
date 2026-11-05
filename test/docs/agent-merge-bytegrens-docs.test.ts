import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence';

// Docs mee voor de bytegrens (spec agent-merge-bytegrens AC-5). Structuurtests op sleutelwoorden, geen hele zinnen; de
// bytemeting van het regelboek vóór en na staat in de PR.
const lees = (pad: string): string => readFileSync(pad, 'utf8');
const regel = (id: string): string =>
  lees('docs/framework.md')
    .split('\n')
    .find((r) => r.startsWith(`- **${id}** `)) ?? '';
/** Het kopcommentaar: de `//`-regels bovenaan het bestand. */
const kop = (pad: string): string => {
  const regels = lees(pad).split('\n');
  const einde = regels.findIndex((r) => !r.startsWith('//'));
  return regels.slice(0, einde === -1 ? undefined : einde).join('\n');
};
const SLEUTELS = /\bmax(?:Regels|Bytes)\b/;
const SLEUTEL_VORMEN: [string, ...string[]] = ['maxRegels', 'maxBytes', '`agentMerge.maxRegels`', '`agentMerge.maxBytes`'];

describe('agent-merge-bytegrens/AC-5 docs noemen de bytegrens', () => {
  test('agent-merge-bytegrens/AC-5: R-REPO-01 noemt de omvanggrens `agentMerge` zonder sleutelnamen', () => {
    const tekst = regel('R-REPO-01');
    expect(tekst).toMatch(/^- \*\*R-REPO-01\*\* /);
    expect(tekst).toMatch(/omvanggrens `agentMerge`/);
    expectAbsent(tekst, SLEUTELS, { recognizes: SLEUTEL_VORMEN, allows: ['agentMerge', 'omvanggrens'] });
  });

  test('agent-merge-bytegrens/AC-5: de $comment van .claude/gates.json noemt agentMerge.maxBytes', () => {
    const ruw: unknown = JSON.parse(lees('.claude/gates.json'));
    const comment: unknown = typeof ruw === 'object' && ruw !== null ? Reflect.get(ruw, '$comment') : undefined;
    expect(typeof comment).toBe('string');
    expect(String(comment)).toMatch(/`agentMerge\.maxBytes`/);
    expect(String(comment)).toMatch(/`agentMerge\.maxRegels`/);
  });

  test('agent-merge-bytegrens/AC-5: .claude/gates.json heeft "maxBytes": 40000 in agentMerge', () => {
    const ruw: unknown = JSON.parse(lees('.claude/gates.json'));
    const blok: unknown = typeof ruw === 'object' && ruw !== null ? Reflect.get(ruw, 'agentMerge') : undefined;
    expect(blok).toMatchObject({ maxBytes: 40000 });
    expect(lees('.claude/gates.json')).toMatch(/"maxBytes": 40000\b/);
  });

  test.each([['scripts/kit/agent-merge.mjs'], ['scripts/kit/diff-guard.mjs']])(
    'agent-merge-bytegrens/AC-5: het kopcommentaar van %s noemt de bytegrens',
    (pad) => {
      const tekst = kop(pad);
      expect(tekst.length).toBeGreaterThan(0);
      expect(tekst).toMatch(/agentMerge\.maxBytes/);
    },
  );

  test.each([['docs/operations/agent-doorloop.md'], ['.claude/skills/opleveren/SKILL.md']])(
    'agent-merge-bytegrens/AC-5: %s krijgt geen tekst over de bytegrens',
    (pad) => {
      expectAbsent(lees(pad), /maxBytes|bytegrens/i, {
        recognizes: ['maxBytes', '`agentMerge.maxBytes`', 'bytegrens', 'Bytegrens'],
        allows: ['bytes', 'omvanggrens'],
      });
    },
  );
});
