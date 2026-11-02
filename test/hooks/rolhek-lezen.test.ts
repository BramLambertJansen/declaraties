import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// docs/specs/rolhek-lezen.md: de reviewer leest met een kleine lijst commando's en opties (AC-1, AC-3, AC-4); `git diff
// --output` en `git grep -O` zijn voor elke rol dicht (AC-2); de andere rollen veranderen verder niet (AC-5).
const ctx = {
  root: '/repo',
  cwd: '/repo',
  config: loadConfig(readFileSync('.claude/gates.json', 'utf8')),
  read: () => null,
  committed: () => false,
  isDir: () => false,
  branch: 'feat/x',
};

type Verdict = 'allow' | 'ask' | 'deny' | 'context';

function run(command: string, role?: string) {
  return decide(
    { tool_name: 'Bash', tool_input: { command }, ...(role === undefined ? {} : { agent_type: role }) },
    ctx,
  );
}

function verdict(command: string, role?: string): Verdict {
  const decision = run(command, role);
  if (decision.deny.length > 0) return 'deny';
  if (decision.ask.length > 0) return 'ask';
  return decision.context.length > 0 ? 'context' : 'allow';
}

const REVIEWER = 'reviewer';

describe('rolhek-lezen/AC-1: de leeslijst van de reviewer', () => {
  test.each([
    // git ls-files: vlag-loos, paden na `--`
    'git ls-files',
    'git ls-files -- src/api/server.ts',
    'git ls-files -- src docs',
    // gh issue view <nr>: vlag --comments, met waarde --json, --jq
    'gh issue view 5',
    'gh issue view 5 --comments',
    'gh issue view 5 --json title,body',
    'gh issue view 5 --jq .title',
    'gh issue view 5 --comments --json body --jq .body',
    // gh issue list: met waarde --label --state --limit --json --jq
    'gh issue list',
    'gh issue list --label bug --state open --limit 10',
    'gh issue list --json number,title --jq .title',
    // een optie met waarde neemt altijd het volgende woord als waarde, ook als dat met `-` begint (pflag)
    'gh issue list --label --web',
    'gh issue view 5 --json -x',
    // gh run view <id>: vlaggen --log --log-failed, met waarde --json --jq --job
    'gh run view 123',
    'gh run view 123 --log',
    'gh run view 123 --log-failed',
    'gh run view 123 --job 456',
    'gh run view 123 --json jobs --jq .jobs',
    // gh run list: met waarde --branch --workflow --limit --json --jq
    'gh run list',
    'gh run list --branch main --workflow ci.yml --limit 5',
    'gh run list --json databaseId,status --jq .status',
    // pnpm leespad: vlag --json, met waarde --ref
    'pnpm leespad',
    'pnpm leespad --json',
    'pnpm leespad --ref origin/main',
    'pnpm leespad --json --ref origin/main',
    // pnpm meting: vlaggen --json --pr-tabel --trend --help, met waarde --branch --sessie
    'pnpm meting',
    'pnpm meting --json',
    'pnpm meting --pr-tabel',
    'pnpm meting --trend',
    'pnpm meting --help',
    'pnpm meting --branch feat/x',
    'pnpm meting --sessie abc-123',
    'pnpm meting --json --branch claude/rolhek-lezen --sessie s_01:x',
  ])('toegestaan: %s', (command) => {
    expect(verdict(command, REVIEWER)).toBe('allow');
  });

  // Elk geval heeft een basis uit de tabel hierboven die zonder de afwijking slaagt.
  test.each([
    // --web, -R/--repo en gh api blijven dicht
    { name: 'issue view --web', command: 'gh issue view 5 --web', basis: 'gh issue view 5' },
    { name: 'issue view -w', command: 'gh issue view 5 -w', basis: 'gh issue view 5' },
    {
      name: '--comments heeft geen waarde',
      command: 'gh issue view 5 --comments --web',
      basis: 'gh issue view 5 --comments',
    },
    { name: '--log heeft geen waarde', command: 'gh run view 1 --log --web', basis: 'gh run view 1 --log' },
    { name: 'run view --web', command: 'gh run view 1 --web', basis: 'gh run view 1' },
    { name: 'issue list --web', command: 'gh issue list --web', basis: 'gh issue list' },
    { name: 'run list --web', command: 'gh run list --web', basis: 'gh run list' },
    { name: 'issue view -R', command: 'gh issue view 5 -R o/r', basis: 'gh issue view 5' },
    { name: 'issue view --repo', command: 'gh issue view 5 --repo o/r', basis: 'gh issue view 5' },
    { name: 'issue list --repo=', command: 'gh issue list --repo=o/r', basis: 'gh issue list' },
    { name: 'run view -R vóór de actie', command: 'gh -R o/r run view 1', basis: 'gh run view 1' },
    { name: 'run list --repo', command: 'gh run list --repo o/r', basis: 'gh run list' },
    { name: 'gh api (lezen)', command: 'gh api repos/o/r/issues/5', basis: 'gh issue view 5' },
    { name: 'gh api (runs)', command: 'gh api repos/o/r/actions/runs/1', basis: 'gh run view 1' },
    // andere acties van dezelfde groepen
    { name: 'issue create', command: 'gh issue create --title x', basis: 'gh issue list' },
    { name: 'issue comment', command: 'gh issue comment 5', basis: 'gh issue view 5' },
    { name: 'issue close', command: 'gh issue close 5', basis: 'gh issue view 5' },
    { name: 'run rerun', command: 'gh run rerun 1', basis: 'gh run view 1' },
    { name: 'run download', command: 'gh run download 1', basis: 'gh run view 1' },
    { name: 'run watch', command: 'gh run watch 1', basis: 'gh run view 1' },
    // --jq alleen met paden: geen jq-functies zoals env (tokens uit de omgeving)
    { name: '--jq env', command: 'gh issue view 5 --jq env', basis: 'gh issue view 5 --jq .title' },
    { name: '--jq .x,env', command: 'gh run view 1 --jq .x,env', basis: 'gh run view 1 --jq .x,.y' },
    { name: '--jq zonder punt', command: 'gh issue list --jq length', basis: 'gh issue list --jq .title' },
    // vastgeplakte waarden en clusters staan niet in de lijst
    { name: '--json=…', command: 'gh issue view 5 --json=title', basis: 'gh issue view 5 --json title' },
    { name: '--limit=…', command: 'gh issue list --limit=5', basis: 'gh issue list --limit 5' },
    { name: 'korte -L5', command: 'gh issue list -L5', basis: 'gh issue list --limit 5' },
    { name: 'korte -l', command: 'gh issue list -l bug', basis: 'gh issue list --label bug' },
    { name: 'korte -s', command: 'gh issue list -s open', basis: 'gh issue list --state open' },
    { name: 'korte -q', command: 'gh run view 1 -q .x', basis: 'gh run view 1 --jq .x' },
    { name: 'run view -v', command: 'gh run view 1 -v', basis: 'gh run view 1' },
    { name: 'run view --exit-status', command: 'gh run view 1 --exit-status', basis: 'gh run view 1' },
    { name: 'run view --attempt', command: 'gh run view 1 --attempt 2', basis: 'gh run view 1' },
    { name: 'issue list --search', command: 'gh issue list --search x', basis: 'gh issue list' },
    { name: 'leespad --ref=…', command: 'pnpm leespad --ref=main', basis: 'pnpm leespad --ref main' },
    { name: 'leespad onbekende vlag', command: 'pnpm leespad --write', basis: 'pnpm leespad' },
    { name: 'meting --branch=…', command: 'pnpm meting --branch=x', basis: 'pnpm meting --branch x' },
    { name: 'meting onbekende vlag', command: 'pnpm meting --write', basis: 'pnpm meting' },
    { name: 'meting cluster', command: 'pnpm meting -jh', basis: 'pnpm meting --json' },
    { name: 'pnpm-optie vóór het script', command: 'pnpm -s meting --json', basis: 'pnpm meting --json' },
    { name: 'pnpm run meting', command: 'pnpm run meting --json', basis: 'pnpm meting --json' },
    // git ls-files is vlag-loos
    { name: 'ls-files -o', command: 'git ls-files -o', basis: 'git ls-files' },
    { name: 'ls-files --others', command: 'git ls-files --others', basis: 'git ls-files' },
    { name: 'ls-files -z', command: 'git ls-files -z', basis: 'git ls-files' },
    { name: 'ls-files --format=…', command: 'git ls-files --format=x', basis: 'git ls-files' },
    { name: 'ls-files -C3', command: 'git ls-files -C3', basis: 'git ls-files' },
    { name: 'ls-files -efoo', command: 'git ls-files -efoo', basis: 'git ls-files' },
    { name: 'ls-files -nOvim', command: 'git ls-files -nOvim', basis: 'git ls-files' },
    { name: 'git-optie vóór ls-files', command: 'git -C /tmp ls-files', basis: 'git ls-files' },
    // waarden met tekens waarmee de shell van pnpm iets kan uitvoeren
    { name: 'waarde met $', command: "pnpm meting --branch '$(touch x)'", basis: 'pnpm meting --branch x' },
    { name: 'waarde met backtick', command: "pnpm meting --sessie '`id`'", basis: 'pnpm meting --sessie x' },
    { name: 'waarde met ;', command: "pnpm meting --branch 'a;touch x'", basis: 'pnpm meting --branch x' },
    { name: 'waarde met spatie', command: "pnpm leespad --ref 'a b'", basis: 'pnpm leespad --ref x' },
    {
      name: 'waarde met enkel aanhalingsteken',
      command: `pnpm meting --sessie "a'b"`,
      basis: 'pnpm meting --sessie x',
    },
    { name: 'waarde met dubbel aanhalingsteken', command: `pnpm leespad --ref 'a"b'`, basis: 'pnpm leespad --ref x' },
    { name: 'gh-waarde met spatie', command: "gh issue list --label 'a b'", basis: 'gh issue list --label x' },
    { name: 'gh-waarde met $', command: "gh run view 1 --jq '$x'", basis: 'gh run view 1 --jq .x' },
    // een tweede commando of een omleiding
    { name: 'tweede commando', command: 'gh issue view 5; touch a', basis: 'gh issue view 5' },
    { name: 'omleiding', command: 'gh run view 1 --log > log.txt', basis: 'gh run view 1 --log' },
    { name: 'pipe', command: 'gh run view 1 --log | head', basis: 'gh run view 1 --log' },
  ])('$name → deny', ({ command, basis }) => {
    expect(verdict(basis, REVIEWER)).toBe('allow');
    expect(verdict(command, REVIEWER)).toBe('deny');
  });

  // Randgevallen: zoeken en tellen doet de Grep-tool.
  test.each(['git grep foo', 'git blame src/api/server.ts', 'wc -l src/api/server.ts', 'git log | head'])(
    '%s → deny met "gebruik de Grep-tool"',
    (command) => {
      const decision = run(command, REVIEWER);
      expect(decision.deny.join('\n')).toMatch(/gebruik de Grep-tool/);
    },
  );

  test('git show <ref>:<pad> blijft toegestaan', () => {
    expect(verdict('git show HEAD:src/api/server.ts', REVIEWER)).toBe('allow');
  });

  test.each([
    { command: '/usr/bin/env gh issue view 5', basis: 'gh issue view 5' },
    { command: './env git ls-files', basis: 'git ls-files' },
    { command: 'gh issue view $N', basis: 'gh issue view 5' },
    { command: 'pnpm meting --branch $B', basis: 'pnpm meting --branch x' },
  ])('pad-wrapper of geëxpandeerd argument: $command → deny', ({ command, basis }) => {
    expect(verdict(basis, REVIEWER)).toBe('allow');
    expect(verdict(command, REVIEWER)).toBe('deny');
  });
});

