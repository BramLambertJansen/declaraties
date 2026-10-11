import { expect, test } from 'vitest';
import { invalidRateLimits, MAX_PAGE_SIZE, RATE_LIMIT_MAX } from '#core/shared/limits.ts';
import { APP_LIMITS, RATE_LIMITS } from './limits.ts';

test('geen app-grens boven de harde grens uit core (ADR 0008)', () => {
  expect(APP_LIMITS.ACCOUNTS_PAGE_SIZE).toBeLessThanOrEqual(MAX_PAGE_SIZE);
});

// spec rate-limit/AC-7: een app-grens boven de harde grens uit core laat deze test falen (en createApp bij opstart).
test('rate limit: elke categorie van de app ligt tussen 1 en de harde grens uit core', () => {
  expect(invalidRateLimits(RATE_LIMITS)).toStrictEqual([]);
});

test('rate limit: een grens boven de harde grens, 0 of een breuk wordt gevangen (controle)', () => {
  expect(invalidRateLimits({ ...RATE_LIMITS, duur: RATE_LIMIT_MAX.duur + 1 })).toStrictEqual(['duur']);
  expect(invalidRateLimits({ ...RATE_LIMITS, lezen: 0, schrijven: 1.5 })).toStrictEqual(['lezen', 'schrijven']);
});
