import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { AssertionError } from './assert.ts';
import { encodeCursor, maxCursorLength, pageQuery } from './cursor.ts';
import { MAX_CURSOR_LENGTH } from './limits.ts';
import { defineListSearch } from './list-search.ts';

// Spec lijstpagina, cursorbudget (leerpunt #411): de server geeft nooit een cursor terug die zijn eigen invoer weigert.

// De slechtste tekens per UTF-16-eenheid: stuurteken (\u0001), aanhalingsteken en backslash (escape), 3 UTF-8-bytes,
// surrogaatpaar (4 bytes voor 2 eenheden) en een losse surrogaat (JSON.stringify schrijft hem als \udXXX).
const WORST = ['\u0001', '"', '\\', '漢', '😀', '\ud800'] as const;

function fill(char: string, units: number): string {
  return char.repeat(Math.floor(units / char.length));
}

describe('maxCursorLength is een bovengrens (lijstpagina/AC-12)', () => {
  test.each(WORST)('voor %j per deel blijft de echte lengte binnen het budget', (char) => {
    const lengths = [8, 100, 200];

    const cursor = encodeCursor(lengths.map((units) => fill(char, units)));

    expect(cursor.length).toBeLessThanOrEqual(maxCursorLength(lengths));
  });

  test('bij uitsluitend U+0001 is het budget precies de echte lengte', () => {
    const lengths = [8, 100, 200];

    expect(encodeCursor(lengths.map((units) => fill('\u0001', units))).length).toBe(maxCursorLength(lengths));
  });

  test('een lege sleutel en een sleutel met één leeg deel', () => {
    expect(maxCursorLength([])).toBe(encodeCursor([]).length);
    expect(maxCursorLength([0])).toBe(encodeCursor(['']).length);
  });
});

describe('lengtegrens op de invoer (lijstpagina/AC-10)', () => {
  const search = defineListSearch({ sorts: ['nieuwste'], filters: {} });
  const atLimit = 'a'.repeat(MAX_CURSOR_LENGTH);
  const overLimit = 'a'.repeat(MAX_CURSOR_LENGTH + 1);

  test('defineListSearch: precies de grens mag, één teken meer niet', () => {
    expect(search.api.safeParse({ cursor: atLimit }).success).toBe(true);
    expect(search.api.safeParse({ cursor: overLimit }).success).toBe(false);
  });

  test('pageQuery: precies de grens mag, één teken meer niet', () => {
    expect(pageQuery.safeParse({ cursor: atLimit }).success).toBe(true);
    expect(pageQuery.safeParse({ cursor: overLimit }).success).toBe(false);
  });
});

describe('assert bij emissie (lijstpagina/AC-11)', () => {
  test('een sleutel waarvan de cursor te lang wordt, geeft een AssertionError', () => {
    const tooLong = ['naam-az', '\u0001'.repeat(MAX_CURSOR_LENGTH), 'id-1'];

    expect(() => encodeCursor(tooLong)).toThrow(AssertionError);
  });

  test('een cursor die precies past, komt er gewoon uit', () => {
    const key = z.tuple([z.string()]);
    // ["…"] = 4 bytes rond de inhoud; 3 bytes worden 4 tekens base64url.
    const content = 'a'.repeat((MAX_CURSOR_LENGTH / 4) * 3 - 4);

    const cursor = encodeCursor([content]);

    expect(cursor.length).toBe(MAX_CURSOR_LENGTH);
    expect(key.parse(JSON.parse(atob(cursor.replaceAll('-', '+').replaceAll('_', '/'))))).toStrictEqual([content]);
  });
});
