import { describe, expect, test } from 'vitest';
import { CODEX, codexStand, nummerUit, voorwaarden } from '../../scripts/kit/pr-merge.mjs';

// `pnpm pr:merge` (ADR 0069 punt 3, spec agent-merge-niet-kritiek AC-3): per voorwaarde een nagebootst REST-antwoord dat
// de merge tegenhoudt. De wereld `goed` is mergebaar; elke test verandert precies één antwoord.
const REPO = 'BramLambertJansen/template';
const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const ACTIONS = 15368;
const VEREIST = ['gate:fast', 'document-status'];
const b64 = (waarde: unknown) => Buffer.from(JSON.stringify(waarde)).toString('base64');

type Wereld = Record<string, unknown>;

function check(name: string, sha: string, extra: Record<string, unknown> = {}) {
  return { id: 1, name, head_sha: sha, status: 'completed', conclusion: 'success', app: { id: ACTIONS }, ...extra };
}

const codexSamenvatting = (stand: Record<string, unknown>) =>
  `<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 ${JSON.stringify({ code_review: stand }).replaceAll('{', '&#123;').replaceAll('}', '&#125;')} -->`;

const PR = { state: 'open', draft: false, base: { ref: 'main' }, head: { sha: HEAD, repo: { full_name: REPO } } };

function goed(): Wereld {
  return {
    [`repos/${REPO}/branches/main`]: { commit: { sha: MAIN } },
    [`repos/${REPO}/contents/.claude/gates.json?ref=${MAIN}`]: {
      content: b64({ merge: 'niet-kritiek', agentMerge: { toegestaan: ['src/**'], kritiek: [], codex: true } }),
    },
    [`repos/${REPO}/contents/.claude/decisions.json?ref=${MAIN}`]: { content: b64({ requiredChecks: VEREIST }) },
    [`repos/${REPO}/pulls/7`]: {
      state: 'open',
      draft: false,
      base: { ref: 'main' },
      head: { sha: HEAD, repo: { full_name: REPO } },
    },
    [`repos/${REPO}/compare/${MAIN}...${HEAD}`]: { behind_by: 0 },
    [`repos/${REPO}/commits/${HEAD}/check-runs`]: {
      check_runs: [
        ...VEREIST.map((n) => check(n, HEAD)),
        check('agent-merge', HEAD, { id: 9, check_suite: { id: 55 } }),
      ],
    },
    [`repos/${REPO}/actions/runs?check_suite_id=55`]: {
      workflow_runs: [
        { path: '.github/workflows/guard.yml', event: 'pull_request_target', pull_requests: [{ number: 7 }] },
      ],
    },
    [`repos/${REPO}/commits/${MAIN}/check-runs`]: { check_runs: [check('gate:fast', MAIN)] },
    [`repos/${REPO}/issues/7/comments`]: [
      { user: { login: 'BramLambertJansen' }, body: `Review ${HEAD}: geen blokkerende bevindingen` },
      {
        user: { login: CODEX },
        body: codexSamenvatting({ status: 'completed', commit_sha: HEAD, has_unresolved_findings: false }),
      },
    ],
    [`repos/${REPO}/issues/7/reactions`]: [],
    [`repos/${REPO}/commits/${HEAD}/check-suites`]: { check_suites: [{ created_at: '2026-11-03T10:00:00Z' }] },
  };
}

function api(wereld: Wereld) {
  return (endpoint: string) => {
    const sleutel = endpoint.replace(/[?&]per_page=100&page=\d+$/, '');
    if (!(sleutel in wereld)) throw new Error(`onbekend endpoint ${sleutel}`);
    return wereld[sleutel];
  };
}

function redenen(aanpassing: (w: Wereld) => void = () => {}) {
  const wereld = goed();
  aanpassing(wereld);
  return voorwaarden(api(wereld), { repo: REPO, nummer: 7, head: HEAD }).join('\n');
}

const zet = (sleutel: string, waarde: unknown) => (w: Wereld) => {
  w[`repos/${REPO}/${sleutel}`] = waarde;
};

