import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { gates } from '../../scripts/kit/gates.mjs';

// gate:slow draait precies de trage gates uit het register (framework §4, ADR 0045), in die volgorde.
const pkg: unknown = JSON.parse(readFileSync('package.json', 'utf8'));
const scripts: Record<string, unknown> =
  typeof pkg === 'object' && pkg !== null && 'scripts' in pkg && typeof pkg.scripts === 'object' && pkg.scripts !== null
    ? { ...pkg.scripts }
    : {};

test('gate:slow draait precies de trage gates uit het register, in die volgorde', () => {
  const slow = gates.filter((gate) => !gate.snel).map((gate) => `pnpm ${gate.script}`);

  expect(scripts['gate:slow']).toBe(slow.join(' && '));
});