const ALLE_ROLLEN: readonly (string | undefined)[] = [
  undefined,
  'developer',
  'tester',
  'architect',
  'docs',
  'reviewer',
];
const rolNaam = (role: string | undefined) => role ?? 'hoofdsessie';

describe('rolhek-lezen/AC-2: git diff|log|show --output en git grep -O voor elke rol', () => {
  const OUTPUT = [
    { command: 'git diff --output out.txt', basis: 'git diff' },
    { command: 'git diff --output=out.txt', basis: 'git diff' },
    { command: 'git diff --outp=out.txt', basis: 'git diff' },
    { command: 'git diff --outpu out.txt', basis: 'git diff' },
    { command: 'git diff HEAD --output=/tmp/x.patch', basis: 'git diff HEAD' },
    { command: 'git log --output out.txt', basis: 'git log' },
    { command: 'git log -p --output=out.txt', basis: 'git log -p' },
    { command: 'git log --outp=out.txt', basis: 'git log' },
    { command: 'git show --output out.txt', basis: 'git show' },
    { command: 'git show HEAD --output=out.txt', basis: 'git show HEAD' },
    { command: 'git show --outp=out.txt', basis: 'git show' },
  ];
  // De basis `git grep foo` is voor de reviewer al dicht (AC-1); voor de andere rollen slaagt hij.
  const GREP = [
    'git grep -O foo',
    'git grep -Ovim foo',
    'git grep -nOvim foo',
    'git grep -iO foo',
    'git grep --open-files foo',
    'git grep --open-files-in-pager foo',
    'git grep --open-files-in-pager=vim foo',
    'git grep --open foo',
  ];
  // Dezelfde familie schrijft met --output; format-patch met -o/--output-directory/--output.
  const FAMILIE = [
    'git diff-tree --output=out.txt HEAD',
    'git diff-index --output=out.txt HEAD',
    'git diff-files --output=out.txt',
    'git range-diff --output=out.txt a...b',
    'git whatchanged --output=out.txt',
    'git format-patch -o out HEAD~1',
    'git format-patch -oout HEAD~1',
    'git format-patch -ko out -1',
    'git reflog show --output=out.txt',
    'git stash show -p --output=out.txt',
    'git format-patch --output-directory out HEAD~1',
    'git format-patch --output=x.patch HEAD~1',
  ];
  // Vals-positieven: deze mogen niet geweigerd worden door AC-2.
  const GEEN_SCHRIJFOPTIE = [
    'git log --oneline',
    'git diff --output-indicator-new=x',
    'git grep -e FOO',
    'git grep -eFOO',
    'git grep -e -O',
  ];

  describe.each(ALLE_ROLLEN.map((role) => ({ role, naam: rolNaam(role) })))('$naam', ({ role }) => {
    test.each(FAMILIE)('%s → deny', (command) => {
      expect(verdict(command, role)).toBe('deny');
    });
    if (role !== REVIEWER)
      test.each(GEEN_SCHRIJFOPTIE)('%s → niet geweigerd', (command) => {
        expect(verdict(command, role)).not.toBe('deny');
      });
    test.each(OUTPUT)('$command → deny', ({ command, basis }) => {
      expect(verdict(basis, role)).not.toBe('deny');
      expect(verdict(command, role)).toBe('deny');
    });
    test.each(GREP)('%s → deny', (command) => {
      if (role !== REVIEWER) expect(verdict('git grep foo', role)).not.toBe('deny');
      expect(verdict(command, role)).toBe('deny');
    });
  });
});

