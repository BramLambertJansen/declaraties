import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// Spec leerlus (docs/specs/leerlus.md) AC-5 t/m AC-7, ADR 0059 punt 3: alleen de hoofdsessie dient een leerpunt in, met
// `gh issue create --repo <onderhoud.repository> --label leerpunt …`; elke andere vorm is ask (met reden), elke subagent
// krijgt deny op `gh issue create` en op schrijvende `gh issue`-opdrachten. Vorm als test/hooks/rolhek.test.ts.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const REPO = config.onderhoud?.repository ?? '';

function ctx() {
  return {
    root: ROOT,
    cwd: ROOT,
    config,
    read: () => null,
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
  };
}

type Verdict = 'allow' | 'ask' | 'deny' | 'context';

function verdict(payload: unknown): Verdict {
  const decision = decide(payload, ctx());
  if (decision.deny.length > 0) return 'deny';
  if (decision.ask.length > 0) return 'ask';
  return decision.context.length > 0 ? 'context' : 'allow';
}

const bash = (command: string, agent?: string) => ({
  tool_name: 'Bash',
  tool_input: { command },
  ...(agent === undefined ? {} : { agent_type: agent }),
});

const BODY = '--title "Leerpunt: Herhaald handwerk: x" --body "### Soort"';
const leerpunt = (repoFlag = `--repo ${REPO}`, labels = '--label leerpunt') =>
  `gh issue create ${repoFlag} ${labels} ${BODY}`;

const SUBAGENTS = ['developer', 'tester', 'reviewer', 'architect', 'docs', 'Explore'];

test('gates.json: onderhoud.repository is een <owner>/<repo>', () => {
  expect(REPO).toMatch(/^[\w.-]+\/[\w.-]+$/);
});

describe('hoofdsessie: gh issue create', () => {
  test.each([
    { name: 'juiste vorm', command: leerpunt() },
    { name: '-R in plaats van --repo', command: leerpunt(`-R ${REPO}`) },
    { name: 'repo in hoofdletters', command: leerpunt(`--repo ${REPO.toUpperCase()}`) },
    { name: 'label vóór repo', command: `gh issue create --label leerpunt --repo ${REPO} ${BODY}` },
  ])('leerlus/AC-5: $name → geen deny en geen ask', ({ command }) => {
    expect(decide(bash(command), ctx())).toMatchObject({ deny: [], ask: [] });
  });

  test.each([
    { name: 'geen --repo', command: `gh issue create --label leerpunt ${BODY}` },
    { name: 'andere repo', command: leerpunt('--repo iemand/anders') },
    { name: 'URL-vorm', command: leerpunt(`--repo https://github.com/${REPO}`) },
    { name: 'host-vorm', command: leerpunt(`--repo github.com/${REPO}`) },
    { name: 'geen label', command: leerpunt(`--repo ${REPO}`, '') },
    { name: 'ander label', command: leerpunt(`--repo ${REPO}`, '--label bug') },
    { name: '--label leerpunt,x', command: leerpunt(`--repo ${REPO}`, '--label leerpunt,x') },
    { name: 'twee --label', command: leerpunt(`--repo ${REPO}`, '--label leerpunt --label x') },
    { name: 'GH_REPO=', command: `GH_REPO=iemand/anders ${leerpunt()}` },
    { name: 'GH_HOST=', command: `GH_HOST=example.com ${leerpunt()}` },
    { name: 'export GH_REPO', command: `export GH_REPO=iemand/anders && ${leerpunt()}` },
    { name: 'bash -c', command: `bash -c '${leerpunt()}'` },
  ])('leerlus/AC-5: $name → ask met een reden', ({ command }) => {
    const decision = decide(bash(command), ctx());
    expect(verdict(bash(command))).toBe('ask');
    expect(decision.ask.join(' ').trim().length).toBeGreaterThan(10);
  });
});

describe('subagent: gh issue create', () => {
  test.each(SUBAGENTS)('leerlus/AC-6: %s → deny, ook met de juiste repo en het juiste label', (agent) => {
    expect([
      verdict(bash(leerpunt(), agent)),
      verdict(bash(leerpunt(`-R ${REPO}`), agent)),
      verdict(bash(`gh issue create --title x --body y`, agent)),
      verdict(bash(`bash -c '${leerpunt()}'`, agent)),
    ]).toStrictEqual(['deny', 'deny', 'deny', 'deny']);
  });
});

const SCHRIJVEND = [
  'edit',
  'close',
  'reopen',
  'delete',
  'transfer',
  'lock',
  'unlock',
  'pin',
  'unpin',
  'comment',
  'develop',
];
const SCHRIJVENDE_COMMANDOS = SCHRIJVEND.map((sub) => `gh issue ${sub} 1`);
const API_SCHRIJVEND = [
  'gh api -X POST repos/o/r/issues/1/comments -f body=x',
  'gh api repos/o/r/issues -f title=x',
  'gh api --method PATCH repos/o/r/issues/1 -f state=closed',
];

