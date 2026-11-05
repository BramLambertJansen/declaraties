import { describe, expect, test } from 'vitest';
import * as kit from '../../scripts/kit/pr-merge.mjs';
import { beoordeelMerge } from '../../scripts/kit/pr-merge.mjs';

// `pnpm pr:merge` telt de bytes per bestand op het veld `patch` van `pulls/<nr>/files` (spec agent-merge-bytegrens AC-4).
// Verwachte signatuur: `omvangRedenen(pull, files, { maxRegels, maxBytes })`, redenen in de volgorde regelgrens, bytegrens,
// dan per bestand zonder patch. Via de module aangeroepen, zodat dit bestand vóór de bouw compileert.
const REPO = 'BramLambertJansen/template';
const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const ACTIONS = 15368;
const VEREIST = ['gate:fast', 'document-status'];
const GRENZEN = { maxRegels: 400, maxBytes: 40000 };
const BYTES_ONLEESBAAR = 'omvang van de PR niet leesbaar of agentMerge.maxBytes ontbreekt: geen agent-merge';
const teGrootBytes = (n: number) =>
  `PR te groot voor een agent-merge: ${String(n)} bytes gewijzigd, grens 40000 (agentMerge.maxBytes)`;
const b64 = (waarde: unknown) => Buffer.from(JSON.stringify(waarde)).toString('base64');

function omvangRedenen(pull: unknown, files: unknown[], grenzen: unknown = GRENZEN): unknown {
  const waarde: unknown = Reflect.get(kit, 'omvangRedenen');
  if (typeof waarde !== 'function') throw new Error('scripts/kit/pr-merge.mjs exporteert omvangRedenen niet');
  const resultaat: unknown = Reflect.apply(waarde, undefined, [pull, files, grenzen]);
  return resultaat;
}

/** Een REST-bestand met een patch zonder kopregels; `additions` en `deletions` kloppen met de patch. */
function bestand(filename: string, erbij: string[], eraf: string[] = []) {
  const hunk = `@@ -1,${String(eraf.length)} +1,${String(erbij.length)} @@`;
  const patch = [hunk, ...eraf.map((r) => `-${r}`), ...erbij.map((r) => `+${r}`)].join('\n');
  const [additions, deletions] = [erbij.length, eraf.length];
  return { filename, status: 'modified', additions, deletions, changes: additions + deletions, patch };
}

const pullVan = (files: { additions: number; deletions: number }[]) => ({
  additions: files.reduce((som, f) => som + f.additions, 0),
  deletions: files.reduce((som, f) => som + f.deletions, 0),
});

const x = (n: number) => 'x'.repeat(n);
const reeks = (aantal: number, lengte: number) => Array.from({ length: aantal }, () => x(lengte));

describe('agent-merge-bytegrens/AC-4 pr:merge telt bytes op het veld patch', () => {
  test.each([
    ['40.000 bytes in 400 regels', [bestand('src/web/a.ts', reeks(400, 100))], []],
    ['40.001 bytes in 400 regels', [bestand('src/web/a.ts', [...reeks(399, 100), x(101)])], [teGrootBytes(40001)]],
    ['één lange regel van 50.000 bytes', [bestand('src/web/min.js', [x(50000)])], [teGrootBytes(50000)]],
    [
      'bytes over twee bestanden opgeteld',
      [bestand('src/web/a.ts', reeks(300, 100)), bestand('docs/b.md', [x(5000)], [x(5001)])],
      [teGrootBytes(40001)],
    ],
  ])('agent-merge-bytegrens/AC-4: %s', (_naam, files, verwacht) => {
    expect(omvangRedenen(pullVan(files), files)).toEqual(verwacht);
  });

  test('agent-merge-bytegrens/AC-4: de gevallen uit AC-2 in één patch (é, CRLF, \\ No newline, ++x, ---, -- sql)', () => {
    const patch = [
      '@@ -1,3 +1,3 @@',
      '---',
      '-- sql',
      '-a\r',
      '++x',
      '+é',
      '+bc\r',
      '\\ No newline at end of file',
    ].join('\n');
    const file = { filename: 'db/x.sql', status: 'modified', additions: 3, deletions: 3, changes: 6, patch };
    // --- (2) + -- sql (5) + a\r (2) + ++x (2) + é (2) + bc\r (3) = 16 bytes; ++x en --- tellen ook als regel.
    expect(omvangRedenen({ additions: 3, deletions: 3 }, [file], { maxRegels: 400, maxBytes: 16 })).toEqual([]);
    expect(omvangRedenen({ additions: 3, deletions: 3 }, [file], { maxRegels: 400, maxBytes: 15 })).toEqual([
      'PR te groot voor een agent-merge: 16 bytes gewijzigd, grens 15 (agentMerge.maxBytes)',
    ]);
  });

  test.each([
    [
      'afgekapte patch: minder + regels dan additions van het bestand',
      [{ ...bestand('src/web/a.ts', reeks(10, 10)), additions: 400, changes: 400 }],
      { additions: 400, deletions: 0 },
    ],
    [
      'afgekapte patch: minder - regels dan deletions van het bestand',
      [{ ...bestand('src/web/a.ts', reeks(1, 10), reeks(2, 10)), deletions: 3, changes: 4 }],
      { additions: 1, deletions: 3 },
    ],
    [
      'de som wijkt af van additions + deletions van de PR',
      [bestand('src/web/a.ts', reeks(10, 10))],
      { additions: 11, deletions: 0 },
    ],
    [
      'additions van het bestand ontbreekt',
      [{ ...bestand('src/web/a.ts', reeks(10, 10)), additions: undefined }],
      { additions: 10, deletions: 0 },
    ],
    [
      'deletions van het bestand is tekst',
      [{ ...bestand('src/web/a.ts', reeks(10, 10)), deletions: '0' }],
      { additions: 10, deletions: 0 },
    ],
  ])('agent-merge-bytegrens/AC-4: %s: onleesbaar-melding', (_naam, files, pull) => {
    expect(omvangRedenen(pull, files)).toEqual([BYTES_ONLEESBAAR]);
  });

  test('agent-merge-bytegrens/AC-4: een bestand zonder patch blijft geweigerd zoals nu', () => {
    const files = [{ filename: 'docs/x.png', status: 'added', additions: 0, deletions: 0, changes: 0 }];
    expect(omvangRedenen({ additions: 0, deletions: 0 }, files)).toEqual([
      'binair bestand in de PR: geen agent-merge (docs/x.png)',
    ]);
  });

  test('agent-merge-bytegrens/AC-4: een zuivere hernoeming zonder patch: 0 bytes, geen reden', () => {
    const files = [
      { filename: 'src/web/nieuw.ts', previous_filename: 'src/web/oud.ts', status: 'renamed', changes: 0 },
    ];
    expect(omvangRedenen({ additions: 0, deletions: 0 }, files)).toEqual([]);
  });

  test('agent-merge-bytegrens/AC-4: regelgrens en bytegrens samen, in die volgorde', () => {
    const files = [bestand('src/web/a.ts', reeks(401, 100))];
    expect(omvangRedenen(pullVan(files), files)).toEqual([
      'PR te groot voor een agent-merge: 401 regels, grens 400 (agentMerge.maxRegels)',
      teGrootBytes(40100),
    ]);
  });
});

