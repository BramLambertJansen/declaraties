import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { AGENT_MERGE_ONLEESBAAR, agentMergeFouten, leesAgentMerge } from '../../scripts/kit/agent-merge.mjs';
import { agentMerge, leesConfig } from '../../scripts/kit/diff-guard.mjs';
import { CODEX, beoordeelMerge } from '../../scripts/kit/pr-merge.mjs';
import { OUD, nieuw, object } from '../rails/padtabel-kit';

// padtabel/AC-5: `pr:merge` en de diff-guard lezen de `gates.json` van main in de nieuwe vorm (a) en de oude vorm van
// 30cc352 (b); beide vormen tegelijk (c) faalt dicht zonder crash. Nep-API zoals test/scripts/pr-merge.test.ts.
const REPO = 'BramLambertJansen/template';
const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const ACTIONS = 15368;
const VEREIST = ['gate:fast', 'document-status'];
const GATES = `repos/${REPO}/contents/.claude/gates.json?ref=${MAIN}`;
const b64 = (waarde: unknown) => Buffer.from(JSON.stringify(waarde)).toString('base64');

type Wereld = Record<string, unknown>;

const check = (name: string, sha: string, extra: Record<string, unknown> = {}) => ({
  id: 1,
  name,
  head_sha: sha,
  status: 'completed',
  conclusion: 'success',
  app: { id: ACTIONS },
  ...extra,
});

const codexSamenvatting = (stand: Record<string, unknown>) =>
  `<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 ${JSON.stringify({ code_review: stand }).replaceAll('{', '&#123;').replaceAll('}', '&#125;')} -->`;

function wereld(gates: unknown, regels = 12): Wereld {
  return {
    [`repos/${REPO}/branches/main`]: { commit: { sha: MAIN } },
    [GATES]: { content: b64(gates) },
    [`repos/${REPO}/contents/.claude/decisions.json?ref=${MAIN}`]: { content: b64({ requiredChecks: VEREIST }) },
    [`repos/${REPO}/pulls/7`]: {
      state: 'open',
      draft: false,
      base: { ref: 'main' },
      head: { sha: HEAD, repo: { full_name: REPO } },
      additions: regels - 2,
      deletions: 2,
    },
    [`repos/${REPO}/pulls/7/files`]: [
      {
        filename: 'src/web/x.ts',
        status: 'modified',
        additions: regels - 2,
        deletions: 2,
        changes: regels,
        patch: ['@@ -1,2 +1,10 @@', '-a', '-b', ...Array.from({ length: regels - 2 }, (_, i) => `+r${String(i)}`)].join(
          '\n',
        ),
      },
    ],
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

function api(w: Wereld) {
  return (endpoint: string) => {
    const sleutel = endpoint.replace(/[?&]per_page=100&page=\d+$/, '');
    if (!(sleutel in w)) throw new Error(`onbekend endpoint ${sleutel}`);
    return w[sleutel];
  };
}

const redenen = (w: Wereld) => beoordeelMerge(api(w), { repo: REPO, nummer: 7, head: HEAD }).redenen;

const NIEUW = nieuw();
const BEIDE = { ...nieuw(), gates: ['src/core/**'] };
const VORMEN: [string, Record<string, unknown>][] = [
  ['(a) nieuwe vorm', NIEUW],
  ['(b) oude vorm van 30cc352', OUD.ruw],
];

const OORDEEL = {
  uitslag: 'groen' as const,
  redenen: [],
  geraakt: { gates: [], tests: [], json: [] },
  risico: { migraties: [], permissies: [], dependencies: [], routes: [] },
};

function pr(paden: string[]) {
  return {
    wijzigingen: paden.map((pad) => ({ status: 'M', pad })),
    json: {},
    reviews: [],
    auteur: 'BramLambertJansen',
    headSha: HEAD,
    regels: 2,
    binair: [],
    bytes: 10,
  };
}

describe('padtabel/AC-5 pr:merge leest agentMerge uit main in beide vormen', () => {
  test.each(VORMEN)(
    '%s: leesAgentMerge en agentMergeFouten zonder "ontbreekt of is onleesbaar" (padtabel/AC-5)',
    (_n, ruw) => {
      expect(leesAgentMerge(ruw)).not.toBeNull();
      expect(agentMergeFouten(ruw)).not.toContain(AGENT_MERGE_ONLEESBAAR);
      expect(agentMergeFouten(ruw)).toEqual([]);
    },
  );

  test.each(VORMEN)('%s: beoordeelMerge merget een geldige PR (padtabel/AC-5)', (_n, ruw) => {
    expect(redenen(wereld(ruw))).toEqual([]);
  });

  test.each(VORMEN)('%s: beoordeelMerge gebruikt maxRegels uit het blok (padtabel/AC-5)', (_n, ruw) => {
    const blok = { ...object(ruw['agentMerge']), maxRegels: 5 };
    expect(redenen(wereld({ ...ruw, agentMerge: blok })).join('\n')).toMatch(
      /PR te groot.*grens 5 \(agentMerge\.maxRegels\)/,
    );
  });

  test.each(VORMEN)('%s: beoordeelMerge gebruikt maxBytes uit het blok (padtabel/AC-5)', (_n, ruw) => {
    const blok = { ...object(ruw['agentMerge']), maxBytes: 3 };
    expect(redenen(wereld({ ...ruw, agentMerge: blok })).join('\n')).toMatch(/grens 3 \(agentMerge\.maxBytes\)/);
  });

  test.each(VORMEN)('%s: beoordeelMerge gebruikt codex uit het blok (padtabel/AC-5)', (_n, ruw) => {
    const zonderCodex = (codex: boolean) => {
      const w = wereld({ ...ruw, agentMerge: { ...object(ruw['agentMerge']), codex } });
      w[`repos/${REPO}/issues/7/comments`] = [
        { user: { login: 'x' }, body: `Review ${HEAD}: geen blokkerende bevindingen` },
      ];
      return redenen(w);
    };
    expect(zonderCodex(false)).toEqual([]);
    expect(zonderCodex(true).join('\n')).toMatch(/Codex/);
  });
});

describe('padtabel/AC-5 het padoordeel van de diff-guard in beide vormen', () => {
  test.each(VORMEN)('%s: alleen src/web/x.ts is ja, met .claude/settings.json erbij nee (padtabel/AC-5)', (_n, ruw) => {
    const tekst = JSON.stringify(ruw);
    expect(agentMerge(pr(['src/web/x.ts']), OORDEEL, tekst)).toEqual({ oordeel: 'ja', redenen: [] });
    expect(agentMerge(pr(['src/web/x.ts', '.claude/settings.json']), OORDEEL, tekst).oordeel).toBe('nee');
  });
});

describe('padtabel/AC-5 (c) paden naast gates faalt dicht', () => {
  const tekst = JSON.stringify(BEIDE);

  test('loadConfig en leesConfig gooien (padtabel/AC-5)', () => {
    expect(() => loadConfig(tekst)).toThrow();
    expect(() => leesConfig(tekst)).toThrow();
  });

  test('agentMerge geeft nee, zonder te gooien (padtabel/AC-5)', () => {
    expect(agentMerge(pr(['src/web/x.ts']), OORDEEL, tekst).oordeel).toBe('nee');
  });

  test('beoordeelMerge geeft de lezerfout als reden en merget niet (padtabel/AC-5)', () => {
    const lijst = redenen(wereld(BEIDE));
    expect(lijst.length).toBeGreaterThan(0);
    expect(lijst.join('\n')).toMatch(/paden/);
  });
});
