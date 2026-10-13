import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../.claude/hooks/lib/rolhek.mjs';

// De hooks lezen hun bevoegdheid (besluiten, autoRunner, gateMarker) uit de lokale ref origin/main (ADR 0027). Die ref en de
// remote waar ze vandaan komt mogen alleen door `git fetch` veranderen, nooit door een agent met een eigen commit.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

function verdict(command: string, agent?: string): 'allow' | 'ask' | 'deny' {
  const decision = decide(
    { tool_name: 'Bash', tool_input: { command }, ...(agent === undefined ? {} : { agent_type: agent }) },
    {
      root: ROOT,
      cwd: ROOT,
      config,
      read: () => null,
      committed: () => false,
      isDir: () => false,
      branch: 'feat/x',
    },
  );
  if (decision.deny.length > 0) return 'deny';
  return decision.ask.length > 0 ? 'ask' : 'allow';
}

describe('vertrouwde basis: alleen git fetch werkt origin/main bij', () => {
  test.each([
    { name: 'update-ref op de remote-tracking ref', command: 'git update-ref refs/remotes/origin/main HEAD' },
    { name: 'update-ref verwijderen', command: 'git update-ref -d refs/remotes/origin/main' },
    { name: 'symbolic-ref origin/HEAD', command: 'git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/x' },
    { name: 'lokale branch die origin/main overschaduwt', command: 'git branch origin/main HEAD' },
    { name: 'lokale branch met force', command: 'git branch -f origin/main HEAD' },
    { name: 'checkout -b origin/main', command: 'git checkout -b origin/main' },
    { name: 'switch -c origin/main', command: 'git switch -c origin/main' },
    { name: 'tag die origin/main overschaduwt', command: 'git tag origin/main' },
    { name: 'fetch met refspec naar origin/main', command: 'git fetch fork +feat/x:refs/remotes/origin/main' },
    { name: 'remote set-url', command: 'git remote set-url origin https://github.com/x/y.git' },
    { name: 'remote hernoemen', command: 'git remote rename origin oud' },
    { name: 'config remote.origin.url', command: 'git config remote.origin.url https://github.com/x/y.git' },
    { name: 'git -c remote.origin.url', command: 'git -c remote.origin.url=https://github.com/x/y.git status' },
  ])('verboden: $name', ({ command }) => {
    expect(
      ['hoofdsessie', 'developer'].map((role) => verdict(command, role === 'developer' ? role : undefined)),
    ).toStrictEqual(['deny', 'deny']);
  });

  test.each([
    { name: 'git fetch', command: 'git fetch origin' },
    { name: 'git fetch --prune', command: 'git fetch --prune origin' },
    { name: 'origin/main lezen', command: 'git rev-parse origin/main' },
    { name: 'merge-base', command: 'git merge-base origin/main HEAD' },
    { name: 'branch op een eigen naam', command: 'git branch feat/origin-main-fix' },
    { name: 'checkout -b feature', command: 'git checkout -b feat/x origin/main' },
    { name: 'remote -v', command: 'git remote -v' },
    { name: 'remote url lezen', command: 'git config --get remote.origin.url' },
    { name: 'update-ref op een eigen ref', command: 'git update-ref refs/heads/feat/x HEAD' },
  ])('mag: $name', ({ command }) => {
    expect(verdict(command)).toBe('allow');
  });
});
