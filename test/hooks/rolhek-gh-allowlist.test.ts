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

describe('review-omzeilingen: optieclusters, vlaggen, wrappers, tokens, brede formatters', () => {
  const ALL = [
    'gh api -iX PUT repos/o/r/pulls/1/merge',
    'gh api -XPUT repos/o/r/pulls/1/merge',
    'gh api --method=PUT repos/o/r/pulls/1/merge',
    'gh pr -R o/r merge 1 --auto',
    'gh -R o/r pr merge 1',
    'gh --repo o/r pr review 1 --approve',
    'gh --repo=o/r pr merge 1',
    "gh alias set m 'pr merge'",
    'gh alias import x',
    'gh m 1',
  ];
  const SUB = [
    'gh api -iX DELETE repos/o/r/git/refs/heads/x',
    'gh api --field x=y repos/o/r/issues',
    'gh api --raw-field x=y repos/o/r/issues',
    'gh api -F x=@- repos/o/r/issues',
    'env -u X gh pr create',
    'env GH_TOKEN=x gh pr create',
    'nice -n 5 gh pr create',
    'command gh pr create',
    '/usr/bin/gh pr create',
    'echo 1 | xargs gh pr merge',
    "bash -c 'gh pr create'",
    'sh -c "gh pr merge 1"',
    'curl -H @hdr "$U"',
    'curl -K cfg',
    'curl --config cfg',
    "printf 'host=github.com\\n' | git credential fill",
    'wget --header="Authorization: token x" https://api.github.com/x',
    'pnpm lint --fix',
    'pnpm run lint --fix',
    'git ls-files | xargs prettier --write',
    'xargs eslint --fix',
  ];

  test.each(ALL)('alle rollen: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });
  test.each(SUB)('subagent: %s', (command) => {
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });
  test('subagent mag een letterlijke URL zonder token of config ophalen', () => {
    expect(run('curl https://example.com/x', 'developer').deny).toEqual([]);
  });
  test.each([
    "gh api graphql -f query='query($n:Int!){viewer{login}}' -F n=1",
    'gh pr view 1 --json state --jq \'.state | test("\\w")\'',
    'gh pr view 1 --json state,mergedAt',
    'gh run view 1 --log-failed',
  ])('hoofdsessie blijft toegestaan: %s', (command) => {
    expect(run(command).deny).toEqual([]);
  });
});

describe('ruwe-tekstregel', () => {
  // Eigenaarsbesluit 2026-10-26: een grove, dichte regel op de ruwe commandotekst, geen shell-parsing.
  const SUB_RAW_DENIED = [
    'gh api {repos/o/r/pulls,-XPOST,-fhead=x,-fbase=main,-ftitle=t}',
    'echo $(gh pr create --title x --body y)',
    'echo `gh pr create --title x`',
    "eval 'gh pr create --title x --body y'",
    "echo 'gh pr create' | bash",
    "bash <<'E'\ngh pr create --title x\nE",
    'source ./x.sh',
    '. ./x.sh',
    'sh < x.sh',
    // Bewust geaccepteerd vals positief: `gh` als los woord in een niet-gh-commando.
    'grep gh x',
    'cat x | grep api.github.com',
  ];
  const SUB_RAW_ALLOWED = [
    'gh pr view 1',
    'gh pr view 1 --json state --jq .state',
    'gh run view 1 --log-failed',
    'gh api repos/o/r/pulls/1',
    'ls',
    'pnpm exec vitest run test/x.test.ts',
    'echo hallo | grep h',
    'echo {a}',
    // Shell-trucs tellen alleen als de tekst gh, github of credential bevat.
    'echo $(date)',
    'echo `date`',
    'ls $(git rev-parse --show-toplevel)',
    "cat <<'E'\nhallo\nE",
  ];
  const ALL_RAW_DENIED = [
    '{ gh pr merge 1; }',
    'if true; then gh pr merge 1; fi',
    'env -u X gh pr merge 1',
    '$(gh pr merge 1)',
    'gh api -X PUT {repos/o/r/pulls/1/merge,--silent}',
    'echo x && gh pr review 1 --approve',
  ];

  test.each(SUB_RAW_DENIED)('subagent geweigerd: %s', (command) => {
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });
  test.each(SUB_RAW_ALLOWED)('subagent toegestaan: %s', (command) => {
    for (const role of SUBAGENTS) expect(run(command, role).deny).toEqual([]);
  });
  test.each(ALL_RAW_DENIED)('vangnet voor elke rol: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });
  // `mergeCommit` is een veldnaam; de skill opleveren heeft dit leescommando nodig, dus het blijft toegestaan.
  test.each([
    'gh pr view 1 --json state,mergedAt,mergeCommit',
    'git merge --ff-only origin/main',
    'git merge origin/main',
  ])('hoofdsessie toegestaan: %s', (command) => {
    expect(run(command).deny).toEqual([]);
  });
});

describe('genormaliseerde-tekst', () => {
  const SUB_OBFUSCATED = [
    'echo $(g\\h pr create --title t --body b)',
    'G=g\\h; $G pr create --title t --body b',
    'x=g; ${x}h pr create --title t',
    "$'\\x67h' pr create --title t",
    'echo $(g""h pr create)',
    "echo $(g''h pr create)",
  ];
  const ALL_OBFUSCATED_MERGE = [
    'echo $(gh pr m\\erge 1)',
    'echo $(g""h pr merge 1)',
    'x=g; ${x}h pr merge 1',
    'gh pr mer""ge 1',
  ];
  // Een niet-letterlijk commandowoord: subagent deny; de hoofdsessie krijgt deny of ask (beide acceptabel).
  const NON_LITERAL = ['$CMD pr view 1', '$(echo ls)'];
  const CURL_MERGE = [
    'curl -H "Authorization: bearer $T" https://api.github.com/graphql -d \'{"query":"mutation{mergePullRequest(input:{pullRequestId:\\"x\\"}){clientMutationId}}"}\'',
    'curl -H "Authorization: bearer $T" https://api.github.com/graphql -d \'{"query":"mutation{enablePullRequestAutoMerge(input:{pullRequestId:\\"x\\"}){clientMutationId}}"}\'',
    'curl -X PUT https://api.github.com/repos/o/r/pulls/1/merge',
  ];

  test.each(SUB_OBFUSCATED)('subagent: verhulde gh-naam geweigerd: %s', (command) => {
    for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
  });
  test.each(ALL_OBFUSCATED_MERGE)('alle rollen: verhulde merge geweigerd: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });
  test.each(NON_LITERAL)('niet-letterlijk commandowoord: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    const main = run(command);
    expect(main.deny.length + main.ask.length).toBeGreaterThan(0);
  });
  test.each(CURL_MERGE)('mergen via curl geweigerd voor alle rollen: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  test.each([
    'gh pr view 1 --json state,mergedAt,mergeCommit',
    'git merge --ff-only origin/main',
    'gh pr create --title "fix: x" --body-file /tmp/b.md',
    'echo "it\'s fine" | grep fine',
  ])('hoofdsessie blijft toegestaan: %s', (command) => {
    expect(run(command).deny).toEqual([]);
  });

  // Geaccepteerde valse melding: "merge " in een titel raakt het vangnet. De oplossing is `--body-file` en een titel zonder "merge ".
  test('geaccepteerde valse melding: "merge" in een PR-titel wordt geweigerd', () => {
    expect(run('gh pr create --title "fix: merge conflict" --body-file x').deny.length).toBeGreaterThan(0);
  });
});

describe('substituties-en-woordgrens', () => {
  test.each(['x=g; echo $(${x}h pr merge 1)', 'x=g; echo `${x}h pr merge 1`', 'echo $(echo $(gh pr merge 1))'])(
    'hoofdsessie: inhoud van substituties wordt gecontroleerd: %s',
    (command) => {
      expect(run(command).deny.length).toBeGreaterThan(0);
    },
  );
  test.each(['x=g; echo `${x}h pr create --title t --body b`', 'echo $(${x}h pr create --title t)'])(
    'subagent: inhoud van substituties wordt gecontroleerd: %s',
    (command) => {
      for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
    },
  );
  test('alle rollen: een niet-letterlijk commandowoord in een substitutie', () => {
    expect(run('echo $($CMD x)', 'developer').deny.length).toBeGreaterThan(0);
    expect(run('echo $($CMD x)').deny.length).toBeGreaterThan(0);
  });
  test.each(['echo $(date)', 'ls $(git rev-parse --show-toplevel)', 'echo $(pwd)'])(
    'onschuldige substituties blijven toegestaan voor hoofdsessie en subagent: %s',
    (command) => {
      expect(run(command).deny).toEqual([]);
      expect(run(command, 'developer').deny).toEqual([]);
    },
  );

  // Woordgrens: `gh` binnen een pad of bestandsnaam is geen gh-commando.
  test.each([
    'pnpm test test/hooks/rolhek-gh-allowlist.test.ts',
    './node_modules/.bin/vitest run test/hooks/rolhek-gh-allowlist.test.ts',
    'cat docs/gh-notes.md',
    'ls high-gh',
  ])('subagent: gh in een pad is geen gh-commando: %s', (command) => {
    for (const role of ['developer', 'tester']) expect(run(command, role).deny).toEqual([]);
  });
  test('reviewer: git log op de branch fix/rolhek-gh-allowlist', () => {
    expect(run('git log fix/rolhek-gh-allowlist', 'reviewer').deny).toEqual([]);
  });
  test.each(['x; gh pr create', '(gh pr create)', 'echo|gh pr create'])(
    'subagent: gh na een scheidingsteken blijft geweigerd: %s',
    (command) => {
      for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
    },
  );

  // Besluit: de uitzondering voor commitberichten vervalt (een zelfherhalend bericht liet een echte merge uit de tekst wegvallen).
  // Geaccepteerde valse melding; de oplossing is `git commit -F <bestand>`.
  test.each([
    'git commit -m "fix(rolhek): block graphql merge mutations"',
    'git commit --message "merge conflict via gh solved"',
  ])('hoofdsessie: commitbericht met merge/gh/graphql wordt geweigerd: %s', (command) => {
    expect(run(command).deny.length).toBeGreaterThan(0);
  });
  // Via een bestand staat de tekst niet in het commando, dus dit blijft de werkende route.
  test('hoofdsessie: git commit -F msg.txt blijft toegestaan', () => {
    expect(run('git commit -F msg.txt').deny).toEqual([]);
  });
});

describe('ronde-5', () => {
  test.each([
    "git commit --allow-empty -m x; bash -cm 'gh pr merge 1'",
    'git commit -m x && sh -cm "gh pr merge 1"',
    '{ gh>/dev/null pr merge 1; }',
    'if gh</dev/null pr merge 1; then :; fi',
    '{ gh 2>/dev/null pr merge 1; }',
  ])('geweigerd voor elke rol: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Geen commitbericht-uitzondering meer: geaccepteerde valse melding, oplossing is `git commit -F <bestand>`.
  test.each(['git commit -m "fix: graphql merge note"', 'git commit -am "merge gh notes"'])(
    'hoofdsessie: commitbericht met merge/gh/graphql wordt geweigerd: %s',
    (command) => {
      expect(run(command).deny.length).toBeGreaterThan(0);
    },
  );

  // Een zelfherhalend bericht mag de echte merge niet uit de tekst laten wegvallen.
  test('geweigerd voor elke rol: zelfherhalend commitbericht verbergt de merge niet', () => {
    const command = "bash -c 'gh pr merge 1'; git commit -m 'gh pr merge 1; git commit -m gh pr me'";
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Regressie: zonder gh, merge of graphql in het bericht blijft een gewone commit toegestaan.
  test('hoofdsessie: gewoon commitbericht blijft toegestaan', () => {
    expect(run('git commit -m "fix(ui): toast timers"').deny).toEqual([]);
  });
});

describe('ronde-7', () => {
  // Globs, tilde en xargs/find -exec maken het commandowoord niet-letterlijk: dicht falen voor elke rol.
  test.each([
    '/usr/bin/g[h] pr merge 1',
    '/usr/bin/g?  pr merge 1',
    '/usr/bin/g* pr merge 1',
    // Een `~` in het commandowoord telt als niet-letterlijk; weigeren is goed, ook als het pad niet bestaat.
    '~/bin/gh pr merge 1',
    'echo g | xargs -I% %h pr merge 1',
    "find /usr/bin -name 'g[h]' -exec {} pr merge 1 \\;",
    'C=g; eval "${C}h pr merge 1"',
    'C=g; bash -c "${C}h pr merge 1"',
  ])('geweigerd voor elke rol: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Keuze: subagents mogen xargs/find -exec niet met een commandowoord gebruiken; gewone testcommando's
  // (`pnpm test`, `vitest run`, `git status`) hebben dat niet nodig en blijven toegestaan (zie onder).
  test.each(['echo g | xargs -I% %h pr create --title t --body b', 'find . -name x -exec {} \\;', 'ls | xargs cat'])(
    'subagent: xargs of find -exec met een commandowoord geweigerd: %s',
    (command) => {
      for (const role of SUBAGENTS) expect(run(command, role).deny.length).toBeGreaterThan(0);
    },
  );

  test.each(['find . -name "*.ts"', 'ls *.md', 'git status'])(
    "hoofdsessie: gewone commando's blijven toegestaan: %s",
    (command) => {
      expect(run(command).deny).toEqual([]);
    },
  );
  test('subagent: een testcommando zonder xargs blijft toegestaan', () => {
    expect(run('pnpm test test/hooks/rolhek-gh-allowlist.test.ts', 'tester').deny).toEqual([]);
  });
});

describe('ronde-8', () => {
  // Een glob-commandowoord achter een shell-sleutelwoord, `!`, `time`, `env`, `nice` of `command` is nog steeds een commandowoord.
  test.each([
    '! /usr/bin/g[h] pr merge 1',
    'if /usr/bin/g[h] pr merge 1; then :; fi',
    'time -p /usr/bin/g[h] pr merge 1',
    'while /usr/bin/g? pr merge 1; do :; done',
    '{ /usr/bin/g[h] pr merge 1; }',
    'env -u X /usr/bin/g[h] pr merge 1',
    'nice -n 5 /usr/bin/g* pr merge 1',
    'command -p /usr/bin/g[h] pr merge 1',
  ])('geweigerd voor hoofdsessie en developer: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Regressie: gewone shell-constructies zonder gh blijven toegestaan.
  test.each([
    'if [ -f x ]; then echo ok; fi',
    '! git diff --quiet',
    'time pnpm test',
    '{ echo a; echo b; }',
    'env FOO=1 node scripts/x.mjs',
  ])('hoofdsessie: blijft toegestaan: %s', (command) => {
    expect(run(command).deny).toEqual([]);
  });
});

describe('ronde-9', () => {
  // Onbekende wrappers en een gh-glob als argument van een willekeurig programma: dicht falen.
  test.each([
    'setsid /usr/bin/g[h] pr merge 1',
    'flock /tmp/l /usr/bin/g[h] pr merge 1',
    'watch -n1 /usr/bin/g[h] pr merge 1',
    'coproc /usr/bin/g[h] pr merge 1',
    'chroot / /usr/bin/g[h] pr merge 1',
    'unbuffer /usr/bin/g? pr merge 1',
    'parallel /usr/bin/g* ::: x',
    'echo 1 | xargs /usr/bin/g[h] pr merge',
    'foo /opt/x/g[h].exe pr merge 1',
  ])('geweigerd voor hoofdsessie en developer: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Regressie: globs als argument zijn geen gh. `cat g*.txt` matcht `gh` niet, want `*.txt` vereist de extensie .txt.
  test.each(['ls src/*.ts', 'grep -r foo docs/*.md', 'rm -f $TMPDIR/x*', 'cat g*.txt'])(
    'hoofdsessie: blijft toegestaan: %s',
    (command) => {
      expect(run(command).deny).toEqual([]);
    },
  );
});

describe('ronde-10', () => {
  // Brace-expansie en POSIX-klassen in een glob die precies `gh` opleveren.
  test.each([
    'setsid /usr/bin/{g..g}h pr merge 1',
    'ionice /usr/bin/g{h..h} pr merge 1',
    'taskset 1 /usr/bin/{g,x}h pr merge 1',
    'ionice /usr/bin/g[[=h=]] pr merge 1',
    'ionice /usr/bin/g[[:alpha:]] pr merge 1',
    'ionice /usr/bin/g[[.h.]] pr merge 1',
  ])('geweigerd voor hoofdsessie en developer: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Geaccepteerd vals positief: een vangnet heeft geen brace-expander nodig, dus elke brace-expansie
  // met `,` of `..` na het eerste woord wordt geweigerd, ook zonder gh.
  test.each(['echo {a,b}', 'echo {1..3}'])('geweigerd voor alle rollen (dicht falen): %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Regressie: `{` zonder `,` of `..` op het bovenste niveau en `[[ ]]` blijven toegestaan.
  test.each(['if [[ -n x ]]; then :; fi', 'node -e "console.log({a:1})"', "git log --format='%h %s'"])(
    'hoofdsessie: blijft toegestaan: %s',
    (command) => {
      expect(run(command).deny).toEqual([]);
    },
  );
});

describe('ronde-11', () => {
  // Regel: een woord na de eerste positie met `$` of backtick, plus een gh-subcommandowoord als los woord, wordt geweigerd.
  test.each([
    'G=g; ionice ${G}h pr merge 1',
    'G=g; taskset 1 ${G}h pr create --title t --body b',
    'G=gh; nice $G api -X PUT repos/o/r/pulls/1/merge',
  ])('geweigerd voor hoofdsessie en developer: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  // Regressie: `$` zonder gh-subcommandowoord blijft toegestaan.
  test.each([
    'rm -f $TMPDIR/x*',
    'ls $(git rev-parse --show-toplevel)',
    'TMPDIR=$TMPDIR ./node_modules/.bin/vitest run test/x.test.ts',
    'echo $HOME',
    'cp $TMPDIR/a $TMPDIR/b',
  ])('hoofdsessie en developer: blijft toegestaan: %s', (command) => {
    expect(run(command, 'developer').deny).toEqual([]);
    expect(run(command).deny).toEqual([]);
  });

  // Geaccepteerd vals positief: `run` is een gh-subcommandowoord, dus `$HOME` plus `run` wordt geweigerd.
  test('geaccepteerd vals positief: echo $HOME run wordt geweigerd', () => {
    expect(run('echo $HOME run').deny.length).toBeGreaterThan(0);
  });
});

describe('ronde-12', () => {
  // Besluit: bevat een woord na het eerste woord shell-expansie, dan is alleen een programma uit een vaste lijst
  // (echo, cat, ls, cp, rm, ...) toegestaan. Anders: subagent deny, hoofdsessie ask.
  test.each([
    'G=g P=p M=mer; ionice ${G}h ${P}r ${M}ge 1',
    'G=g P=p C=cre; ionice ${G}h ${P}r ${C}ate --title t --body b',
    'X=y; pnpm exec $X',
  ])('subagent deny, hoofdsessie deny of ask: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    const main = run(command);
    expect(main.deny.length + main.ask.length).toBeGreaterThan(0);
  });

  test.each(['git diff $BASE', 'node scripts/x.mjs $ARG'])('subagent deny, hoofdsessie ask: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    expect(run(command).ask.length).toBeGreaterThan(0);
  });

  // Programma's uit de lijst starten zelf geen commando; een toewijzing (`TMPDIR=$TMPDIR`) is geen geëxpandeerd argument.
  test.each([
    'rm -f $TMPDIR/x*',
    'ls $(git rev-parse --show-toplevel)',
    'cp $TMPDIR/a $TMPDIR/b',
    'echo $HOME',
    'cat $TMPDIR/x',
    'TMPDIR=$TMPDIR ./node_modules/.bin/vitest run test/x.test.ts',
  ])('toegestaan voor subagent en hoofdsessie: %s', (command) => {
    for (const role of [undefined, 'developer']) {
      const decision = run(command, role);
      expect(decision.deny).toEqual([]);
      expect(decision.ask).toEqual([]);
    }
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

// Aanvulling van de bouwer (opdracht hoofdsessie): na een omhulsel moet elk woord letterlijk zijn, ook achter een onbekende optie.
describe('ronde-8b', () => {
  test.each(['sudo --weird v /usr/bin/g[h] pr merge 1', 'env --weird v /usr/bin/g* pr merge 1'])(
    'geweigerd voor hoofdsessie en developer: %s',
    (command) => {
      expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
      expect(run(command).deny.length).toBeGreaterThan(0);
    },
  );
});

// Review-bevindingen B1 en I1: omzeilingen via env -S, git-aliassen en xargs.
describe('omzeilingen B1/I1', () => {
  const MERGE_ALL_ROLES = [
    "env -S'gh pr merge 1'",
    'env -Sgh pr merge 1',
    "env --split-string='gh pr merge 1'",
    "git -c 'alias.x=!gh pr merge 1' x",
    "git config alias.x '!gh pr merge 1'",
  ];

  test.each(MERGE_ALL_ROLES)('geweigerd voor hoofdsessie en developer: %s', (command) => {
    expect(run(command).deny.length).toBeGreaterThan(0);
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });

  test.each([
    "env -S'gh pr create --title x --body y'",
    "env -S'gh api -X POST repos/o/r/issues'",
    "git -c 'alias.x=!gh pr create --title x' x",
    "git -c 'alias.x=!gh api -X POST repos/o/r/issues' x",
    "git config alias.x '!gh pr create --title x'",
    "git config alias.x '!gh api -X POST repos/o/r/issues'",
    'git --config-env=alias.x=FOO x',
  ])('geweigerd voor subagent developer: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });

  test.each(['xargs -a args.txt gh', 'cat f | xargs gh', 'xargs gh < f'])(
    'xargs met gh geweigerd voor hoofdsessie en developer: %s',
    (command) => {
      expect(run(command).deny.length).toBeGreaterThan(0);
      expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
    },
  );

  test.each(['git -c core.quotepath=false log', 'env FOO=1 pnpm lint'])('hoofdsessie kan nog: %s', (command) => {
    expect(run(command).deny).toEqual([]);
  });

  test('reviewer kan nog: gh pr view 1 --json state', () => {
    expect(run('gh pr view 1 --json state', 'reviewer').deny).toEqual([]);
  });
});

describe('omzeilingen ronde 2', () => {
  test.each([
    "env -u X -vS'gh pr create --title x --body y'",
    "env -u X -S'gh api -X POST repos/o/r/issues'",
    "env -C . -S'\\_gh pr create --title x'",
    "env --unset=X -S'gh pr create --title x'",
    "env --chdir . -S'gh pr create --title x'",
  ])('env optie-met-waarde voor -S geweigerd voor developer: %s', (command) => {
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });

  test('env -u X -vS review --approve geweigerd voor hoofdsessie en developer', () => {
    const command = "env -u X -vS'gh pr review 1 --approve'";
    expect(run(command).deny.length).toBeGreaterThan(0);
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });

  test('env -u X -S gate-label geweigerd voor hoofdsessie', () => {
    expect(run("env -u X -S'gh pr edit 1 --add-label gate-wijziging'").deny.length).toBeGreaterThan(0);
  });

  test.each([
    'xargs -a args.txt env gh',
    'xargs -a args.txt command gh',
    'xargs -a args.txt nice gh',
    'xargs -a args.txt timeout 9 gh',
    'xargs -a args.txt /usr/bin/env gh',
    'xargs -a args.txt git',
    'cat f | xargs sh',
    String.raw`find . -exec env gh pr view 1 \;`,
  ])('xargs/find met omhulsel of git geweigerd voor hoofdsessie en developer: %s', (command) => {
    expect(run(command).deny.length).toBeGreaterThan(0);
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });

  test.each([
    'env -u X pnpm lint',
    'xargs -a files.txt prettier --check',
    "find . -name '*.ts' -exec grep -l foo {} +",
    'git config --get alias.st',
  ])('hoofdsessie kan nog: %s', (command) => {
    expect(run(command).deny).toEqual([]);
  });
});

describe('omzeilingen ronde 3', () => {
  test.each([
    'env -i gh pr review 1 -ab ok',
    'env -i gh pr review 1 -aR o/r',
    'setsid gh pr review 1 -ab ok',
    'timeout 9 gh pr review 1 -aF body.txt',
    'env -i gh pr review 1 --comment -b ok',
  ])('gh pr review via omhulsel geweigerd voor hoofdsessie: %s', (command) => {
    expect(run(command).deny.length).toBeGreaterThan(0);
  });

  test('hoofdsessie kan nog: gh pr view 1 --json reviews', () => {
    expect(run('gh pr view 1 --json reviews').deny).toEqual([]);
  });
});

describe('omzeilingen ronde 4: leeg woord vóór de gh-groep', () => {
  test.each([
    'gh "" api -X POST repos/o/r/statuses/abc -f state=success -f context=ci',
    'gh "" alias import a.yml',
    'gh "" m 1',
    'gh "" api graphql -F query=@q.graphql',
    "gh '' '' pr review 1 --comment -b x",
    'gh "" pr edit 1 --add-label gate-wijziging',
  ])('gh met leeg woord geweigerd voor hoofdsessie en developer: %s', (command) => {
    expect(run(command).deny.length).toBeGreaterThan(0);
    expect(run(command, 'developer').deny.length).toBeGreaterThan(0);
  });

  test.each(['gh pr view 1 --json state', 'gh "" pr view 1'])('hoofdsessie kan nog: %s', (command) => {
    expect(run(command).deny).toEqual([]);
  });
});
