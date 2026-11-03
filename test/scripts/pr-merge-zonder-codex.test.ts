import { describe, expect, test } from 'vitest';
import {
  CODEX,
  STEEKPROEF_UIT,
  STEEKPROEF_VERVIEL,
  beoordeelMerge,
  slotRegels,
  voorwaarden,
} from '../../scripts/kit/pr-merge.mjs';

// `pnpm pr:merge` met omvanggrens en drieledige Codex-voorwaarde (ADR 0069 herzien, spec agent-merge-zonder-codex AC-3 tot
// en met AC-5): nagebootste REST-antwoorden. De wereld `goed` is mergebaar zonder Codex-spoor (`indien-aanwezig`).
const REPO = 'BramLambertJansen/template';
const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const OUD = 'c'.repeat(40);
const ACTIONS = 15368;
const VEREIST = ['gate:fast', 'document-status'];
const BRANCH = `pulls?head=BramLambertJansen:${encodeURIComponent('claude/x')}&state=all`;
const REVIEW = { user: { login: 'BramLambertJansen' }, body: `Review ${HEAD}: geen blokkerende bevindingen` };
const b64 = (waarde: unknown) => Buffer.from(JSON.stringify(waarde)).toString('base64');

type Wereld = Record<string, unknown>;

function check(name: string, sha: string, extra: Record<string, unknown> = {}) {
  return { id: 1, name, head_sha: sha, status: 'completed', conclusion: 'success', app: { id: ACTIONS }, ...extra };
}

const samenvatting = (stand: Record<string, unknown>, login = CODEX) => ({
  user: { login },
  body: `<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 ${JSON.stringify({ code_review: stand }).replaceAll('{', '&#123;').replaceAll('}', '&#125;')} -->`,
});
// Wat Codex achterlaat als het tegoed op is (#447–#453): een samenvatting `failed` en een limietmelding zonder marker.
const TEGOED_OP = [
  samenvatting({ commit_sha: HEAD, has_any_findings: true, has_unresolved_findings: true, status: 'failed' }),
  { user: { login: CODEX }, body: 'You have reached your Codex usage limits for code reviews.' },
];

const gatesMet = (agentMerge: Record<string, unknown>) => ({
  content: b64({ merge: 'niet-kritiek', agentMerge: { toegestaan: ['src/**'], kritiek: [], ...agentMerge } }),
});

const PULL = {
  state: 'open',
  draft: false,
  base: { ref: 'main' },
  head: { sha: HEAD, ref: 'claude/x', repo: { full_name: REPO } },
  additions: 300,
  deletions: 100,
};

function goed(): Wereld {
  return {
    [`repos/${REPO}/branches/main`]: { commit: { sha: MAIN } },
    [`repos/${REPO}/contents/.claude/gates.json?ref=${MAIN}`]: gatesMet({ codex: 'indien-aanwezig', maxRegels: 400 }),
    [`repos/${REPO}/contents/.claude/decisions.json?ref=${MAIN}`]: { content: b64({ requiredChecks: VEREIST }) },
    [`repos/${REPO}/pulls/7`]: PULL,
    [`repos/${REPO}/pulls/7/files`]: [{ filename: 'src/web/x.ts', status: 'modified', changes: 400, patch: '@@' }],
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
    [`repos/${REPO}/issues/7/comments`]: [REVIEW],
    [`repos/${REPO}/issues/7/reactions`]: [],
    [`repos/${REPO}/pulls/7/reviews`]: [],
    [`repos/${REPO}/pulls/7/comments`]: [],
    [`repos/${REPO}/${BRANCH}`]: [{ number: 7, merged_at: null }],
    [`repos/${REPO}/commits/${HEAD}/check-suites`]: { check_suites: [{ created_at: '2026-11-03T10:00:00Z' }] },
  };
}

function api(wereld: Wereld) {
  return (endpoint: string) => {
    const sleutel = endpoint.replace(/[?&]per_page=100&page=\d+$/, '');
    if (!(sleutel in wereld)) throw new Error(`onbekend endpoint ${sleutel}`);
    const waarde = wereld[sleutel];
    if (waarde instanceof Error) throw waarde;
    return waarde;
  };
}

function uitslag(aanpassing: (w: Wereld) => void = () => {}) {
  const wereld = goed();
  aanpassing(wereld);
  return beoordeelMerge(api(wereld), { repo: REPO, nummer: 7, head: HEAD });
}

const redenen = (aanpassing?: (w: Wereld) => void) => uitslag(aanpassing).redenen.join('\n');

const zet =
  (...paren: [string, unknown][]) =>
  (w: Wereld) => {
    for (const [sleutel, waarde] of paren) w[`repos/${REPO}/${sleutel}`] = waarde;
  };

