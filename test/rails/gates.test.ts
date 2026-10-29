import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { snelleGates } from '../../scripts/kit/gate-fast.mjs';
import { gates } from '../../scripts/kit/gates.mjs';

// Het gate-register is de enige gate-tabel (framework §4, ADR 0045): gate:fast draait precies de snelle gates.
const pkg: unknown = JSON.parse(readFileSync('package.json', 'utf8'));
const scripts: Record<string, unknown> =
  typeof pkg === 'object' && pkg !== null && 'scripts' in pkg && typeof pkg.scripts === 'object' && pkg.scripts !== null
    ? { ...pkg.scripts }
    : {};

test('gate:fast draait via gate-fast.mjs en dat draait precies de snelle gates uit het register, in die volgorde', () => {
  const fast = gates.filter((gate) => gate.snel).map((gate) => gate.script);

  expect(scripts['gate:fast']).toBe('node scripts/kit/gate-fast.mjs');
  expect(snelleGates()).toStrictEqual(fast);
});

test('elk script in het register bestaat in package.json', () => {
  expect(gates.map((gate) => gate.script).filter((script) => !(script in scripts))).toStrictEqual([]);
});
