import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, ghForbidden, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// compacte-kennisbasis-rails/AC-17 (PR 6b-1, gate-label weg): geen enkele rol zet of haalt een label bij `gh pr create` of
// `gh pr edit`, ongeacht de labelnaam. Leesfilters (`gh pr list --label x`) en de leerpuntvorm van `gh issue create` blijven.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const ctx = {
  root: ROOT,
  cwd: ROOT,
  config,
  read: () => null,
  committed: () => false,
  isDir: () => false,
  branch: 'feat/x',
};

function verdict(command: string, role?: string) {
  const d = decide(
    { tool_name: 'Bash', tool_input: { command }, ...(role === undefined ? {} : { agent_type: role }) },
    ctx,
  );
  if (d.deny.length > 0) return 'deny';
  return d.ask.length > 0 ? 'ask' : 'allow';
}

const ROLLEN = [
  { rol: 'hoofdsessie', agent: undefined },
  { rol: 'developer', agent: 'developer' },
  { rol: 'tester', agent: 'tester' },
  { rol: 'reviewer', agent: 'reviewer' },
  { rol: 'onbekend', agent: 'onbekende-rol' },
];
const VLAGGEN = [
  '-l bug',
  '--label bug',
  '--label=bug',
  '--add-label bug',
  '--add-label=bug',
  '--remove-label bug',
  '--remove-label=bug',
];
const COMMANDOS = ['gh pr create --title t --body b', 'gh pr edit 1'];

describe('compacte-kennisbasis-rails/AC-17: labels op een PR zet geen enkele rol', () => {
  const gevallen = ROLLEN.flatMap(({ rol, agent }) =>
    COMMANDOS.flatMap((basis) => VLAGGEN.map((vlag) => ({ rol, agent, command: `${basis} ${vlag}` }))),
  );

  test.each(gevallen)('compacte-kennisbasis-rails/AC-17 $rol: $command → deny', ({ agent, command }) => {
    expect(verdict(command, agent)).toBe('deny');
  });

  const OMWEGEN = [
    'gh pr --add-label bug edit 1',
    'gh pr -l bug create --title t --body b',
    'gh pr --label=bug create --title t --body b',
    'gh -R o/r pr edit 1 --add-label bug',
    'gh pr -dl bug create --title t --body b',
    'gh pr new --title t --body b --label bug',
    'gh pr new -l bug',
    'gh issue edit 1 --add-label bug',
    'gh issue edit 1 --remove-label bug',
    'gh issue edit 1 --add-label=bug',
    'gh issue --add-label bug edit 1',
    'gh pr --body x review 1 --approve',
    'gh pr --body x review 1',
    'gh pr --body x review 1 --comment',
    'gh pr --body x review 1 --request-changes',
    'gh pr --body x merge 1',
    'gh pr -R o/r --body x merge --auto 1',
    'gh pr --body -R review 1 --comment',
    'gh pr --body -R merge 1',
    'gh pr --title -R create -l bug --body b',
  ];
  const omwegGevallen = ROLLEN.flatMap(({ rol, agent }) => OMWEGEN.map((command) => ({ rol, agent, command })));

  test.each(omwegGevallen)('compacte-kennisbasis-rails/AC-17 omweg $rol: $command → deny', ({ agent, command }) => {
    expect(verdict(command, agent)).toBe('deny');
  });

  test('compacte-kennisbasis-rails/AC-17 hoofdsessie: leesfilters en edits zonder label houden hun uitslag (allow)', () => {
    expect(verdict('gh issue list --label bug')).toBe('allow');
    expect(verdict('gh issue edit 1 --title t')).toBe('allow');
    expect(verdict('gh pr edit 1 --title t')).toBe('allow');
  });

  test.each(ROLLEN)(
    'compacte-kennisbasis-rails/AC-17 $rol: gh pr review en API-labels blijven geweigerd',
    ({ agent }) => {
      expect(verdict('gh pr review 1 --approve', agent)).toBe('deny');
      expect(verdict('gh api repos/o/r/issues/1/labels -f labels[]=bug', agent)).toBe('deny');
      expect(verdict('gh api repos/o/r/pulls/1/reviews -f event=APPROVE', agent)).toBe('deny');
      expect(verdict('gh api repos/o/r/statuses/abc -f state=success', agent)).toBe('deny');
    },
  );

  test('compacte-kennisbasis-rails/AC-17 hoofdsessie: gh pr create zonder label en gh pr list --label blijven toegestaan', () => {
    expect(verdict('gh pr create --title t --body b')).toBe('allow');
    expect(verdict('gh pr list --label bug')).toBe('allow');
    expect(verdict('gh pr list -l bug')).toBe('allow');
  });

  test('compacte-kennisbasis-rails/AC-17 hoofdsessie: gh pr list --label=x blijft een leesfilter', () => {
    expect(verdict('gh pr list --label=bug')).toBe('allow');
  });

  test('compacte-kennisbasis-rails/AC-17 hoofdsessie: gh pr edit zonder label (titel, body) blijft toegestaan', () => {
    expect(verdict('gh pr edit 1 --title t --body b')).toBe('allow');
  });

  test('compacte-kennisbasis-rails/AC-17 hoofdsessie: leesopdrachten met een optiewaarde review of merge blijven toegestaan (leerpunt #399)', () => {
    expect(verdict('gh pr view 1 --json title')).toBe('allow');
    expect(verdict('gh pr list --search review')).toBe('allow');
    expect(verdict('gh pr view 1 --body review')).toBe('allow');
  });

  test('compacte-kennisbasis-rails/AC-17 gh pr checks blijft toegestaan voor de reviewer (leerpunt #399)', () => {
    expect(verdict('gh pr checks 1', 'reviewer')).toBe('allow');
  });

  test.each([
    [['pr', '--body', 'x', 'merge', '1'], 'mergen'],
    [['pr', '--body', '-R', 'merge', '1'], 'mergen'],
    [['pr', '--body', 'x', 'review', '1'], 'gh pr review'],
    [['pr', '--body', '-R', 'review', '1', '--comment'], 'gh pr review'],
  ])(
    'compacte-kennisbasis-rails/AC-17 ghForbidden leest de pr-actie zoals cobra: %j (leerpunt #399)',
    (args, melding) => {
      expect(ghForbidden(args).join(' ')).toContain(melding);
    },
  );
});
