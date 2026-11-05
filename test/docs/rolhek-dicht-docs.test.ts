import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { MIN_CLAUDE_VERSIE } from '../../rails/hooks/lib/claude-versie.mjs';
import { expectAbsent } from '../support/absence';

// Spec rolhek-dicht AC-2, AC-5 en AC-6: de timeout van het rolhek blijft 10 s, en de docs die na de bouw onwaar zouden
// zijn (regelboek, commentaar van de lader, ENVIRONMENT, agent-doorloop) zeggen dat het rolhek dicht valt bij storing.
const ROLHEK = '.claude/hooks/rolhek.mjs';

function child(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.entries(value).find(([name]) => name === key)?.[1];
}

function lijst(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** De regel `- **<id>** …` uit het regelboek. */
function regel(id: string): string {
  const gevonden = readFileSync('docs/framework.md', 'utf8')
    .split('\n')
    .find((r) => r.startsWith(`- **${id}** `));
  if (gevonden === undefined) throw new Error(`${id} ontbreekt in docs/framework.md`);
  return gevonden;
}

/** De sectie onder `## <kop>` tot de volgende kop van niveau 2. */
function sectie(tekst: string, kop: string): string {
  const start = tekst.indexOf(`\n## ${kop}\n`);
  if (start === -1) throw new Error(`kop "## ${kop}" ontbreekt`);
  const einde = tekst.indexOf('\n## ', start + 1);
  return tekst.slice(start, einde === -1 ? undefined : einde);
}

describe('rolhek-dicht/AC-2: timeout', () => {
  test('rolhek-dicht/AC-2: de rolhek-hook in .claude/settings.json heeft timeout 10', () => {
    const settings: unknown = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
    const hooks = lijst(child(child(settings, 'hooks'), 'PreToolUse')).flatMap((entry) => lijst(child(entry, 'hooks')));
    const rolhek = hooks.filter((hook) => {
      const command = child(hook, 'command');
      return typeof command === 'string' && command.includes(ROLHEK);
    });

    expect(rolhek).toHaveLength(1);
    expect(child(rolhek[0], 'timeout')).toBe(10);
  });
});

describe('rolhek-dicht/AC-5: docs', () => {
  test('rolhek-dicht/AC-5: R-ROL-09 noemt onFailure block, Claude Code ≥ 2.1.295 en open bij timeout', () => {
    const tekst = regel('R-ROL-09');

    expect(tekst).toContain('`onFailure: block`');
    expect(tekst).toContain('Claude Code ≥ 2.1.295');
    expect(tekst).toContain('open bij timeout');
  });

  test('rolhek-dicht/AC-5: laden.mjs noemt onFailure "block" bij de timeout en niet meer fail-open', () => {
    const laden = readFileSync('.claude/hooks/laden.mjs', 'utf8');
    const blok = laden.split('/**').find((stuk) => stuk.includes('timeout van 10 s'));

    expect(blok).toBeDefined();
    expect(blok).toContain('`onFailure: "block"`');
    expectAbsent(blok ?? '', /fail[- ]?open/i, {
      recognizes: ['fail-open', 'fail open', 'failopen', 'Fail-Open'],
      allows: ['faalt dicht', '`onFailure: "block"`'],
    });
  });

  test('rolhek-dicht/AC-5: ENVIRONMENT.md heeft een kop Minimale Claude Code-versie met MIN_CLAUDE_VERSIE', () => {
    const tekst = sectie(readFileSync('docs/ENVIRONMENT.md', 'utf8'), 'Minimale Claude Code-versie');

    expect(MIN_CLAUDE_VERSIE).toBe('2.1.295');
    expect(tekst).toContain(`Claude Code ${MIN_CLAUDE_VERSIE} of nieuwer`);
    expect(tekst).toContain('onFailure');
  });
});

describe('rolhek-dicht/AC-6: agent-doorloop', () => {
  test('rolhek-dicht/AC-6: een alinea beschrijft de blokkade door storing', () => {
    const alineas = readFileSync('docs/operations/agent-doorloop.md', 'utf8').split(/\n\s*\n/);
    const alinea = alineas.find((a) => a.includes('onFailure'));

    expect(alinea).toBeDefined();
    for (const woord of ['onFailure', 'leerpunt', 'R-PRINC-09', 'Read, Grep, Glob', '`git status`'])
      expect(alinea).toContain(woord);
  });
});
