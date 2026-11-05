import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// claude-sandbox-werkstraat/AC-6: rolhekbeslissingen voor de dagelijkse HEAD-vorm en algemene branchnamen.
// Force/hookomzeiling/merge/zelfreview: rolhek.test.ts; gh/API-omzeilingen en lokale merges: rolhek-gh-allowlist.test.ts.
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

function result(command: string, branch = 'codex/sandbox-runtime', role = 'hoofdsessie') {
  return decide(
    { tool_name: 'Bash', tool_input: { command }, ...(role === 'hoofdsessie' ? {} : { agent_type: role }) },
    { root: '/repo', cwd: '/repo', config, branch, read: () => null, committed: () => false, isDir: () => false },
  );
}

test('exacte dagelijkse HEAD-push blijft geweigerd vanaf main', () => {
  expect(result('git push origin HEAD', 'main').deny.length).toBeGreaterThan(0);
});

test.each(['feat/x', 'fix/x', 'docs/x', 'chore/x', 'test/x', 'refactor/x', 'claude/x', 'codex/x', 'feature/x', 'taak'])(
  'HEAD-push vanaf %s vraagt geen nieuw branchnaamformaat',
  (branch) => {
    const decision = result('git push origin HEAD', branch);
    expect(decision.deny).toEqual([]);
    expect(decision.ask).toEqual([]);
  },
);

test.each(['git push origin --delete main', 'git push origin :main', 'git push --all origin', 'git branch -D main'])(
  'bestaande main- en bulkverboden blijven gelden: %s',
  (command) => {
    expect(result(command).deny.length).toBeGreaterThan(0);
  },
);

test.each(['developer', 'tester', 'architect', 'docs', 'reviewer'])(
  '%s krijgt geen HEAD-push of PR-aanmaak door de nieuwe Bash-toestemming',
  (role) => {
    expect(result('git push origin HEAD', 'codex/sandbox-runtime', role).deny.length).toBeGreaterThan(0);
    expect(
      result('gh pr create --head codex/sandbox-runtime --body-file /tmp/pr.md', 'codex/sandbox-runtime', role).deny
        .length,
    ).toBeGreaterThan(0);
  },
);

test('veilige taakbranchopruiming blijft toegestaan', () => {
  const decision = result('git branch -d codex/afgerond');
  expect(decision.deny).toEqual([]);
  expect(decision.ask).toEqual([]);
});
