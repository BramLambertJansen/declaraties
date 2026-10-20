import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// V-13 (spec agent-merge, "Bekende gaten"): een programma met een pad (`/usr/bin/gh`, `./gh`) ontliep de weigeringen, die
// alleen op de kale naam keken. Weigeringen en schrijfdoelen kijken nu naar de naam zonder pad; een toestemming (de
// leescommando's van de reviewer) blijft het woord zelf, zodat een willekeurig programma dat `gh` heet niets vrijgeeft.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const FILES: Record<string, string> = {
  'db/migrations/20261009000000_baseline.sql': 'create table a();',
  'src/api/routes/a.test.ts': "test('a', () => {});\ntest('b', () => {});\n",
};

function verdict(command: string, agent?: string) {
  const decision = decide(
    { tool_name: 'Bash', tool_input: { command }, ...(agent === undefined ? {} : { agent_type: agent }) },
    {
      root: ROOT,
      cwd: ROOT,
      config,
      read: (rel: string) => FILES[rel] ?? null,
      committed: (rel: string) => rel in FILES,
      isDir: () => false,
      branch: 'feat/x',
    },
  );
  if (decision.deny.length > 0) return 'deny';
  if (decision.ask.length > 0) return 'ask';
  return decision.context.length > 0 ? 'context' : 'allow';
}

describe('V-13: een volledig pad naar het programma ontloopt de weigering niet', () => {
  test.each([
    { name: '/usr/bin/gh pr merge', command: '/usr/bin/gh pr merge 12 --squash' },
    { name: './gh pr merge', command: './gh pr merge 12' },
    { name: '/usr/bin/env gh pr merge', command: '/usr/bin/env gh pr merge 12' },
    { name: '/usr/bin/gh api …/merge', command: '/usr/bin/gh api -X PUT repos/o/r/pulls/1/merge' },
    { name: '/usr/bin/gh pr review', command: '/usr/bin/gh pr review 1 --approve' },
    { name: '/usr/bin/git push --force', command: '/usr/bin/git push --force origin feat' },
    { name: '/usr/bin/git push naar main', command: '/usr/bin/git push origin main' },
    { name: '/usr/bin/git commit --no-verify', command: "/usr/bin/git commit --no-verify -m 'x'" },
    { name: '/bin/rm van een gecommitte migratie', command: '/bin/rm db/migrations/20261009000000_baseline.sql' },
    { name: '/usr/bin/sed -i op een gegenereerd bestand', command: "/usr/bin/sed -i 's/a/b/' src/api/db/schema.ts" },
  ])('hoofdsessie: $name → deny', ({ command }) => {
    expect(verdict(command)).toBe('deny');
  });

  test('developer: /bin/rm van een bestaande test → deny', () => {
    expect(verdict('/bin/rm src/api/routes/a.test.ts', 'developer')).toBe('deny');
  });

  test.each([
    { name: 'een programma met pad dat gh heet', command: '/tmp/x/gh pr view 1' },
    { name: 'een omhulsel met pad dat env heet', command: './env git status' },
    { name: 'een omhulsel /tmp/x/env voor een leescommando', command: '/tmp/x/env gh pr view 1' },
  ])('reviewer: $name geeft geen leescommando vrij', ({ command }) => {
    expect(verdict(command, 'reviewer')).toBe('deny');
  });

  test.each([
    { name: 'gh.exe pr merge (WSL)', command: '/mnt/c/tools/gh.exe pr merge 1' },
    { name: 'git.exe push --force (WSL)', command: 'git.exe push --force origin feat' },
    { name: 'GH.EXE pr merge (WSL, hoofdletters)', command: '/mnt/c/tools/GH.EXE pr merge 1' },
    { name: "'/usr/bin/gh' pr merge", command: "'/usr/bin/gh' pr merge 1" },
    { name: '\\gh pr merge', command: '\\gh pr merge 1' },
  ])('hoofdsessie: $name → deny', ({ command }) => {
    expect(verdict(command)).toBe('deny');
  });

  test.each([
    { name: '/usr/bin/pnpm pr:label-gate', command: '/usr/bin/pnpm pr:label-gate 1' },
    { name: '/usr/bin/node new-resource', command: '/usr/bin/node scripts/kit/new-resource.mjs notes' },
  ])('developer: $name → deny (alleen de hoofdsessie)', ({ command }) => {
    expect(verdict(command, 'developer')).toBe('deny');
  });

  test.each(['gh pr view 1', 'env git status'])('reviewer: %s (zonder pad) blijft toegestaan', (command) => {
    expect(verdict(command, 'reviewer')).toBe('allow');
  });

  test.each([
    { name: '/usr/bin/gh pr view', command: '/usr/bin/gh pr view 1' },
    { name: '/usr/bin/git push naar een featurebranch', command: '/usr/bin/git push origin feat/x' },
  ])('regressie hoofdsessie mag: $name', ({ command }) => {
    expect(verdict(command)).toBe('allow');
  });
});
