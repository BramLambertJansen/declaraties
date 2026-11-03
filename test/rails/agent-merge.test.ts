import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { agentMergeOordeel, leesMergeConfig, leesModus } from '../../scripts/kit/agent-merge.mjs';
import { agentMerge, beoordeel, leesConfig, srcTeLezen } from '../../scripts/kit/diff-guard.mjs';
import { agentMergeViolations } from '../../scripts/kit/check-docs.mjs';

// Oordeel agent-merge (ADR 0069 punt 1, spec agent-merge-niet-kritiek AC-1) tegen de echte .claude/gates.json: een toegestane
// lijst, de rest dicht. Elke negatieve regel faalt op een oordeel dat alleen de gates kent.
const TEKST = readFileSync('.claude/gates.json', 'utf8');
const config = leesMergeConfig(TEKST);
const guardConfig = leesConfig(TEKST);
const HEAD = 'a'.repeat(40);

type Wijziging = { status: string; pad: string; van?: string };
type Versies = Record<string, { voor: string | null; na: string | null }>;

function pr(
  wijzigingen: Wijziging[],
  json: Versies = {},
  reviews: { user: string; state: string; commitId: string; submittedAt: string }[] = [],
) {
  return { wijzigingen, json, reviews, auteur: 'BramLambertJansen', headSha: HEAD, regels: 0, binair: [] };
}

function oordeel(wijzigingen: Wijziging[], json: Versies = {}) {
  const p = pr(wijzigingen, json);
  return agentMerge(p, beoordeel(p, guardConfig), TEKST);
}

describe('agent-merge-niet-kritiek/AC-1 ja: alleen app-code, een nieuwe test en een doc buiten de gates', () => {
  test('src/web-code, een nieuwe test en docs/ui-x.md', () => {
    expect(
      oordeel([
        { status: 'M', pad: 'src/web/features/accounts/lijst.tsx' },
        { status: 'A', pad: 'src/web/features/accounts/lijst.test.tsx' },
        { status: 'A', pad: 'test/web/accounts.test.ts' },
        { status: 'A', pad: 'db/tests/x.sql' },
        { status: 'M', pad: 'docs/ui-x.md' },
        { status: 'M', pad: 'CHANGELOG.md' },
      ]),
    ).toEqual({ oordeel: 'ja', redenen: [] });
  });

  test('een tekstwijziging in een bronbestand zonder permission blijft ja', () => {
    const pad = 'src/api/routes/accounts.ts';
    expect(oordeel([{ status: 'M', pad }], { [pad]: { voor: 'const a = 1;\n', na: 'const a = 2;\n' } }).oordeel).toBe(
      'ja',
    );
  });
});