// Een andere PR (8) van dezelfde branch, met of zonder merge, met Codex-sporen.
const anderePr = (mergedAt: string | null, spoor: Record<string, unknown>) =>
  zet(
    [
      BRANCH,
      [
        { number: 7, merged_at: null },
        { number: 8, merged_at: mergedAt },
      ],
    ],
    ['issues/8/comments', []],
    ['issues/8/reactions', []],
    ['pulls/8/reviews', []],
    ['pulls/8/comments', []],
    ...Object.entries(spoor).map(([k, v]): [string, unknown] => [k, v]),
  );

describe('agent-merge-zonder-codex/AC-3 pr:merge telt de omvang via REST', () => {
  test('400 regels bij grens 400: geen reden', () => {
    expect(redenen()).toBe('');
  });

  test.each([
    [
      '401 regels',
      zet(['pulls/7', { ...PULL, deletions: 101 }]),
      'PR te groot voor een agent-merge: 401 regels, grens 400 (agentMerge.maxRegels)',
    ],
    [
      'een bestand zonder patch met changes 3',
      zet(['pulls/7/files', [{ filename: 'src/web/groot.ts', status: 'modified', changes: 3 }]]),
      'binair bestand in de PR: geen agent-merge (src/web/groot.ts)',
    ],
    [
      'een binair bestand (changes 0, geen patch)',
      zet(['pulls/7/files', [{ filename: 'docs/x.png', status: 'added', changes: 0 }]]),
      'binair bestand in de PR: geen agent-merge (docs/x.png)',
    ],
    [
      'additions onleesbaar',
      zet(['pulls/7', { ...PULL, additions: undefined }]),
      'omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge',
    ],
    [
      'agentMerge zonder maxRegels',
      zet([`contents/.claude/gates.json?ref=${MAIN}`, gatesMet({ codex: 'indien-aanwezig' })]),
      'omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge',
    ],
    [
      'agentMerge.toegestaan is tekst, maxRegels geldig',
      zet([`contents/.claude/gates.json?ref=${MAIN}`, gatesMet({ toegestaan: 'src/**', maxRegels: 400 })]),
      'agentMerge ontbreekt of is onleesbaar in .claude/gates.json',
    ],
  ])('%s', (_naam, aanpassing, reden) => {
    expect(uitslag(aanpassing).redenen).toEqual([reden]);
  });

  test('agentMerge ontbreekt op main: beide redenen', () => {
    expect(
      uitslag(zet([`contents/.claude/gates.json?ref=${MAIN}`, { content: b64({ merge: 'niet-kritiek' }) }])).redenen,
    ).toEqual([
      'agentMerge ontbreekt of is onleesbaar in .claude/gates.json',
      'omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge',
    ]);
  });

  test('zuivere hernoeming (renamed, changes 0, geen patch): geen reden', () => {
    expect(
      redenen(
        zet([
          'pulls/7/files',
          [{ filename: 'src/web/nieuw.ts', previous_filename: 'src/web/oud.ts', status: 'renamed', changes: 0 }],
        ]),
      ),
    ).toBe('');
  });
});

