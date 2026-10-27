import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

const ctx = {
  root: '/repo',
  cwd: '/repo',
  config: loadConfig(readFileSync('.claude/gates.json', 'utf8')),
  read: () => null,
  committed: () => false,
  isDir: () => false,
  branch: 'feat/example',
};

function run(command: string, role?: string) {
  return decide(
    { tool_name: 'Bash', tool_input: { command }, ...(role === undefined ? {} : { agent_type: role }) },
    ctx,
  );
}

describe('indirecte schrijvers volgen de rolgrens', () => {
  test('brede formattering is niet automatisch toegestaan door de gedeelde settings', () => {
    const settings = z
      .object({ permissions: z.object({ allow: z.array(z.string()), ask: z.array(z.string()) }) })
      .parse(JSON.parse(readFileSync('.claude/settings.json', 'utf8')));
    expect(settings.permissions.allow).not.toContain('Bash(pnpm format)');
    expect(settings.permissions.ask).toContain('Bash(pnpm format)');
  });
  test.each(['developer', 'tester', 'architect', 'docs', 'unknown'])(
    '%s kan geen PR openen of brede formatter uitvoeren',
    (role) => {
      for (const command of ['gh pr create --title example --body example', 'pnpm format', 'pnpm run format']) {
        expect(run(command, role).deny.length).toBeGreaterThan(0);
      }
    },
  );

  test.each(['pnpm format', 'pnpm run format'])('hoofdsessie vraagt expliciet akkoord voor %s', (command) => {
    expect(run(command).ask.length).toBeGreaterThan(0);
  });

  test('de hoofdsessie behoudt PR-creatie en read-only formattercontrole', () => {
    expect(run('gh pr create --title example --body example').deny).toEqual([]);
    expect(run('pnpm format:check').ask).toEqual([]);
    expect(run('pnpm format:check', 'developer').deny).toEqual([]);
  });

  test.each([
    'gh api -X POST repos/acme/example/pulls -f title=example',
    'gh api repos/acme/example/pulls -ftitle=example',
    'gh api --method=POST repos/acme/example/pulls --input=/tmp/pr.json',
    'gh api graphql -f "query=mutation { createPullRequest(input: {}) { pullRequest { id } } }"',
    'gh api graphql --input /tmp/query.json',
    'gh api graphql -F query=@/tmp/operation.graphql',
    'gh api graphql -Fquery=@/tmp/operation.graphql',
  ])('een subagent kan PR-creatie niet via de API omleiden: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });

  test.each(['gh pr view 42', 'gh api repos/acme/example/pulls/42'])(
    'read-only gh blijft beschikbaar: %s',
    (command) => {
      expect(run(command, 'developer').deny).toEqual([]);
    },
  );

  // Eigenaarkeuze (gh-allowlist): subagents alleen lezen via REST; GraphQL is voor hen dicht, ook een leesquery.
  test('graphql is voor een subagent dicht, ook een leesquery', () => {
    expect(run('gh api graphql -f "query=query { viewer { login } }"', 'developer').deny.length).toBeGreaterThan(0);
  });
});

describe('vertrouwde Git-basis via stdin en target-directory', () => {
  test.each([
    "printf 'update refs/remotes/origin/main HEAD\\n' | git update-ref --stdin",
    'git update-ref --stdin < /tmp/refs',
    'git update-ref --std < /tmp/refs',
    'ln -sf --target-directory=.git/refs/remotes/origin /tmp/main',
    'ln -sf --target-directory .git/refs/remotes/origin /tmp/main',
    'ln -sft.git/refs/remotes/origin /tmp/main',
    'cp --target-directory=.git/refs/remotes/origin /tmp/main',
    'mv -t .git/refs/remotes/origin /tmp/main',
    'mv -t /tmp/destination /tmp/ordinary .git/config',
    '/usr/bin/ln -sf --target-directory=.git/refs/remotes/origin /tmp/main',
  ])('%s wordt ook voor de hoofdsessie geweigerd', (command) => {
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  test('een expliciete update van een eigen ref en een gewone kopie blijven beschikbaar', () => {
    expect(run('git update-ref refs/heads/feat/example HEAD').deny).toEqual([]);
    expect(run('cp --target-directory=src/web /tmp/example.ts').deny).toEqual([]);
  });
});
