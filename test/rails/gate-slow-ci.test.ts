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

// GEWIJZIGD (ADR 0076, ci-in-delen/AC-7): de matrix noemt per deel het script; ui:check staat er in twee helften.
test('ci-in-delen/AC-7 de delen van gate-slow-part dekken precies de trage gates, ui:check in twee helften', () => {
  const delen = [
    ...job('gate-slow-part').matchAll(/^ {10}- \{ deel: ([^,]+), script: ([^,]+), ui: ("[^"]*"|'[^']*'|\S+) \}$/gm),
  ].map(([, deel = '', script = '', ui = '']) => ({ deel, script, ui: ui.replaceAll(/["']/g, '') }));
  const trage = gates.filter((gate) => !gate.snel).map((gate) => gate.script);

  expect(delen).toHaveLength(4);
  expect([...new Set(delen.map((d) => d.script))].toSorted()).toStrictEqual(trage.toSorted());
  expect(delen.filter((d) => d.script === 'ui:check').map((d) => d.ui)).toStrictEqual(['1/2', '2/2']);
  expect(delen.filter((d) => d.script !== 'ui:check').every((d) => d.ui === '' && d.deel === d.script)).toBe(true);
  expect(job('gate-slow-part')).toContain('UI_DEEL: ${{ matrix.ui }}');
});

test('gate-slow-part heet gate:slow (matrix.deel) en laat de andere delen doorlopen bij een rood deel', () => {
  const blok = job('gate-slow-part');

  expect(blok).toMatch(/^ {4}name: gate:slow \(\$\{\{ matrix\.deel \}\}\)$/m);
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
