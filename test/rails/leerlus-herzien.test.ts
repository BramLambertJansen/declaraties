import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Spec leerlus-herzien AC-6 en AC-7 (ADR 0081): het signaal en de vorm in skill, reviewer, PR-sjabloon en voorsortering.
// Op structuur (R-TEST-02): plek, koppen en hun volgorde, regelvorm, bak en ADR-verwijzing; geen hele zinnen.
const PLEK = 'Schrappen of vereenvoudigen';
const skill = readFileSync('.claude/skills/opleveren/SKILL.md', 'utf8');
const reviewer = readFileSync('.claude/agents/reviewer.md', 'utf8');
const prSjabloon = readFileSync('.github/pull_request_template.md', 'utf8');
const prompt = readFileSync('docs/operations/leerpunten-voorsorteren.md', 'utf8');

/** Stap 8 van `opleveren` tot de volgende genummerde stap of kop. */
function stap8(tekst: string): string {
  const start = tekst.search(/^8\. Leerpunt/m);
  if (start === -1) return '';
  const rest = tekst.slice(start);
  const einde = rest.slice(1).search(/^(\d+\.|#+) /m);
  return einde === -1 ? rest : rest.slice(0, einde + 1);
}

describe('leerlus-herzien/AC-6 signaal en vorm', () => {
  const stap = stap8(skill);

  test('leerlus-herzien/AC-6: stap 8 noemt ADR 0081, de plek en de drie delen van de onderbouwing', () => {
    expect(stap).not.toBe('');
    expect(stap).toContain('ADR 0081');
    expect(stap).toContain(PLEK);
    for (const deel of ['Meting:', 'Overname:', 'Terugval:']) expect(stap).toContain(deel);
  });

  test('leerlus-herzien/AC-6: in het CLI-blok volgt ### Onderbouwing direct op ### Voorstel voor de plek', () => {
    const koppen = [...stap.matchAll(/^\s*### (.+?)\s*$/gm)].map((m) => m[1] ?? '');
    const plek = koppen.indexOf('Voorstel voor de plek');
    expect(plek).toBeGreaterThanOrEqual(0);
    expect(koppen[plek + 1]).toBe('Onderbouwing');
    const regelNaPlek =
      stap.split('\n')[stap.split('\n').findIndex((r) => r.trim() === '### Voorstel voor de plek') + 1];
    expect(regelNaPlek).toContain(PLEK);
  });

  test('leerlus-herzien/AC-6: de regelvorm bewijs meting: staat in stap 8 en in het PR-sjabloon', () => {
    const regelvorm = `trede ${PLEK}; bewijs meting: <voor> → <na> (<bron>)`;
    expect(stap).toContain(`bewijs meting: <voor> → <na> (<bron>)`);
    expect(prSjabloon).toContain(`- #<nr>: ${regelvorm}`);
    expect(prSjabloon).toContain(
      '- #<nr>: trede <Type|Check|Gouden pad of generator|Skill|Padregel|AGENTS.md>; bewijs <testpad>',
    );
  });

  test('leerlus-herzien/AC-6: de reviewer noemt de plek met ADR 0081', () => {
    expect(reviewer).toContain(`plek \`${PLEK}\``);
    expect(reviewer).toContain('ADR 0081');
  });
});

describe('leerlus-herzien/AC-7 de voorsortering', () => {
  const stappen = prompt.split(/^## Prompt$/m)[1] ?? '';
  const bakken = [...stappen.matchAll(/^ {3}- \*\*(.+?)\*\*/gm)].map((m) => m[1] ?? '');

  test('leerlus-herzien/AC-7: stap 1 linkt naar ADR 0081', () => {
    const stap1 = /^1\. [\s\S]*?(?=^2\. )/m.exec(stappen)?.[0] ?? '';
    expect(stap1).toContain('(../adr/0081-leerlus-schrappen-en-vereenvoudigen.md)');
  });

  test('leerlus-herzien/AC-7: een eigen bak vóór Klein', () => {
    expect(bakken).toContain(PLEK);
    expect(bakken.indexOf(PLEK)).toBeLessThan(bakken.indexOf('Klein'));
  });

  test('leerlus-herzien/AC-7: de stap CI-duur noemt main, zeven dagen, drie jobs en 20 procent', () => {
    const ci = /^\d+\. CI-duur[\s\S]*?(?=^\d+\. )/m.exec(stappen)?.[0] ?? '';
    for (const woord of ['`main`', 'zeven dagen', 'drie jobs', '20 procent', 'alleen lezen'])
      expect(ci).toContain(woord);
  });

  test('leerlus-herzien/AC-7: de uitvoer blijft hooguit 40 regels', () => {
    expect(stappen).toMatch(/Hooguit\s+40 regels/);
  });
});
