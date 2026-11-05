import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { globMatch, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { leesMergeConfig, padReden } from '../../scripts/kit/agent-merge.mjs';
import { kritiekPad } from '../../scripts/kit/lane.mjs';
import { OUD, REPO, object, voorbeeldPad } from './padtabel-kit';

// padtabel/AC-2 (ADR 0079 punt 5 en 9): niets wordt losser dan op 30cc352. Blijvende vloer: per getrackt pad en per
// voorbeeldpad van elke glob uit de bevroren lijsten en uit de huidige `.claude/gates.json` is het nieuwe niveau gelijk of
// strenger. De "oude" kant is hier bevroren berekend uit de fixture (test/rails/fixtures/padtabel), los van de code, zodat een
// latere wijziging van lezer of tabel die één pad losser maakt rood is.

const TEKST = readFileSync(path.join(REPO, '.claude/gates.json'), 'utf8');
const RUW = object(JSON.parse(TEKST));

const past = (globs: readonly string[], pad: string) => globs.some((glob) => globMatch(glob, pad));

/** Rolhekniveau zoals rails/hooks/lib/rolhek.mjs het toepast: geen gate 0, gate 1, voorReview 2, altijdVragen 3. */
function niveau(
  lijsten: { gates: string[]; voorReview?: string[] | undefined; altijdVragen?: string[] | undefined },
  pad: string,
) {
  if (!past(lijsten.gates, pad)) return 0;
  const voorReview = lijsten.voorReview ?? lijsten.gates;
  if (past(lijsten.altijdVragen ?? voorReview, pad)) return 3;
  return past(voorReview, pad) ? 2 : 1;
}

const oudKritiek = (pad: string) => past([...OUD.kritiek, ...OUD.altijdVragen], pad);

const oudeMergeConfig = {
  gates: OUD.gates,
  testpaden: OUD.testpaden,
  jsonGates: { 'package.json': ['scripts'] },
  voorReview: OUD.voorReview,
  altijdVragen: OUD.altijdVragen,
  kritiek: [...OUD.kritiek, ...OUD.altijdVragen],
  agentMerge: {
    toegestaan: OUD.toegestaan,
    kritiek: OUD.agentKritiek,
    codex: 'indien-aanwezig' as const,
    maxRegels: 400,
    maxBytes: 40000,
  },
  merge: 'niet-kritiek' as const,
};

function kandidaten(): string[] {
  const getrackt = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean);
  const paden = typeof RUW['paden'] === 'object' && RUW['paden'] !== null ? Object.keys(RUW['paden']) : [];
  const lijst = (sleutel: string) => (Array.isArray(RUW[sleutel]) ? RUW[sleutel].map(String) : []);
  const globs = [
    ...OUD.gates,
    ...OUD.voorReview,
    ...OUD.altijdVragen,
    ...OUD.toegestaan,
    ...OUD.agentKritiek,
    ...OUD.kritiek,
    ...lijst('gates'),
    ...lijst('voorReview'),
    ...lijst('altijdVragen'),
    ...paden,
  ];
  return [...new Set([...getrackt, ...globs.map(voorbeeldPad)])];
}

describe('padtabel/AC-2 gelijkwaardigheid als vloer tegen 30cc352', () => {
  test('de huidige .claude/gates.json is in de nieuwe vorm (padtabel/AC-2)', () => {
    expect(typeof RUW['paden']).toBe('object');
    expect(RUW).not.toHaveProperty('gates');
  });

  const PADEN = kandidaten();
  const nieuweConfig = loadConfig(TEKST);
  const merge = leesMergeConfig(TEKST);

  test('rolhekniveau nieuw ≥ oud voor elk pad (padtabel/AC-2)', () => {
    const losser = PADEN.filter((pad) => niveau(nieuweConfig, pad) < niveau(OUD, pad));
    expect(losser).toEqual([]);
  });

  test('kritiekPad: oud waar ⇒ nieuw waar (padtabel/AC-2)', () => {
    const losser = PADEN.filter((pad) => oudKritiek(pad) && !kritiekPad(pad, nieuweConfig));
    expect(losser).toEqual([]);
  });

  test.each(['M', 'A'])('padReden status %s: oud niet null ⇒ nieuw niet null (padtabel/AC-2)', (status) => {
    const agentMerge = merge.agentMerge;
    expect(agentMerge).not.toBeNull();
    if (agentMerge === null) return;
    const nieuwMerge = { ...merge, agentMerge };
    const losser = PADEN.filter(
      (pad) => padReden(pad, status, oudeMergeConfig) !== null && padReden(pad, status, nieuwMerge) === null,
    );
    expect(losser).toEqual([]);
  });
});
