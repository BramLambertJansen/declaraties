import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// Nieuw werk begint altijd vanaf een verse main: een commando dat een lokale branch maakt, mag alleen in de vorm
// `git fetch origin [main] && git switch -c <naam> origin/main` (of de checkout-, branch- en worktree-variant). Het
// rolhek gebruikt geen netwerk; de `&&` zorgt dat een mislukte fetch geen branch maakt.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const STARTVORM = 'git fetch origin main && git switch -c';
const ROLLEN = ['hoofdsessie', 'developer'] as const;

function decision(command: string, role: (typeof ROLLEN)[number]) {
  return decide(
    { tool_name: 'Bash', tool_input: { command }, ...(role === 'developer' ? { agent_type: role } : {}) },
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
}

function verdict(command: string, role: (typeof ROLLEN)[number]): 'allow' | 'ask' | 'deny' {
  const result = decision(command, role);
  if (result.deny.length > 0) return 'deny';
  return result.ask.length > 0 ? 'ask' : 'allow';
}

describe('verse main: een nieuwe branch start van een zojuist opgehaalde origin/main', () => {
  test.each([
    { name: 'switch -c na fetch origin main', command: 'git fetch origin main && git switch -c feat/x origin/main' },
    { name: 'checkout -b na fetch origin', command: 'git fetch origin && git checkout -b fix/y origin/main' },
    {
      name: 'switch --create op refs/remotes/origin/main na fetch --quiet',
      command: 'git fetch --quiet origin main && git switch --create feat/x refs/remotes/origin/main',
    },
    { name: 'branch na fetch', command: 'git fetch origin main && git branch feat/x origin/main' },
    {
      name: 'worktree add -b na fetch',
      command: 'git fetch origin main && git worktree add -b feat/x ../x origin/main',
    },
  ])('toegestaan: $name', ({ command }) => {
    expect(ROLLEN.map((role) => verdict(command, role))).toStrictEqual(['allow', 'allow']);
  });

  test.each([
    { name: 'switch -c zonder fetch en zonder startpunt', command: 'git switch -c feat/x' },
    { name: 'switch -c zonder fetch', command: 'git switch -c feat/x origin/main' },
    { name: 'fetch met ; in plaats van &&', command: 'git fetch origin main; git switch -c feat/x origin/main' },
    { name: 'fetch met || in plaats van &&', command: 'git fetch origin main || git switch -c feat/x origin/main' },
    { name: 'start op lokale main', command: 'git fetch origin main && git switch -c feat/x main' },
    { name: 'start op een andere branch', command: 'git fetch origin main && git switch -c feat/x feat/y' },
    { name: 'fetch van een andere remote', command: 'git fetch fork main && git switch -c feat/x origin/main' },
    { name: 'fetch zonder main', command: 'git fetch origin feat/z && git switch -c feat/x origin/main' },
    { name: 'checkout -b zonder fetch en startpunt', command: 'git checkout -b feat/x' },
    { name: 'branch zonder fetch en startpunt', command: 'git branch feat/x' },
    { name: 'worktree add -b zonder fetch en startpunt', command: 'git worktree add -b feat/x ../x' },
    { name: 'fetch na de switch', command: 'git switch -c feat/x origin/main && git fetch origin main' },
    { name: 'switch -C zonder fetch', command: 'git switch -C feat/x origin/main' },
    { name: 'switch --force-create zonder fetch', command: 'git switch --force-create feat/x origin/main' },
    { name: 'switch afgekort --cr', command: 'git switch --cr feat/x' },
    { name: 'switch afgekort --force-c', command: 'git switch --force-c feat/x' },
    { name: 'switch cluster -qc', command: 'git switch -qc feat/x' },
    { name: 'switch cluster -cnaam', command: 'git switch -cfeat/x' },
    { name: 'checkout -B zonder fetch', command: 'git checkout -B feat/x origin/main' },
    { name: 'checkout --orphan', command: 'git checkout --orphan feat/x' },
    { name: 'checkout cluster -qb', command: 'git checkout -qb feat/x' },
    { name: 'branch -f zonder fetch', command: 'git branch -f feat/x origin/main' },
    { name: 'branch --track met lokale main', command: 'git fetch origin main && git branch --track feat/x main' },
    { name: 'worktree add -B zonder fetch', command: 'git worktree add -B feat/x ../x origin/main' },
  ])('geweigerd: $name', ({ command }) => {
    expect(ROLLEN.map((role) => verdict(command, role))).toStrictEqual(['deny', 'deny']);
  });

  test.each([
    'git switch -c feat/x',
    'git fetch origin main; git switch -c feat/x origin/main',
    'git checkout -b feat/x',
    'git branch feat/x',
    'git worktree add -b feat/x ../x',
  ])('de weigering noemt de juiste startvorm: %s', (command) => {
    for (const role of ROLLEN) {
      expect(decision(command, role).deny.join('\n')).toContain(STARTVORM);
    }
  });

  test.each([
    'git switch feat/x',
    'git switch main',
    'git switch --detach origin/main',
    'git checkout feat/x',
    'git checkout -- bestand',
    'git branch',
    'git branch -a',
    'git branch --list',
    'git branch -D feat/x',
    'git branch -m oud nieuw',
    'git branch -u origin/feat/x',
    'git branch --show-current',
    'git worktree add --detach pad origin/main',
  ])('blijft toegestaan (maakt geen branch): %s', (command) => {
    expect(ROLLEN.map((role) => verdict(command, role))).toStrictEqual(['allow', 'allow']);
  });
});

describe('verse main: vormen uit de review', () => {
  test.each([
    {
      name: 'worktree add met alleen een pad (git maakt zelf een branch vanaf HEAD)',
      command: 'git worktree add ../feat-x',
    },
    { name: 'worktree add --orphan', command: 'git worktree add --orphan ../feat-x' },
    {
      name: 'worktree add met cluster -qb',
      command: 'git fetch origin main && git worktree add -qb feat/x ../x feat/y',
    },
    {
      name: 'fetch --dry-run werkt origin/main niet bij',
      command: 'git fetch --dry-run origin main && git switch -c feat/x origin/main',
    },
    { name: 'fetch met lege refmap', command: 'git fetch --refmap= origin main && git switch -c feat/x origin/main' },
    { name: 'branch achter timeout', command: 'timeout 9 git switch -c feat/x feat/y' },
    { name: 'branch --create-reflog zonder fetch', command: 'git branch --create-reflog feat/x' },
    { name: 'branch --no-color zonder fetch', command: 'git branch --no-color feat/x' },
    { name: 'switch --force- (afkorting van --force-create)', command: 'git switch --force- feat/x' },
    { name: 'checkout --orp (afkorting van --orphan)', command: 'git checkout --orp feat/x' },
  ])('geweigerd: $name', ({ command }) => {
    expect(ROLLEN.map((role) => verdict(command, role))).toStrictEqual(['deny', 'deny']);
  });

  test.each([
    {
      name: 'fetch achter timeout (gangbaar onder WSL)',
      command: 'timeout 60 git fetch origin main && git switch -c feat/x origin/main',
    },
    {
      name: 'fetch met --depth en een losse waarde',
      command: 'git fetch --depth 1 origin main && git switch -c feat/x origin/main',
    },
    { name: 'worktree add --detach', command: 'git worktree add --detach ../x origin/main' },
    { name: 'worktree add van een bestaande branch', command: 'git worktree add ../x feat/y' },
    { name: 'branch --format lezen', command: "git branch --format='%(refname)' --list" },
    { name: 'branch -vv', command: 'git branch -vv' },
    {
      name: 'branch --force na fetch vanaf origin/main',
      command: 'git fetch origin main && git branch --force feat/x origin/main',
    },
  ])('mag: $name', ({ command }) => {
    expect(ROLLEN.map((role) => verdict(command, role))).toStrictEqual(['allow', 'allow']);
  });
});