describe('subagent: schrijvende gh issue- en gh api-opdrachten', () => {
  test.each(SUBAGENTS)('leerlus/AC-7: %s → deny op gh issue edit|close|…|develop', (agent) => {
    expect(SCHRIJVENDE_COMMANDOS.map((command) => verdict(bash(command, agent)))).toStrictEqual(
      SCHRIJVEND.map(() => 'deny'),
    );
  });

  test.each(SUBAGENTS)('leerlus/AC-7: %s → deny op schrijvende gh api naar …/issues (bestaande regel)', (agent) => {
    expect(API_SCHRIJVEND.map((command) => verdict(bash(command, agent)))).toStrictEqual(
      API_SCHRIJVEND.map(() => 'deny'),
    );
  });

  // De reviewer valt erbuiten: zijn Bash-witlijst (gh pr view/diff/checks) verandert niet en weigert gh issue al.
  test.each(SUBAGENTS.filter((agent) => agent !== 'reviewer'))(
    'leerlus/AC-7: %s → gh issue view|list|status blijven toegestaan',
    (agent) => {
      expect(
        ['gh issue view 1', 'gh issue list --label leerpunt --state all', 'gh issue status'].map((command) =>
          verdict(bash(command, agent)),
        ),
      ).toStrictEqual(['allow', 'allow', 'allow']);
    },
  );
});

describe('hoofdsessie: andere gh issue-opdrachten veranderen niet', () => {
  // Uitslag vóór deze spec (gemeten op main na #310): allow, de permissievraag van Claude Code blijft de grens.
  test.each([...SCHRIJVENDE_COMMANDOS, 'gh api -X POST repos/o/r/issues/1/comments -f body=x', 'gh issue view 1'])(
    'leerlus/AC-7: hoofdsessie %s → geen nieuwe deny of ask',
    (command) => {
      expect(verdict(bash(command))).toBe('allow');
    },
  );
});

// Review van de bouw-PR: gh vindt het subcommando ook na vlaggen (`gh -R x issue create`), en commandosubstitutie in een
// commando dat de allow-regel matcht, mag geen schrijvende gh-opdracht verbergen.
describe('leerpuntvorm: vlaggen vóór het subcommando en substitutie', () => {
  test.each(SUBAGENTS)('leerlus/AC-6: %s → deny op gh -R <repo> issue create en gh issue -R <repo> create', (agent) => {
    expect(verdict(bash(`gh -R ${REPO} issue create --label leerpunt ${BODY}`, agent))).toBe('deny');
    expect(verdict(bash(`gh issue -R ${REPO} create --label leerpunt ${BODY}`, agent))).toBe('deny');
  });

  test.each(SUBAGENTS)('leerlus/AC-7: %s → deny op gh issue --repo=<repo> comment', (agent) => {
    expect(verdict(bash(`gh issue --repo=${REPO} comment 5 -b x`, agent))).toBe('deny');
  });

  test.each([
    { name: 'gh -R andere repo issue create', command: `gh -R iemand/anders issue create --label leerpunt ${BODY}` },
  ])('leerlus/AC-5: $name → ask met een reden', ({ command }) => {
    expect(verdict(bash(command))).toBe('ask');
  });

  // Strenger dan ask (eigenaarkeuze 2026-10-27): een variabel woord naast een gh-subcommando weigert het rolhek voor elke rol.
  test.each([
    { name: '$( ) in de body', command: `${leerpunt()} --body "$(gh issue comment 42 -R iemand/anders -b x)"` },
    { name: 'backticks in de body', command: `${leerpunt()} --body "\`gh issue close 1\`"` },
  ])('leerlus/AC-5: $name → deny', ({ command }) => {
    expect(verdict(bash(command))).toBe('deny');
  });

  test.each([
    { name: '--repo=<repo> --label=leerpunt', command: `gh issue create --repo=${REPO} --label=leerpunt ${BODY}` },
    { name: '-R<repo> -lleerpunt', command: `gh issue create -R${REPO} -lleerpunt ${BODY}` },
    { name: '--label Leerpunt', command: leerpunt(`--repo ${REPO}`, '--label Leerpunt') },
    {
      name: '--body-file',
      command: `gh issue create --repo ${REPO} --label leerpunt --title x --body-file /tmp/leerpunt.md`,
    },
  ])('leerlus/AC-5: $name → geen deny en geen ask', ({ command }) => {
    expect(decide(bash(command), ctx())).toMatchObject({ deny: [], ask: [] });
  });

  test('leerlus/AC-5: GH_REPO= in een grep-patroon maakt een geldig leerpunt geen ask', () => {
    expect(decide(bash(`grep -n 'GH_REPO=' docs/x.md && ${leerpunt()}`), ctx())).toMatchObject({ deny: [], ask: [] });
  });
});