describe('rolhek-lezen/AC-3: weigermelding en ongewijzigde leescommando’s', () => {
  test.each([
    { command: 'gh issue view 5 --web', opties: ['--comments', '--json', '--jq'] },
    { command: 'gh issue list --web', opties: ['--label', '--state', '--limit', '--json', '--jq'] },
    { command: 'gh run view 1 --web', opties: ['--log', '--log-failed', '--json', '--jq', '--job'] },
    { command: 'gh run list --web', opties: ['--branch', '--workflow', '--limit', '--json', '--jq'] },
    { command: 'pnpm leespad --write', opties: ['--json', '--ref'] },
    { command: 'pnpm meting --write', opties: ['--json', '--pr-tabel', '--trend', '--help', '--branch', '--sessie'] },
  ])('$command: de weigering noemt de toegestane opties', ({ command, opties }) => {
    const melding = run(command, REVIEWER).deny.join('\n');
    for (const optie of opties) expect(melding).toContain(optie);
  });

  test.each([
    'git diff',
    'git diff --stat',
    'git diff origin/main...HEAD -- src',
    'git log --oneline -5',
    'git show HEAD',
    'git status --short',
    'gh pr view 1',
    'gh pr view 1 --json files',
    'gh pr diff 1',
    'gh pr checks 1',
    'node scripts/kit/feiten.mjs gates specs fase',
    // leesbudget/AC-9: reviewer.md schrijft `feiten.mjs hoofdstuk` voor, ADR 0064 punt 2.
    'node scripts/kit/feiten.mjs hoofdstuk 9',
  ])('blijft toegestaan voor de reviewer: %s', (command) => {
    expect(verdict(command, REVIEWER)).toBe('allow');
  });
});

