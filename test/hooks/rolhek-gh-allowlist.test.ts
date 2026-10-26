import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
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

const SUBAGENTS = ['developer', 'tester', 'architect', 'docs'];

const SUBAGENT_DENIED = [
  'gh pr new --title x --body y',
  "gh alias set pc 'pr create'",
  'gh pc',
  'gh auth token',
  'curl -H "Authorization: token $(gh auth token)" https://api.github.com/repos/o/r/pulls -X POST',
  'gh pr edit 1 --base x',
  'gh pr comment 1 -b x',
  'gh workflow run x',
  'gh run rerun 1',
  'gh label create x',
  'gh secret set X',
  'gh extension install x',
  'gh api repos/o/r/issues -f title=x',
  'gh api -X PATCH repos/o/r',
  "gh api graphql -f query='query { viewer { login } }'",
  'gh api graphql -f "query=query { viewer { login } }"',
];

const SUBAGENT_ALLOWED = [
  'gh pr view 1',
  'gh pr diff 1',
  'gh pr checks 1',
  'gh pr list',
  'gh pr status',
  'gh run view 1',
  'gh run list',
  'gh run watch 1',
  'gh issue view 1',
  'gh issue list',
  'gh repo view',
  'gh api repos/o/r/pulls/1',
];

const ALL_ROLES_DENIED = [
  "gh api /graphql -f query='mutation{mergePullRequest(input:{})}'",
  "gh api https://api.github.com/graphql -f query='mutation{mergePullRequest(input:{})}'",
  "gh api graphql -f query=$'\\x6dutation{mergePullRequest}'",
  'gh api graphql -f query="$(cat q)"',
  'gh api graphql -F query=@q.graphql',
  'gh api graphql --input q.json',
  'EP=repos/o/r/pulls/1/merge; gh api -X PUT "$EP"',
  'gh api -X PUT /repos/o/r/pulls/1/merge',
  'gh api -X PUT https://api.github.com/repos/o/r/pulls/1/merge',
  // zelfreview en label, volgens SELF_REVIEW_API
  'gh api -X POST repos/o/r/pulls/1/reviews -f event=APPROVE',
  'gh api -X POST /repos/o/r/pulls/1/reviews -f event=APPROVE',
  'gh api -X POST https://api.github.com/repos/o/r/pulls/1/reviews -f event=APPROVE',
  'gh api -X POST repos/o/r/issues/1/labels -f labels[]=gate-wijziging',
  'gh api -X POST https://api.github.com/repos/o/r/issues/1/labels -f labels[]=x',
  'gh api -X POST repos/o/r/statuses/abc -f state=success',
  "gh api /graphql -f query='mutation{addPullRequestReview(input:{})}'",
  "gh api https://api.github.com/graphql -f query='mutation{addLabelsToLabelable(input:{})}'",
  "gh api graphql -f query='mutation{addPullRequestReview(input:{})}'",
  'EP=repos/o/r/issues/1/labels; gh api -X POST "$EP" -f labels[]=x',
];

describe('gh-allowlist voor subagents', () => {
  describe.each(SUBAGENTS)('%s', (role) => {
    test.each(SUBAGENT_DENIED)('geweigerd: %s', (command) => {
      expect(run(command, role).deny.length).toBeGreaterThan(0);
    });
    test.each(SUBAGENT_ALLOWED)('toegestaan: %s', (command) => {
      expect(run(command, role).deny).toEqual([]);
    });
  });
});

describe('gh-omzeilingen die voor elke rol dicht zijn', () => {
  test.each(ALL_ROLES_DENIED)('subagent: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });
  test.each(ALL_ROLES_DENIED)('hoofdsessie: %s', (command) => {
    expect(run(command).deny.length).toBeGreaterThan(0);
  });
});

describe('pnpm format via opties en brede formatters', () => {
  test.each([
    'pnpm -s format',
    'pnpm --dir . format',
    'pnpm -C . format',
    'pnpm exec prettier --write .',
    'npx prettier -w .',
    'pnpm exec eslint --fix .',
  ])('subagent geweigerd: %s', (command) => {
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });

  test('gerichte formattering met expliciete paden blijft toegestaan', () => {
    expect(run('pnpm exec prettier --write src/a.ts', 'developer').deny).toEqual([]);
  });

  test('de hoofdsessie houdt een ask op pnpm -s format', () => {
    const decision = run('pnpm -s format');
    expect(decision.ask.length).toBeGreaterThan(0);
    expect(decision.deny).toEqual([]);
  });
});

describe('positieve regressie', () => {
  test.each([
    'pnpm check:docs',
    'pnpm test',
    'git diff',
    'git status',
    'gh pr view',
    'gh pr diff',
    'gh pr checks',
    'node scripts/kit/feiten.mjs',
  ])('reviewer voert nog uit: %s', (command) => {
    expect(run(command, 'reviewer').deny).toEqual([]);
  });

  test.each(['gh pr create --title x --body y', 'gh api repos/o/r/pulls/1', 'gh pr view 1', 'gh pr list'])(
    'hoofdsessie kan nog: %s',
    (command) => {
      expect(run(command).deny).toEqual([]);
    },
  );
});