// Herreview: cobra slaat elke vlag met waarde over, ook onbekende; omhulsels en substitutie in andere programma's.
describe('leerpuntvorm: onbekende vlaggen, omhulsels en substitutie', () => {
  test.each([
    'gh --add-label x issue edit 1',
    'gh issue --remove-label x edit 1',
    'gh --duplicate-of 3 issue close 1',
    "gh --recover '' issue create -t a -b b",
    'echo "$(gh issue create -t a -b b)"',
    'sh -lc "gh issue create -t a -b b"',
    'xargs gh issue create -t a -b b',
    'eval gh issue close 1',
  ])('leerlus/AC-6/AC-7: developer → deny op %s', (command) => {
    expect(verdict(bash(command, 'developer'))).toBe('deny');
  });

  // Strenger dan ask (eigenaarkeuze 2026-10-27): een onbekende gh-groep of -vlag kan een alias zijn; deny voor elke rol.
  test('leerlus/AC-5: hoofdsessie, onbekende vlag vóór issue met een andere repo → deny', () => {
    expect(verdict(bash(`gh --recover '' issue create --label leerpunt -R iemand/anders ${BODY}`))).toBe('deny');
  });
});

// Herreview ronde 3: aliassen, backticks zonder aanhalingstekens en find -exec.
describe('leerpuntvorm: aliassen en losse backticks', () => {
  test.each([
    "gh alias set ic 'issue create'",
    'gh alias import aliassen.yml',
    'gh ic -R o/x -t a -b b',
    'gh co -R o/x -t a -b b',
    'echo `gh issue create -t a`',
    'find . -maxdepth 0 -exec gh issue create -t a -b b ;',
  ])('leerlus/AC-6/AC-7: developer → deny op %s', (command) => {
    expect(verdict(bash(command, 'developer'))).toBe('deny');
  });

  test.each([
    'gh pr view 3',
    'gh issue view 12',
    'gh alias list',
    'gh run view 1 --log-failed',
    'gh -R o/x pr view 5',
    'gh --repo o/x run list',
    'gh version',
  ])('leerlus/AC-7: developer → geen deny op %s', (command) => {
    expect(decide(bash(command, 'developer'), ctx()).deny).toStrictEqual([]);
  });
});

// Herreview ronde 4: `gh issue new` is de ingebouwde alias van `gh issue create`; een onbekende vlag zonder `=` neemt het
// volgende woord mee; een schrijfwoord als optiewaarde maakt een leesopdracht nog geen schrijfopdracht.
describe('leerpuntvorm: gh issue new en schrijfwoorden als optiewaarde', () => {
  test.each(SUBAGENTS)('leerlus/AC-6: %s → deny op gh issue new en verborgen issue create', (agent) => {
    expect(
      [
        'gh issue new -R iemand/anders -t a -b b',
        `gh issue -R ${REPO} new --label leerpunt -t a -b b`,
        'sh -c "gh issue new -t a -b b"',
        'gh --foo pr issue create -t a -b b',
      ].map((command) => verdict(bash(command, agent))),
    ).toStrictEqual(['deny', 'deny', 'deny', 'deny']);
  });

  test.each([
    'gh issue list --search create',
    'gh issue list --label comment',
    'gh issue ls --search close',
    'gh pr list --label issue --search create',
    'gh issue view 5 --comments',
    'gh issue status',
  ])('leerlus/AC-7: developer → geen deny en geen ask op %s', (command) => {
    expect(decide(bash(command, 'developer'), ctx())).toMatchObject({ deny: [], ask: [] });
  });

  test('leerlus/AC-5: hoofdsessie, gh issue new in de leerpuntvorm → geen deny en geen ask', () => {
    expect(decide(bash(`gh issue new --repo ${REPO} --label leerpunt ${BODY}`), ctx())).toMatchObject({
      deny: [],
      ask: [],
    });
  });

  test('leerlus/AC-5: hoofdsessie, gh issue new met een andere repo → ask', () => {
    expect(verdict(bash(`gh issue new -R iemand/anders --label leerpunt ${BODY}`))).toBe('ask');
  });

  test('leerlus/AC-7: hoofdsessie, gh issue list --search create → geen deny en geen ask', () => {
    expect(decide(bash('gh issue list --search create'), ctx())).toMatchObject({ deny: [], ask: [] });
  });
});

// Herreview: gh (cobra) slaat lege woorden over bij het zoeken naar een subcommando; een leeg woord of een los `-` vóór de
// alias mag de deny voor subagents niet ontlopen.
describe('leerpuntvorm: lege woorden en een los - vóór het subcommando', () => {
  test.each(SUBAGENTS)('leerlus/AC-6: %s → deny op gh met een leeg woord of los - vóór issue create', (agent) => {
    expect(
      ['gh "" ic -t a -b b', "gh '' issue new -t a -b b", 'gh - ic -t a -b b'].map((command) =>
        verdict(bash(command, agent)),
      ),
    ).toStrictEqual(['deny', 'deny', 'deny']);
  });
});
