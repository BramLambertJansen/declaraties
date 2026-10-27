import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// PR 3 (plan alright-ga-hier-een-bright-dahl): de vertrouwde basis origin/main mag ook niet via git-omgevingsvariabelen
// of een fetch met destination origin/main worden verlegd. Aanvulling op rolhek-vertrouwde-basis.test.ts.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const ROLLEN = [undefined, 'developer', 'tester', 'reviewer', 'architect'] as const;

function verdict(command: string, agent?: string): 'allow' | 'ask' | 'deny' {
  const decision = decide(
    { tool_name: 'Bash', tool_input: { command }, ...(agent === undefined ? {} : { agent_type: agent }) },
    { root: ROOT, cwd: ROOT, config, read: () => null, committed: () => false, isDir: () => false, branch: 'feat/x' },
  );
  if (decision.deny.length > 0) return 'deny';
  return decision.ask.length > 0 ? 'ask' : 'allow';
}

describe('vertrouwde basis: omgevingsvariabelen en fetch-destination', () => {
  test.each([
    {
      name: 'GIT_CONFIG_COUNT/KEY/VALUE verlegt de remote-url',
      command:
        'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.origin.url GIT_CONFIG_VALUE_0=. git fetch origin HEAD:refs/remotes/origin/main',
    },
    { name: 'GIT_DIR vóór update-ref', command: 'GIT_DIR=x git update-ref refs/remotes/origin/main HEAD' },
    { name: 'GIT_WORK_TREE vóór git', command: 'GIT_WORK_TREE=. git status' },
    { name: 'fetch met destination origin/main', command: 'git fetch origin feat/x:refs/remotes/origin/main' },
    {
      name: 'GIT_CONFIG_* vóór pnpm test:db',
      command: 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=x GIT_CONFIG_VALUE_0=y pnpm test:db',
    },
    { name: 'GIT_DIR vóór bash scripts/runner.sh', command: 'GIT_DIR=x bash scripts/runner.sh db' },
    { name: 'GIT_DIR geëxporteerd', command: 'GIT_DIR=x; export GIT_DIR' },
    { name: 'declare -x GIT_DIR', command: 'declare -x GIT_DIR=x' },
    { name: 'git replace', command: 'git replace abc def' },
    { name: 'git config include.path', command: 'git config include.path x' },
    { name: 'git config includeIf.*.path', command: 'git config includeIf.gitdir:/x.path y' },
  ])('verboden voor elke rol: $name', ({ command }) => {
    expect(ROLLEN.map((rol) => verdict(command, rol))).toStrictEqual(ROLLEN.map(() => 'deny'));
  });

  test('git replace --list (lezen) blijft toegestaan voor hoofdsessie en developer', () => {
    expect([verdict('git replace --list'), verdict('git replace --list', 'developer')]).toStrictEqual([
      'allow',
      'allow',
    ]);
  });

  test.each(['git fetch origin', 'git fetch origin main'])('regressie, mag voor elke rol: %s', (command) => {
    // Alleen de rollen die git fetch mogen gebruiken (zie rolhek-vertrouwde-basis.test.ts): hoofdsessie en developer.
    expect([verdict(command), verdict(command, 'developer')]).toStrictEqual(['allow', 'allow']);
  });
});
