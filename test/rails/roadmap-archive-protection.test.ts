import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { geraakt, leesConfig } from '../../scripts/kit/diff-guard.mjs';

const ARCHIVE = 'docs/roadmap-archief.md';
const config = leesConfig(readFileSync('.claude/gates.json', 'utf8'));
const pr = { json: {}, labels: [], reviews: [], auteur: 'agent[bot]', headSha: 'a'.repeat(40) };

test.each(['A', 'M', 'D'])('historisch bouwbewijs blijft een gate bij status %s', (status) => {
  const result = geraakt({ ...pr, wijzigingen: [{ status, pad: ARCHIVE }] }, config);
  expect(result.gates).toContain(ARCHIVE);
});

test('ook weg-hernoemen van historisch bouwbewijs raakt de gate', () => {
  const result = geraakt({ ...pr, wijzigingen: [{ status: 'R', van: ARCHIVE, pad: 'docs/notes.md' }] }, config);
  expect(result.gates).toContain(ARCHIVE);
});

test('CODEOWNERS spiegelt de bescherming van het roadmaparchief', () => {
  expect(readFileSync('.github/CODEOWNERS', 'utf8')).toMatch(/^\/docs\/roadmap-archief\.md\s+@\S+/m);
});
