import { describe, expect, test } from 'vitest';
import { encodeCursor, maxCursorLength } from '#core/shared/cursor.ts';
import { MAX_CURSOR_LENGTH, MAX_ID_LENGTH } from '#core/shared/limits.ts';
import { MAX_NAME_LENGTH } from '../limits.ts';
import { ACCOUNT_SORTS, accountsSearch, inviteInput } from './accounts.ts';
import { renameInput } from './me.ts';

// Spec lijstpagina, cursorbudget (leerpunt #411, AC-9): de accountlijst maakt bij naamsortering een cursor
// [sort, lower(naam), id]; elke naam die de contracten toelaten, geeft een cursor die de lijst weer accepteert.

const WORST = ['\u0001', '"', '\\', '漢', '😀', '\ud800'] as const;
const longestSort = Math.max(...ACCOUNT_SORTS.map((sort) => sort.length));

function fill(char: string, units: number): string {
  return char.repeat(Math.floor(units / char.length));
}

test('het budget van de accountsleutel past binnen MAX_CURSOR_LENGTH', () => {
  expect(maxCursorLength([longestSort, MAX_NAME_LENGTH, MAX_ID_LENGTH])).toBeLessThanOrEqual(MAX_CURSOR_LENGTH);
});

describe.each(['naam-az', 'naam-za'] as const)('lijstpagina/AC-9: roundtrip bij %s', (sort) => {
  test.each(WORST)('naam van maximale lengte uit %j', (char) => {
    const naam = fill(char, MAX_NAME_LENGTH);
    const cursor = encodeCursor([sort, naam, 'i'.repeat(MAX_ID_LENGTH)]);

    expect(accountsSearch.api.safeParse({ sort, cursor }).success).toBe(true);
  });
});

test('de reproductie uit #411 geeft overal true', () => {
  const naam = 'a' + '\u0001'.repeat(98) + 'b';
  const cursor = encodeCursor(['naam-az', naam, 'a'.repeat(32)]);

  expect(renameInput.safeParse({ naam }).success).toBe(true);
  expect(inviteInput.safeParse({ naam, email: 'fixture@example.test', rol: 'user' }).success).toBe(true);
  expect(accountsSearch.api.safeParse({ sort: 'naam-az', cursor }).success).toBe(true);
});