describe('agent-merge-zonder-codex/AC-4 Codex-voorwaarde bij indien-aanwezig', () => {
  test.each([
    ['geen spoor', () => {}],
    [
      'alleen 👀',
      zet(['issues/7/reactions', [{ user: { login: CODEX }, content: 'eyes', created_at: '2026-11-03T10:01:00Z' }]]),
    ],
    ['samenvatting failed plus limietmelding (tegoed op)', zet(['issues/7/comments', [REVIEW, ...TEGOED_OP]])],
    [
      'spoor alleen op een gemergde PR van dezelfde branch',
      anderePr('2026-11-02T10:00:00Z', {
        'issues/8/comments': [samenvatting({ status: 'completed', commit_sha: OUD, has_unresolved_findings: true })],
      }),
    ],
    [
      'marker completed van een ander account',
      zet([
        'issues/7/comments',
        [REVIEW, samenvatting({ status: 'completed', commit_sha: OUD, has_unresolved_findings: true }, 'iemand')],
      ]),
    ],
  ])('%s → geen Codex-reden, voorwaarde verviel', (_naam, aanpassing) => {
    const u = uitslag(aanpassing);
    expect(u.redenen).toEqual([]);
    expect(u.codex).toBe('verviel');
  });

  test.each([
    [
      'samenvatting completed op een oudere SHA',
      zet([
        'issues/7/comments',
        [REVIEW, samenvatting({ status: 'completed', commit_sha: OUD, has_unresolved_findings: false })],
      ]),
      /niet afgerond beoordeeld/,
    ],
    [
      'samenvatting completed op de head met open punten',
      zet([
        'issues/7/comments',
        [REVIEW, samenvatting({ status: 'completed', commit_sha: HEAD, has_unresolved_findings: true })],
      ]),
      /open punten/,
    ],
    [
      '👍 van vóór de push van de head',
      zet(['issues/7/reactions', [{ user: { login: CODEX }, content: '+1', created_at: '2026-11-03T09:00:00Z' }]]),
      /niet afgerond beoordeeld/,
    ],
    [
      '👍 van een eerdere ronde, daarna een samenvatting failed op de head',
      zet(
        ['issues/7/reactions', [{ user: { login: CODEX }, content: '+1', created_at: '2026-11-03T09:00:00Z' }]],
        ['issues/7/comments', [REVIEW, ...TEGOED_OP]],
      ),
      /open punten/,
    ],
    [
      'alleen een inline-reviewcommentaar',
      zet(['pulls/7/comments', [{ user: { login: CODEX }, body: 'P1: x' }]]),
      /niet afgerond beoordeeld/,
    ],
    [
      'alleen een PR-review',
      zet(['pulls/7/reviews', [{ user: { login: CODEX }, state: 'COMMENTED', commit_id: OUD }]]),
      /niet afgerond beoordeeld/,
    ],
    [
      'spoor alleen op een PR van dezelfde branch die zonder merge is gesloten',
      anderePr(null, { 'pulls/8/reviews': [{ user: { login: CODEX }, state: 'COMMENTED', commit_id: OUD }] }),
      /niet afgerond beoordeeld/,
    ],
    [
      'codex "ja" geldt als true: zonder spoor toch de Codex-voorwaarde',
      zet([`contents/.claude/gates.json?ref=${MAIN}`, gatesMet({ codex: 'ja', maxRegels: 400 })]),
      /niet afgerond beoordeeld/,
    ],
  ])('%s → Codex-reden', (_naam, aanpassing, reden) => {
    const u = uitslag(aanpassing);
    expect(u.redenen.join('\n')).toMatch(reden);
    expect(u.codex).toBe('voldaan');
  });

  test('een spoor zonder open punten op de head: voorwaarde voldaan, geen reden', () => {
    const u = uitslag(
      zet([
        'issues/7/comments',
        [REVIEW, samenvatting({ status: 'completed', commit_sha: HEAD, has_unresolved_findings: false })],
      ]),
    );
    expect(u).toEqual({ redenen: [], codex: 'voldaan' });
  });

  test.each([
    ['reviews', 'pulls/7/reviews'],
    ['inline-commentaar', 'pulls/7/comments'],
    ["PR's van de branch", BRANCH],
  ])('lijst met %s geeft HTTP 500: fout, geen merge', (_naam, sleutel) => {
    expect(() =>
      voorwaarden(api({ ...goed(), [`repos/${REPO}/${sleutel}`]: new Error('HTTP 500') }), {
        repo: REPO,
        nummer: 7,
        head: HEAD,
      }),
    ).toThrow();
  });

  test('lijst met reviews is geen lijst: fout, geen merge', () => {
    expect(() => redenen(zet(['pulls/7/reviews', { message: 'Server Error' }]))).toThrow(/geen lijst/);
  });
});

describe('agent-merge-zonder-codex/AC-5 steekproefregel na de merge', () => {
  test.each([
    ['verviel', 'zonder spoor bij indien-aanwezig', () => {}],
    [
      'uit',
      'codex false',
      zet([`contents/.claude/gates.json?ref=${MAIN}`, gatesMet({ codex: false, maxRegels: 400 })]),
    ],
    [
      'voldaan',
      'spoor bij indien-aanwezig',
      zet([
        'issues/7/comments',
        [REVIEW, samenvatting({ status: 'completed', commit_sha: HEAD, has_unresolved_findings: false })],
      ]),
    ],
    [
      'voldaan',
      'codex true',
      (w: Wereld) => {
        zet([`contents/.claude/gates.json?ref=${MAIN}`, gatesMet({ codex: true, maxRegels: 400 })])(w);
        zet(['issues/7/reactions', [{ user: { login: CODEX }, content: '+1', created_at: '2026-11-03T10:05:00Z' }]])(w);
      },
    ],
  ])('stand %s bij %s, zonder redenen', (stand, _naam, aanpassing) => {
    expect(uitslag(aanpassing)).toEqual({ redenen: [], codex: stand });
  });

  const EERSTE = `PR #7 gemerged op ${HEAD}. Meld PR en SHA in de thread en volg de CI op main (ADR 0069 punt 5).`;

  test.each([
    ['verviel', [EERSTE, STEEKPROEF_VERVIEL]],
    ['uit', [EERSTE, STEEKPROEF_UIT]],
    ['voldaan', [EERSTE]],
  ] as const)('slotregels bij %s', (stand, verwacht) => {
    expect(slotRegels(7, HEAD, stand)).toEqual(verwacht);
  });

  test('de steekproefregels zijn letterlijk die uit de spec', () => {
    expect(STEEKPROEF_VERVIEL).toBe(
      'Geen Codex-spoor op deze PR of zijn branch: de Codex-voorwaarde verviel (indien-aanwezig). Meld deze merge als steekproef (ADR 0069 punt 5).',
    );
    expect(STEEKPROEF_UIT).toBe(
      'Geen Codex-voorwaarde (agentMerge.codex: false). Meld deze merge als steekproef (ADR 0069 punt 5).',
    );
  });
});