describe('agent-merge-niet-kritiek/AC-1 nee: per uitsluiting', () => {
  test.each([
    ['ADR', { status: 'M', pad: 'docs/adr/0069-agent-merge-niet-kritiek.md' }, /gate-pad/],
    ['spec', { status: 'A', pad: 'docs/specs/x.md' }, /gate-pad/],
    [
      'nieuw .spec.md onder docs/adr',
      { status: 'A', pad: 'docs/adr/0070-x.spec.md' },
      /test buiten de vaste testplekken/,
    ],
    ['nieuwe .test.md onder .claude/agents', { status: 'A', pad: '.claude/agents/x.test.md' }, /vanzelf geladen/],
    ['nieuwe postcss.config.mjs in de root', { status: 'A', pad: 'postcss.config.mjs' }, /vanzelf geladen/],
    ['nieuwe src/web/postcss.config.mjs', { status: 'A', pad: 'src/web/postcss.config.mjs' }, /vanzelf geladen/],
    ['hoofdletters (macOS): src/web/Package.json', { status: 'A', pad: 'src/web/Package.json' }, /vanzelf geladen/],
    [
      'hoofdletters (macOS): src/web/TSConfig.app.json',
      { status: 'A', pad: 'src/web/TSConfig.app.json' },
      /vanzelf geladen/,
    ],
    ['.mcp.json', { status: 'A', pad: '.mcp.json' }, /vanzelf geladen/],
    ['playwright.smoke.config.ts', { status: 'M', pad: 'playwright.smoke.config.ts' }, /vanzelf geladen/],
    ['src/web/CLAUDE.md', { status: 'A', pad: 'src/web/CLAUDE.md' }, /vanzelf geladen/],
    ['docs/AGENTS.md', { status: 'A', pad: 'docs/AGENTS.md' }, /vanzelf geladen/],
    ['src/x/.claude/skills/y.md', { status: 'A', pad: 'src/x/.claude/skills/y.md' }, /vanzelf geladen/],
    ['src/web/package.json', { status: 'A', pad: 'src/web/package.json' }, /vanzelf geladen/],
    ['src/web/tsconfig.json', { status: 'A', pad: 'src/web/tsconfig.json' }, /vanzelf geladen/],
    ['onbekend pad in de root', { status: 'A', pad: 'notities.md' }, /niet op agentMerge\.toegestaan/],
    ['migratie', { status: 'A', pad: 'db/migrations/20261103000000_x.sql' }, /niet op agentMerge\.toegestaan/],
    ['src/core', { status: 'M', pad: 'src/core/shared/can.ts' }, /gate-pad/],
    ['login-policy', { status: 'M', pad: 'src/api/login-policy.ts' }, /agentMerge\.kritiek/],
    ['limits', { status: 'M', pad: 'src/shared/limits.ts' }, /agentMerge\.kritiek/],
    ['contract', { status: 'M', pad: 'src/shared/contracts/accounts.ts' }, /agentMerge\.kritiek/],
    ['agent-doorloop', { status: 'M', pad: 'docs/operations/agent-doorloop.md' }, /agentMerge\.kritiek/],
    ['review-checklist', { status: 'M', pad: 'docs/reviews/x.md' }, /agentMerge\.kritiek/],
    ['gouden pad', { status: 'M', pad: 'docs/gouden-pad.md' }, /agentMerge\.kritiek/],
    ['ontwerpbron', { status: 'A', pad: 'docs/ontwerp/x.md' }, /agentMerge\.kritiek/],
    ['bestaande test gewijzigd', { status: 'M', pad: 'src/api/x.test.ts' }, /bestaande test/],
    ['bestaande test verwijderd', { status: 'D', pad: 'src/api/x.test.ts' }, /bestaande test/],
    ['test hernoemd', { status: 'R', van: 'src/api/x.test.ts', pad: 'src/api/y.test.ts' }, /bestaande test/],
    [
      'nieuwe test als .js buiten de vaste extensies',
      { status: 'A', pad: 'src/web/x.test.js' },
      /test buiten de vaste testplekken/,
    ],
    [
      'hernoemd van een gate naar src/web',
      { status: 'R', van: 'src/core/shared/can.ts', pad: 'src/web/can.ts' },
      /gate-pad/,
    ],
  ])('%s', (_naam, wijziging, reden) => {
    const uitslag = oordeel([wijziging]);
    expect(uitslag.oordeel).toBe('nee');
    expect(uitslag.redenen.join('\n')).toMatch(reden);
  });

  test('een nieuwe permissiesleutel (risico-overzicht)', () => {
    const pad = 'src/shared/permissions.ts';
    const voor = "export const permissions = {\n  'a:read': { roles: ['admin'] },\n};\n";
    const na =
      "export const permissions = {\n  'a:read': { roles: ['admin'] },\n  'b:read': { roles: ['admin'] },\n};\n";
    expect(oordeel([{ status: 'M', pad }], { [pad]: { voor, na } }).oordeel).toBe('nee');
  });

  test('een verwijderde inline permission buiten contracts/', () => {
    const pad = 'src/api/routes/accounts.ts';
    const voor = "defineRoute({ permission: 'accounts:read', handler });\n";
    const na = 'defineRoute({ handler });\n';
    const uitslag = oordeel([{ status: 'M', pad }], { [pad]: { voor, na } });
    expect(uitslag.oordeel).toBe('nee');
    expect(uitslag.redenen.join('\n')).toMatch(/permission toegevoegd of verwijderd/);
  });

  test('een nieuwe defineRoute (risico-overzicht)', () => {
    const pad = 'src/api/routes/x.ts';
    const na = "export const r = defineRoute({ method: 'GET', path: '/api/x', handler });\n";
    expect(oordeel([{ status: 'A', pad }], { [pad]: { voor: null, na } }).oordeel).toBe('nee');
  });

  test('een verwijderd bronbestand met permission (alleen in src, buiten de guard-json)', () => {
    const pad = 'src/api/routes/x.ts';
    const wijzigingen = [{ status: 'D', pad }];
    const p = { ...pr(wijzigingen), src: { [pad]: { voor: "defineRoute({ permission: 'x:read' });\n", na: null } } };
    const guard = beoordeel(p, guardConfig);
    expect(guard).toEqual(beoordeel(pr(wijzigingen), guardConfig));
    const uitslag = agentMerge(p, guard, TEKST);
    expect(uitslag.oordeel).toBe('nee');
    expect(uitslag.redenen.join('\n')).toMatch(/x\.ts: regel met permission/);
  });

  test('srcTeLezen leest elk geraakt bestand onder src/, ook verwijderd, met het basispad', () => {
    expect(
      srcTeLezen([
        { status: 'D', pad: 'src/api/routes/x.ts' },
        { status: 'M', pad: 'src/web/x.json' },
        { status: 'A', pad: 'src/web/y.ts' },
        { status: 'R', pad: 'docs/z.md', van: 'src/web/z.ts' },
        { status: 'M', pad: 'docs/a.md' },
      ]),
    ).toEqual([
      { sleutel: 'src/api/routes/x.ts', pad: 'src/api/routes/x.ts', van: 'src/api/routes/x.ts' },
      { sleutel: 'src/web/x.json', pad: 'src/web/x.json', van: 'src/web/x.json' },
      { sleutel: 'src/web/y.ts', pad: 'src/web/y.ts', van: undefined },
      { sleutel: 'src/web/z.ts', pad: 'docs/z.md', van: 'src/web/z.ts' },
    ]);
  });

  test('een goedkeuring van de eigenaar maakt een gate-pad niet agent-mergebaar', () => {
    const p = pr([{ status: 'M', pad: 'src/core/shared/can.ts' }], {}, [
      { user: 'iemand', state: 'APPROVED', commitId: HEAD, submittedAt: '2026-11-03T10:00:00Z' },
    ]);
    expect(agentMerge(p, beoordeel(p, guardConfig), TEKST).oordeel).toBe('nee');
  });
});