describe('agent-merge-bytegrens/AC-4 beoordeelMerge leest maxBytes van main', () => {
  const REVIEW = { user: { login: 'BramLambertJansen' }, body: `Review ${HEAD}: geen blokkerende bevindingen` };
  const check = (name: string, extra: Record<string, unknown> = {}) => ({
    id: 1,
    name,
    head_sha: HEAD,
    status: 'completed',
    conclusion: 'success',
    app: { id: ACTIONS },
    ...extra,
  });
  const gates = (agentMerge: Record<string, unknown>) => ({
    content: b64({
      merge: 'niet-kritiek',
      agentMerge: { toegestaan: ['src/**'], kritiek: [], codex: false, maxRegels: 400, ...agentMerge },
    }),
  });

  function wereld(files: ReturnType<typeof bestand>[], agentMerge: Record<string, unknown> = { maxBytes: 40000 }) {
    const w: Record<string, unknown> = {
      [`repos/${REPO}/branches/main`]: { commit: { sha: MAIN } },
      [`repos/${REPO}/contents/.claude/gates.json?ref=${MAIN}`]: gates(agentMerge),
      [`repos/${REPO}/contents/.claude/decisions.json?ref=${MAIN}`]: { content: b64({ requiredChecks: VEREIST }) },
      [`repos/${REPO}/pulls/7`]: {
        state: 'open',
        draft: false,
        base: { ref: 'main' },
        head: { sha: HEAD, ref: 'claude/x', repo: { full_name: REPO } },
        ...pullVan(files),
      },
      [`repos/${REPO}/pulls/7/files`]: files,
      [`repos/${REPO}/compare/${MAIN}...${HEAD}`]: { behind_by: 0 },
      [`repos/${REPO}/commits/${HEAD}/check-runs`]: {
        check_runs: [...VEREIST.map((n) => check(n)), check('agent-merge', { id: 9, check_suite: { id: 55 } })],
      },
      [`repos/${REPO}/actions/runs?check_suite_id=55`]: {
        workflow_runs: [
          { path: '.github/workflows/guard.yml', event: 'pull_request_target', pull_requests: [{ number: 7 }] },
        ],
      },
      [`repos/${REPO}/commits/${MAIN}/check-runs`]: { check_runs: [{ ...check('gate:fast'), head_sha: MAIN }] },
      [`repos/${REPO}/issues/7/comments`]: [REVIEW],
    };
    return (endpoint: string) => {
      const sleutel = endpoint.replace(/[?&]per_page=100&page=\d+$/, '');
      if (!(sleutel in w)) throw new Error(`onbekend endpoint ${sleutel}`);
      return w[sleutel];
    };
  }

  test('agent-merge-bytegrens/AC-4: 40.000 bytes: geen reden', () => {
    const api = wereld([bestand('src/web/a.ts', reeks(400, 100))]);
    expect(beoordeelMerge(api, { repo: REPO, nummer: 7, head: HEAD })).toEqual({ redenen: [], codex: 'uit' });
  });

  test('agent-merge-bytegrens/AC-4: 40.001 bytes: de bytes-reden', () => {
    const api = wereld([bestand('src/web/a.ts', [...reeks(399, 100), x(101)])]);
    expect(beoordeelMerge(api, { repo: REPO, nummer: 7, head: HEAD }).redenen).toEqual([teGrootBytes(40001)]);
  });

  test.each([[undefined], [0], ['40000']])(
    'agent-merge-bytegrens/AC-4: maxBytes %j op main: alleen de bytes-melding, geen merge',
    (maxBytes) => {
      const api = wereld([bestand('src/web/a.ts', reeks(1, 1))], { maxBytes });
      expect(beoordeelMerge(api, { repo: REPO, nummer: 7, head: HEAD })).toEqual({
        redenen: [BYTES_ONLEESBAAR],
        codex: null,
      });
    },
  );
});
