import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { gates } from '../../scripts/kit/gates.mjs';

// De CI-matrix van gate:slow is een tweede bron van de trage gates; het register (scripts/kit/gates.mjs) is de eerste.
// Deze test houdt ze gelijk, en bewaakt dat de verplichte check `gate:slow` rood wordt bij een rood deel.
const CI = readFileSync(path.join(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8');

// Het blok van één job op jobniveau (twee spaties inspringing) tot de volgende job.
function job(id: string): string {
  const start = CI.search(new RegExp(`^ {2}${id}:\\s*$`, 'm'));
  expect(start, `job ${id} ontbreekt in ci.yml`).toBeGreaterThanOrEqual(0);
  const rest = CI.slice(start).split('\n').slice(1).join('\n');
  const next = rest.search(/^ {2}[\w-]+:\s*$/m);
  return next === -1 ? rest : rest.slice(0, next);
}

test('matrix.script van gate-slow-part bevat precies de trage gates uit het register', () => {
  const lijst = /matrix:\s*\n\s*script: \[([^\]]*)\]/.exec(job('gate-slow-part'))?.[1] ?? '';
  const matrix = lijst
    .split(',')
    .map((script) => script.trim())
    .filter(Boolean);
  const trage = gates.filter((gate) => !gate.snel).map((gate) => gate.script);

  expect(matrix.toSorted()).toStrictEqual(trage.toSorted());
});

test('gate-slow-part heet gate:slow (matrix.script) en laat de andere delen doorlopen bij een rood deel', () => {
  const blok = job('gate-slow-part');

  expect(blok).toMatch(/^ {4}name: gate:slow \(\$\{\{ matrix\.script \}\}\)$/m);
  expect(blok).toMatch(/^ {6}fail-fast: false$/m);
});

test('job gate-slow is de verplichte check: naam gate:slow, needs gate-slow-part, if always()', () => {
  const blok = job('gate-slow');

  expect(blok).toMatch(/^ {4}name: gate:slow$/m);
  expect(blok).toMatch(/^ {4}needs: gate-slow-part$/m);
  expect(blok).toMatch(/^ {4}if: always\(\)$/m);
});

test('job gate-slow faalt op elk resultaat van de delen dat geen success is', () => {
  const blok = job('gate-slow');

  expect(blok).toContain('RESULT: ${{ needs.gate-slow-part.result }}');
  expect(blok).toMatch(/if \[ "\$RESULT" != "success" \]; then[\s\S]*exit 1/);
});