describe('agent-merge-niet-kritiek/AC-1 configuratie faalt dicht', () => {
  test('zonder agentMerge is elke PR nee', () => {
    const zonder = JSON.stringify({ ...JSON.parse(TEKST), agentMerge: undefined });
    const uitslag = agentMergeOordeel(
      { wijzigingen: [{ status: 'M', pad: 'src/web/x.ts' }], json: {}, geraakteJson: [], risico: {} },
      leesMergeConfig(zonder),
    );
    expect(uitslag).toEqual({
      oordeel: 'nee',
      redenen: ['agentMerge ontbreekt of is onleesbaar in .claude/gates.json'],
    });
  });

  test.each([
    [{ merge: 'niet-kritiek' }, 'niet-kritiek'],
    [{ merge: 'eigenaar' }, 'eigenaar'],
    [{}, 'eigenaar'],
    [{ merge: 'ja' }, 'eigenaar'],
    [null, 'eigenaar'],
  ])('modus %j → %s', (ruw, verwacht) => {
    expect(leesModus(ruw)).toBe(verwacht);
  });

  test('de echte gates.json zet de modus op niet-kritiek', () => {
    expect(config.merge).toBe('niet-kritiek');
  });
});

describe('agent-merge-niet-kritiek/AC-5 check-docs toetst modus en de effectieve lijst', () => {
  const aangepast = (veranderingen: Record<string, unknown>) => {
    const ruw: unknown = JSON.parse(TEKST);
    return JSON.stringify(Object.assign({}, ruw, veranderingen));
  };

  test('de echte gates.json is geldig: docs/** mag, want framework, dod en specs zijn gates', () => {
    expect(agentMergeViolations(['docs/framework.md', 'docs/dod.md', '.claude/settings.json'], TEKST)).toEqual([]);
  });

  test.each(['ja', 'altijd', true])('modus %j wordt geweigerd', (merge) => {
    expect(agentMergeViolations([], aangepast({ merge })).map((v) => v.key)).toContain('docs:merge');
  });

  test('een voorReview-pad dat na de uitsluitingen agent-mergebaar wordt, wordt geweigerd', () => {
    const zonderGate = aangepast({ gates: config.gates.filter((glob) => glob !== 'docs/framework.md') });
    expect(agentMergeViolations(['docs/framework.md'], zonderGate).map((v) => v.key)).toContain(
      'docs:agentMerge:docs/framework.md',
    );
  });

  test('een voorReview-glob op de toegestane lijst wordt ook via zijn voorbeeldpad gevonden', () => {
    const ruim = aangepast({
      gates: [],
      voorReview: ['src/geheim/**'],
      altijdVragen: [],
      agentMerge: { ...config.agentMerge, kritiek: [] },
    });
    expect(agentMergeViolations([], ruim).map((v) => v.key)).toContain('docs:agentMerge:src/geheim/x/y');
  });
});