describe('agent-merge-niet-kritiek/AC-3 pr:merge', () => {
  test('alle voorwaarden vervuld: geen reden', () => {
    expect(redenen()).toBe('');
  });

  test.each([
    [
      'modus eigenaar',
      zet(`contents/.claude/gates.json?ref=${MAIN}`, { content: b64({ merge: 'eigenaar' }) }),
      /modus/,
    ],
    ['modus ontbreekt', zet(`contents/.claude/gates.json?ref=${MAIN}`, { content: b64({}) }), /modus/],
    ['gates.json onleesbaar', zet(`contents/.claude/gates.json?ref=${MAIN}`, { content: 'kapot' }), /modus/],
    ['PR dicht', zet('pulls/7', { ...PR, state: 'closed' }), /niet open/],
    ['draft', zet('pulls/7', { ...PR, draft: true }), /draft/],
    ['basis niet main', zet('pulls/7', { ...PR, base: { ref: 'dev' } }), /basis/],
    [
      'fork',
      zet('pulls/7', {
        ...PR,
        head: { sha: HEAD, repo: { full_name: 'x/y' } },
      }),
      /fork/,
    ],
    [
      'andere head',
      zet('pulls/7', {
        ...PR,
        head: { sha: 'c'.repeat(40), repo: { full_name: REPO } },
      }),
      /lokale HEAD/,
    ],
    ['achter main', zet(`compare/${MAIN}...${HEAD}`, { behind_by: 1 }), /kop van main niet/],
    [
      'verplichte check rood',
      zet(`commits/${HEAD}/check-runs`, {
        check_runs: [check('gate:fast', HEAD, { conclusion: 'failure' }), check('document-status', HEAD)],
      }),
      /verplichte checks niet groen/,
    ],
    [
      'agent-merge overgeslagen (oordeel nee)',
      zet(`commits/${HEAD}/check-runs`, { check_runs: VEREIST.map((n) => check(n, HEAD)) }),
      /geen job agent-merge/,
    ],
    [
      'agent-merge uit een andere workflow',
      zet('actions/runs?check_suite_id=55', {
        workflow_runs: [
          { path: '.github/workflows/nep.yml', event: 'pull_request_target', pull_requests: [{ number: 7 }] },
        ],
      }),
      /geen job agent-merge/,
    ],
    [
      'agent-merge uit guard.yml maar met event pull_request (PR-branch)',
      zet('actions/runs?check_suite_id=55', {
        workflow_runs: [{ path: '.github/workflows/guard.yml', event: 'pull_request', pull_requests: [{ number: 7 }] }],
      }),
      /geen job agent-merge/,
    ],
    [
      'agent-merge uit guard.yml voor een andere PR met dezelfde head',
      zet('actions/runs?check_suite_id=55', {
        workflow_runs: [
          { path: '.github/workflows/guard.yml', event: 'pull_request_target', pull_requests: [{ number: 8 }] },
        ],
      }),
      /geen job agent-merge/,
    ],
    [
      'Codex met open punten op de head, daarna een 👍',
      (w: Wereld) => {
        w[`repos/${REPO}/issues/7/comments`] = [
          { user: { login: 'x' }, body: `Review ${HEAD}: geen blokkerende bevindingen` },
          {
            user: { login: CODEX },
            body: codexSamenvatting({ status: 'completed', commit_sha: HEAD, has_unresolved_findings: true }),
          },
        ];
        w[`repos/${REPO}/issues/7/reactions`] = [
          { user: { login: CODEX }, content: '+1', created_at: '2026-11-03T10:05:00Z' },
        ];
      },
      /open punten/,
    ],
    [
      'agent-merge overgeslagen (conclusie skipped)',
      zet(`commits/${HEAD}/check-runs`, {
        check_runs: [
          ...VEREIST.map((n) => check(n, HEAD)),
          check('agent-merge', HEAD, { id: 9, conclusion: 'skipped', check_suite: { id: 55 } }),
        ],
      }),
      /agent-merge is skipped/,
    ],
    [
      'een oudere Codex-samenvatting zonder punten, de nieuwste met open punten',
      zet('issues/7/comments', [
        { user: { login: 'x' }, body: `Review ${HEAD}: geen blokkerende bevindingen` },
        {
          user: { login: CODEX },
          body: codexSamenvatting({ status: 'completed', commit_sha: HEAD, has_unresolved_findings: false }),
        },
        {
          user: { login: CODEX },
          body: codexSamenvatting({ status: 'completed', commit_sha: HEAD, has_unresolved_findings: true }),
        },
      ]),
      /Codex/,
    ],
    [
      'agent-merge van een andere app',
      zet(`commits/${HEAD}/check-runs`, {
        check_runs: [
          ...VEREIST.map((n) => check(n, HEAD)),
          check('agent-merge', HEAD, { app: { id: 1 }, check_suite: { id: 55 } }),
        ],
      }),
      /geen job agent-merge/,
    ],
    [
      'main rood',
      zet(`commits/${MAIN}/check-runs`, { check_runs: [check('gate:fast', MAIN, { conclusion: 'failure' })] }),
      /main is niet groen/,
    ],
    [
      'main loopt nog',
      zet(`commits/${MAIN}/check-runs`, {
        check_runs: [check('gate:fast', MAIN, { status: 'in_progress', conclusion: null })],
      }),
      /main is niet groen/,
    ],
    [
      'main zonder checks',
      zet(`commits/${MAIN}/check-runs`, { check_runs: [] }),
      /geen verplichte check op de kop van main/,
    ],
    [
      'review op een oude SHA',
      zet('issues/7/comments', [
        { user: { login: 'x' }, body: `Review ${'c'.repeat(40)}: geen blokkerende bevindingen` },
        {
          user: { login: CODEX },
          body: codexSamenvatting({ status: 'completed', commit_sha: HEAD, has_unresolved_findings: false }),
        },
      ]),
      /verse review/,
    ],
    [
      'Codex loopt nog (👀)',
      (w: Wereld) => {
        w[`repos/${REPO}/issues/7/comments`] = [
          { user: { login: 'x' }, body: `Review ${HEAD}: geen blokkerende bevindingen` },
          {
            user: { login: CODEX },
            body: codexSamenvatting({ status: 'running', commit_sha: HEAD, has_unresolved_findings: null }),
          },
        ];
        w[`repos/${REPO}/issues/7/reactions`] = [
          { user: { login: CODEX }, content: 'eyes', created_at: '2026-11-03T10:01:00Z' },
        ];
      },
      /Codex/,
    ],
    [
      'Codex op een andere SHA',
      zet('issues/7/comments', [
        { user: { login: 'x' }, body: `Review ${HEAD}: geen blokkerende bevindingen` },
        {
          user: { login: CODEX },
          body: codexSamenvatting({ status: 'completed', commit_sha: MAIN, has_unresolved_findings: false }),
        },
      ]),
      /Codex/,
    ],
    [
      'Codex met open punten',
      zet('issues/7/comments', [
        { user: { login: 'x' }, body: `Review ${HEAD}: geen blokkerende bevindingen` },
        {
          user: { login: CODEX },
          body: codexSamenvatting({ status: 'completed', commit_sha: HEAD, has_unresolved_findings: true }),
        },
      ]),
      /Codex/,
    ],
    [
      'Codex-samenvatting door iemand anders geschreven',
      zet('issues/7/comments', [
        { user: { login: 'x' }, body: `Review ${HEAD}: geen blokkerende bevindingen` },
        {
          user: { login: 'BramLambertJansen' },
          body: codexSamenvatting({ status: 'completed', commit_sha: HEAD, has_unresolved_findings: false }),
        },
      ]),
      /Codex/,
    ],
  ])('%s', (_naam, aanpassing, reden) => {
    expect(redenen(aanpassing)).toMatch(reden);
  });

  test('een 👍 van Codex na de push telt, een 👍 van vóór de push niet', () => {
    const zonderSamenvatting = (tijd: string) => (w: Wereld) => {
      w[`repos/${REPO}/issues/7/comments`] = [
        { user: { login: 'x' }, body: `Review ${HEAD}: geen blokkerende bevindingen` },
      ];
      w[`repos/${REPO}/issues/7/reactions`] = [{ user: { login: CODEX }, content: '+1', created_at: tijd }];
    };
    expect(redenen(zonderSamenvatting('2026-11-03T10:05:00Z'))).toBe('');
    expect(redenen(zonderSamenvatting('2026-11-03T09:55:00Z'))).toMatch(/Codex/);
  });

  test('een run zonder pull_requests (GitHub laat die bij pull_request_target soms leeg) telt', () => {
    expect(
      redenen(
        zet('actions/runs?check_suite_id=55', {
          workflow_runs: [{ path: '.github/workflows/guard.yml', event: 'pull_request_target', pull_requests: [] }],
        }),
      ),
    ).toBe('');
  });

  test('agentMerge.codex false slaat Codex over', () => {
    expect(
      redenen((w) => {
        w[`repos/${REPO}/contents/.claude/gates.json?ref=${MAIN}`] = {
          content: b64({ merge: 'niet-kritiek', agentMerge: { toegestaan: ['src/**'], kritiek: [], codex: false } }),
        };
        w[`repos/${REPO}/issues/7/comments`] = [
          { user: { login: 'x' }, body: `Review ${HEAD}: geen blokkerende bevindingen` },
        ];
      }),
    ).toBe('');
  });

  test('de Codex-stand komt uit het HTML-gecodeerde commentaar', () => {
    expect(codexStand(codexSamenvatting({ status: 'completed', commit_sha: HEAD }))).toEqual({
      status: 'completed',
      commit_sha: HEAD,
    });
    expect(codexStand('geen marker')).toBeNull();
  });

  test.each([[[]], [['0']], [['7', '8']], [['7;x']], [['abc']]])('ongeldig argument %j', (args) => {
    expect(() => nummerUit(args)).toThrow(/Gebruik: pnpm pr:merge <nummer>/);
  });
});
