import { describe, expect, test } from 'vitest';
import { claudeVersieMelding, MIN_CLAUDE_VERSIE } from '../../rails/hooks/lib/claude-versie.mjs';
import { sessionStart } from '../../rails/hooks/lib/werkstraat.mjs';

// Spec rolhek-dicht AC-3: `onFailure` bestaat pas vanaf Claude Code 2.1.295. Een oudere of onleesbare versie meldt
// session-start in de context, met dezelfde regels als de doctor. Zonder `claude` (CI) geen melding.
const TE_OUD = (versie: string) => [
  `✗ Claude Code ${versie} is te oud: het rolhek valt pas vanaf 2.1.295 dicht bij storing`,
  '  → werk Claude Code bij',
];
const ONLEESBAAR = [
  '✗ Claude Code-versie onleesbaar: het rolhek valt pas vanaf 2.1.295 dicht bij storing',
  '  → werk Claude Code bij',
];

describe('rolhek-dicht/AC-3: claudeVersieMelding', () => {
  test('rolhek-dicht/AC-3: de minimale versie is 2.1.295', () => {
    expect(MIN_CLAUDE_VERSIE).toBe('2.1.295');
  });

  test.each([
    { geval: 'ouder', uitvoer: '2.1.294 (Claude Code)', verwacht: TE_OUD('2.1.294') },
    { geval: 'ouder (minor lager, patch hoger)', uitvoer: '2.0.999 (Claude Code)', verwacht: TE_OUD('2.0.999') },
    { geval: 'ouder (numeriek, niet lexicaal)', uitvoer: '2.1.30 (Claude Code)', verwacht: TE_OUD('2.1.30') },
    { geval: 'ouder (zonder suffix)', uitvoer: '1.9.0\n', verwacht: TE_OUD('1.9.0') },
    { geval: 'gelijk', uitvoer: '2.1.295 (Claude Code)', verwacht: [] },
    { geval: 'nieuwer (patch)', uitvoer: '2.1.317 (Claude Code)\n', verwacht: [] },
    { geval: 'nieuwer (minor)', uitvoer: '2.2.0 (Claude Code)', verwacht: [] },
    { geval: 'nieuwer (major)', uitvoer: '3.0.0 (Claude Code)', verwacht: [] },
    { geval: 'nieuwer (numeriek, niet lexicaal)', uitvoer: '2.1.1000 (Claude Code)', verwacht: [] },
    { geval: 'onleesbaar', uitvoer: 'banaan', verwacht: ONLEESBAAR },
    { geval: 'afwezig (null)', uitvoer: null, verwacht: [] },
    { geval: 'afwezig (lege string)', uitvoer: '', verwacht: [] },
  ])('rolhek-dicht/AC-3: $geval ($uitvoer)', ({ uitvoer, verwacht }) => {
    expect(claudeVersieMelding(uitvoer)).toStrictEqual(verwacht);
  });
});

// Fake-deps zoals in test/hooks/sessionstart-slank.test.ts; alleen `claude --version` is instelbaar.
function maak(claude: { code: number; output: string }) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      run: (command: string, args: readonly string[]) => {
        const line = [command, ...args].join(' ');
        calls.push(line);
        if (line.startsWith('git rev-parse')) return { code: 0, output: 'feat/x\n' };
        if (line.startsWith('git rev-list')) return { code: 0, output: '0\t0' };
        if (command === 'gh') return { code: 1, output: '' };
        if (command === 'claude') return claude;
        if (command === 'scripts/doctor.sh') return { code: 0, output: '' };
        return { code: 0, output: '' };
      },
      changed: () => [],
      read: () => null,
    },
  };
}

const regels = (claude: { code: number; output: string }) => (sessionStart(maak(claude).deps).stdout ?? '').split('\n');

describe('rolhek-dicht/AC-3: session-start zet de melding in de context', () => {
  test('rolhek-dicht/AC-3: session-start vraagt claude --version', () => {
    const { deps, calls } = maak({ code: 0, output: '2.1.317 (Claude Code)\n' });
    sessionStart(deps);

    expect(calls).toContain('claude --version');
  });

  test('rolhek-dicht/AC-3: een te oude versie geeft de ✗- en →-regel in stdout', () => {
    const uit = regels({ code: 0, output: '2.1.200 (Claude Code)\n' });

    expect(uit).toContain('✗ Claude Code 2.1.200 is te oud: het rolhek valt pas vanaf 2.1.295 dicht bij storing');
    expect(uit).toContain('  → werk Claude Code bij');
  });

  test('rolhek-dicht/AC-3: een onleesbare versie geeft de onleesbaar-melding in stdout', () => {
    expect(regels({ code: 0, output: 'banaan\n' })).toContain(ONLEESBAAR[0]);
  });

  test.each([
    { geval: 'claude ontbreekt (exit 1, geen uitvoer)', claude: { code: 1, output: '' } },
    { geval: 'nieuwe versie', claude: { code: 0, output: '2.1.317 (Claude Code)\n' } },
    { geval: 'gelijke versie', claude: { code: 0, output: '2.1.295 (Claude Code)\n' } },
  ])('rolhek-dicht/AC-3: geen melding bij $geval', ({ claude }) => {
    const uit = regels(claude);

    expect(uit.filter((regel) => regel.includes('Claude Code'))).toStrictEqual([]);
    expect(uit).not.toContain('  → werk Claude Code bij');
  });
});
