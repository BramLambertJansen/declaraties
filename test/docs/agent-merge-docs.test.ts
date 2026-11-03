import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Regelboek en instructies voor de agent-merge (ADR 0069, spec agent-merge-niet-kritiek AC-6): elke regel uit de AC staat
// in de tekst van het bestand dat hem moet dragen. Faalt op de tekst van vóór 0069 ("alleen de eigenaar merget").
const FRAMEWORK = readFileSync('docs/framework.md', 'utf8');
const ROADMAP = readFileSync('docs/roadmap.md', 'utf8');

/** De regel `- **<id>** …` uit het regelboek. */
function regel(id: string): string {
  const gevonden = FRAMEWORK.split('\n').find((r) => r.startsWith(`- **${id}** `));
  if (gevonden === undefined) throw new Error(`${id} ontbreekt in docs/framework.md`);
  return gevonden;
}

/** Het roadmap-item dat begint met `**<titel>`, tot het volgende item. */
function item(titel: string): string {
  const start = ROADMAP.indexOf(`**${titel}`);
  if (start === -1) throw new Error(`roadmap-item ${titel} ontbreekt`);
  const einde = ROADMAP.indexOf('\n- [', start);
  return ROADMAP.slice(start, einde === -1 ? undefined : einde);
}

describe('agent-merge-niet-kritiek/AC-6 regelboek', () => {
  test('R-REPO-01: eigenaar merget, behalve agent-merge ja via pnpm pr:merge door de hoofdsessie', () => {
    const tekst = regel('R-REPO-01');
    expect(tekst).toMatch(/alleen eigenaar merget, behalve/);
    expect(tekst).toMatch(/`agent-merge: ja`/);
    expect(tekst).toMatch(/hoofdsessie in Claude Code merget via `pnpm pr:merge`/);
    expect(tekst).toMatch(/0069/);
  });

  test('R-REPO-05: mergen alleen via pnpm pr:merge', () => {
    expect(regel('R-REPO-05')).toMatch(/merge alleen via `pnpm pr:merge`/);
  });

  test('R-ROL-08: pnpm pr:merge van de hoofdsessie is de enige uitzondering op mergen', () => {
    expect(regel('R-ROL-08')).toMatch(/mergen \(behalve `pnpm pr:merge <nr>` van de hoofdsessie[^)]*0069\)/);
  });

  test('R-WERK-12 en stap 7 van §8 noemen de agent-merge', () => {
    expect(regel('R-WERK-12')).toMatch(/zelf mergen alleen via `pnpm pr:merge <nr>`, daarna PR en SHA melden en de CI op `main` volgen/);
    expect(FRAMEWORK).toMatch(/7\. \*\*Eigenaar\*\* reviewt en merget; niet-kritiek werk met oordeel `agent-merge: ja` merget de hoofdsessie zelf via `pnpm pr:merge`/);
  });

  test('R-WERK-23: alleen de hoofdsessie in Claude Code merget, een andere runtime nooit', () => {
    expect(regel('R-WERK-23')).toMatch(/alleen de hoofdsessie in Claude Code merget zelf, een andere runtime nooit \(0069\)/);
  });

  test('R-ROL-10: inhoudstoets en rolhek zijn bij een agent-merge een vangnet, geen grens van GitHub', () => {
    expect(regel('R-ROL-10')).toMatch(/bij een agent-merge zijn de inhoudstoets \(`agent-merge`, `pnpm pr:merge`\) en het rolhek een vangnet, geen grens van GitHub/);
  });

  test('R-DOC-09 verwijst naar 0069, niet naar "na de GitHub App"', () => {
    const tekst = regel('R-DOC-09');
    expect(tekst).toMatch(/0069/);
    expect(tekst).not.toMatch(/na de GitHub App/);
  });
});

describe('agent-merge-niet-kritiek/AC-6 instructies', () => {
  test('AGENTS.md: één zin met pnpm pr:merge, PR en SHA melden en CI op main volgen', () => {
    expect(readFileSync('AGENTS.md', 'utf8')).toMatch(
      /behalve niet-kritiek werk met oordeel `agent-merge: ja`: dat merget de hoofdsessie via `pnpm pr:merge`, meldt PR en SHA en volgt de CI op `main`/,
    );
  });

  test('CLAUDE.md: zelf mergen alleen via pnpm pr:merge bij agent-merge ja', () => {
    expect(readFileSync('CLAUDE.md', 'utf8')).toMatch(/zelf mergen alleen via `pnpm pr:merge` bij oordeel `agent-merge: ja` \(ADR 0069\)/);
  });

  test('skill opleveren: mergen via pnpm pr:merge, daarna PR en SHA melden en CI op main volgen', () => {
    const skill = readFileSync('.claude/skills/opleveren/SKILL.md', 'utf8');
    expect(skill).toMatch(/`pnpm pr:merge <nr>`/);
    expect(skill).toMatch(/Meld PR en SHA aan de eigenaar en volg de CI op `main`/);
    expect(skill).toMatch(/Nooit `gh pr merge`/);
  });
});

describe('agent-merge-niet-kritiek/AC-6 specs en roadmap', () => {
  test('spec agent-merge staat op vervallen', () => {
    expect(readFileSync('docs/specs/agent-merge.md', 'utf8')).toMatch(/^status: vervallen\b/m);
  });

  test.each(['ADR 0029 stap 7', 'ADR 0030 PR 2', 'Volledig pad naar `gh` in het rolhek'])(
    'roadmap-item %s verwijst naar de spec agent-merge-niet-kritiek',
    (titel) => {
      expect(item(titel)).toMatch(/docs\/specs\/agent-merge-niet-kritiek\.md/);
    },
  );
});
