import { describe, expect, test, vi } from 'vitest';
import { maxCursorLength } from './cursor.ts';
import { MAX_CURSOR_LENGTH } from './limits.ts';
import { defineListSearch } from './list-search.ts';

// Spec lijstpagina/AC-13: precies gelijk aan MAX_CURSOR_LENGTH gooit niet. Met de echte grens (4096) is dat niet te raken:
// maxCursorLength geeft voor n delen een bytetelling ≡ 3n+1 (mod 6), en 4096 vraagt precies 3072 bytes (≡ 0 mod 6).
// Daarom hier een grens die maxCursorLength wel precies haalt; de test zoekt de bijbehorende declaratie zelf op.
vi.mock('./limits.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./limits.ts')>()),
  MAX_CURSOR_LENGTH: 4090,
}));

function exactDeclaration(sort: string): number | undefined {
  for (let length = 0; maxCursorLength([sort.length, length]) <= MAX_CURSOR_LENGTH; length += 1) {
    if (maxCursorLength([sort.length, length]) === MAX_CURSOR_LENGTH) return length;
  }
  return undefined;
}

describe('precies op de grens (lijstpagina/AC-13)', () => {
  const sort = 'nieuwste';
  const exact = exactDeclaration(sort);

  test('er is een declaratie die precies op MAX_CURSOR_LENGTH uitkomt', () => {
    expect(exact).toBeDefined();
  });

  test('precies gelijk aan MAX_CURSOR_LENGTH gooit niet; één eenheid meer wel', () => {
    const length = exact ?? 0;

    expect(maxCursorLength([sort.length, length + 1])).toBeGreaterThan(MAX_CURSOR_LENGTH);
    expect(() =>
      defineListSearch({ sorts: ['nieuwste'], filters: {}, cursorKeys: { nieuwste: [length] } }),
    ).not.toThrow();
    expect(() =>
      defineListSearch({ sorts: ['nieuwste'], filters: {}, cursorKeys: { nieuwste: [length + 1] } }),
    ).toThrow(/nieuwste/);
  });
});