describe('rolhek-lezen/AC-4: geen variabele vóór een commando van de reviewer', () => {
  const BASIS = [
    'git ls-files',
    'git diff',
    'git log',
    'git show HEAD',
    'git status',
    'gh issue view 5',
    'gh issue list',
    'gh run view 1',
    'gh run list',
    'gh pr view 1',
    'gh pr diff 1',
    'gh pr checks 1',
    'pnpm leespad',
    'pnpm meting --json',
    'node scripts/kit/feiten.mjs fase',
  ];
  const VARIABELEN = ['METING_GH=/tmp/x', 'GIT_EXTERNAL_DIFF=/tmp/x', 'NODE_OPTIONS=--require=/tmp/x.js'];
  const GEVALLEN = BASIS.flatMap((basis) =>
    VARIABELEN.flatMap((variabele) => [
      { basis, command: `${variabele} ${basis}` },
      { basis, command: `env ${variabele} ${basis}` },
    ]),
  );

  test.each(GEVALLEN)('$command → deny', ({ basis, command }) => {
    expect(verdict(basis, REVIEWER)).toBe('allow');
    expect(verdict(command, REVIEWER)).toBe('deny');
  });

  test('LC_ALL=C git status → deny (basis git status slaagt)', () => {
    expect(verdict('git status', REVIEWER)).toBe('allow');
    expect(verdict('LC_ALL=C git status', REVIEWER)).toBe('deny');
  });
});

describe('rolhek-lezen/AC-5: hoofdsessie, developer en tester ongewijzigd buiten AC-2', () => {
  const LEZEN = [
    'git ls-files',
    'git ls-files -o',
    'git ls-files -- src',
    'gh issue view 5',
    'gh issue view 5 --comments',
    'gh issue list --state open',
    'gh run view 1 --log-failed',
    'gh run view 1 --log',
    'gh run list --limit 5',
    'gh run list --repo o/r',
    'gh issue view 5 --web',
  ];
  describe.each([undefined, 'developer', 'tester'].map((role) => ({ role, naam: rolNaam(role) })))(
    '$naam',
    ({ role }) => {
      test.each(LEZEN)('%s → allow zoals nu', (command) => {
        expect(verdict(command, role)).toBe('allow');
      });
    },
  );
});
