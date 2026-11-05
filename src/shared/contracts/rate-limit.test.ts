import { expect, test } from 'vitest';
import { rateLimitCategory } from '#core/shared/contract.ts';
import { contracts } from './index.ts';

// Spec rate-limit: routes die mail versturen zijn `duur`; de rest volgt de standaard per methode. Een app (of
// pnpm new:resource) voegt routes toe; die vallen onder de standaard en breken deze test niet.
const categories = Object.fromEntries(contracts.map((c) => [`${c.method} ${c.path}`, rateLimitCategory(c)]));

test('rate limit per contract: uitnodigen en opnieuw uitnodigen zijn duur, lezen is lezen', () => {
  expect(categories).toMatchObject({
    'GET /me': 'lezen',
    'GET /accounts': 'lezen',
    'POST /accounts/invite': 'duur',
    'POST /accounts/:id/reinvite': 'duur',
  });
});

test('elke route heeft een geldige categorie', () => {
  for (const [route, category] of Object.entries(categories)) {
    expect(['lezen', 'schrijven', 'duur'], route).toContain(category);
  }
});
