import { describe, expect, test } from 'vitest';
import { AssertionError } from './assert.ts';
import { encodeCursor, maxCursorLength } from './cursor.ts';
import { MAX_CURSOR_LENGTH, MAX_ID_LENGTH, MAX_TIMESTAMP_LENGTH } from './limits.ts';
import { defineListSearch } from './list-search.ts';
import { unsafeCast } from './unsafe-cast.ts';

// Spec lijstpagina, cursorbudget per sortering (leerpunt #444): `cursorKeys` declareert per sortering de maximale UTF-16-lengte
// van elk sleuteldeel na de sorteernaam; defineListSearch weigert bij definitie een sleutel die niet in MAX_CURSOR_LENGTH past.

// Buiten het type om: de runtime-controle moet ook gelden voor config die het type niet ziet (bv. uit JavaScript).
type AnyConfig = Parameters<typeof defineListSearch>[0];

function untyped(config: unknown): AnyConfig {
  return unsafeCast(config, 'runtimetest: deze config omzeilt bewust het type van defineListSearch');
}

// Grootste lengte L voor het tweede deel waarbij [sorteernaam, L] nog binnen MAX_CURSOR_LENGTH valt.
function largestFitting(sort: string): number {
  let length = 0;
  while (maxCursorLength([sort.length, length + 1]) <= MAX_CURSOR_LENGTH) length += 1;
  return length;
}

describe('MAX_TIMESTAMP_LENGTH (lijstpagina/AC-13)', () => {
  test('is 48', () => {
    expect(MAX_TIMESTAMP_LENGTH).toBe(48);
  });

  test('past het langste ISO-tijdstip dat Postgres voor een timestamptz geeft', () => {
    expect('294276-12-31T23:59:59.999999+14:59:59 BC'.length).toBeLessThanOrEqual(MAX_TIMESTAMP_LENGTH);
  });
});

describe('te lange sleutel gooit bij definitie (lijstpagina/AC-13)', () => {
  const sort = 'naam-az';
  const fitting = largestFitting(sort);

  test('de grootste declaratie die past, gooit niet', () => {
    expect(maxCursorLength([sort.length, fitting])).toBeLessThanOrEqual(MAX_CURSOR_LENGTH);

    expect(() =>
      defineListSearch({ sorts: ['naam-az'], filters: {}, cursorKeys: { 'naam-az': [fitting] } }),
    ).not.toThrow();
  });

  test('één eenheid meer gaat over de grens en gooit, met de sorteernaam in de melding', () => {
    expect(maxCursorLength([sort.length, fitting + 1])).toBeGreaterThan(MAX_CURSOR_LENGTH);

    expect(() =>
      defineListSearch({ sorts: ['naam-az'], filters: {}, cursorKeys: { 'naam-az': [fitting + 1] } }),
    ).toThrow(/naam-az/);
  });

  test('alleen de te lange sortering wordt genoemd; een korte sortering ernaast gooit niet', () => {
    const define = () =>
      defineListSearch({
        sorts: ['nieuwste', 'naam-az'],
        filters: {},
        cursorKeys: { nieuwste: [MAX_TIMESTAMP_LENGTH, MAX_ID_LENGTH], 'naam-az': [fitting + 1] },
      });

    expect(define).toThrow(Error);
    expect(define).toThrow(/naam-az/);
    expect(define).not.toThrow(/nieuwste/);
  });

  test('de som van meerdere delen telt, niet elk deel apart', () => {
    const half = Math.ceil(fitting / 2) + 1;

    expect(maxCursorLength([sort.length, half, half])).toBeGreaterThan(MAX_CURSOR_LENGTH);
    expect(() =>
      defineListSearch({ sorts: ['naam-az'], filters: {}, cursorKeys: { 'naam-az': [half, half] } }),
    ).toThrow(/naam-az/);
  });
});

describe('cursorKeys buiten het type om (lijstpagina/AC-14)', () => {
  test('een ontbrekende entry voor een sortering gooit', () => {
    const config = untyped({ sorts: ['nieuwste', 'oudste'], filters: {}, cursorKeys: { nieuwste: [48] } });

    expect(() => defineListSearch(config)).toThrow(Error);
  });

  test('een extra entry die geen sortering is, gooit', () => {
    const config = untyped({ sorts: ['nieuwste'], filters: {}, cursorKeys: { nieuwste: [48], onzin: [1] } });

    expect(() => defineListSearch(config)).toThrow(Error);
  });

  test('zonder cursorKeys gooit', () => {
    const config = untyped({ sorts: ['nieuwste'], filters: {} });

    expect(() => defineListSearch(config)).toThrow(Error);
  });

  test.each([
    ['negatief', -1],
    ['geen geheel getal', 1.5],
    ['NaN', Number.NaN],
    ['oneindig', Number.POSITIVE_INFINITY],
    ['tekst', '10'],
  ])('een lengte die geen geheel getal >= 0 is (%s) gooit', (_, length) => {
    const config = untyped({ sorts: ['nieuwste'], filters: {}, cursorKeys: { nieuwste: [MAX_ID_LENGTH, length] } });

    expect(() => defineListSearch(config)).toThrow(Error);
  });

  test('lengte 0 is toegestaan', () => {
    expect(() => defineListSearch({ sorts: ['nieuwste'], filters: {}, cursorKeys: { nieuwste: [0] } })).not.toThrow();
  });
});

describe('cursorKeys in het type (lijstpagina/AC-14)', () => {
  test('een ontbrekende entry is een typefout', () => {
    const define = () =>
      defineListSearch({
        sorts: ['nieuwste', 'oudste'],
        filters: {},
        // @ts-expect-error -- lijstpagina/AC-14: 'oudste' ontbreekt in cursorKeys
        cursorKeys: { nieuwste: [MAX_TIMESTAMP_LENGTH] },
      });

    expect(define).toThrow(Error);
  });

  test('een extra entry is een typefout', () => {
    const define = () =>
      defineListSearch({
        sorts: ['nieuwste'],
        filters: {},
        // @ts-expect-error -- lijstpagina/AC-14: 'onzin' is geen sortering
        cursorKeys: { nieuwste: [MAX_TIMESTAMP_LENGTH], onzin: [1] },
      });

    expect(define).toThrow(Error);
  });

  test('een lege tuple is een typefout', () => {
    const define = () =>
      defineListSearch({
        sorts: ['nieuwste'],
        filters: {},
        // @ts-expect-error -- lijstpagina/AC-14: elke sortering heeft minstens één sleuteldeel na de sorteernaam
        cursorKeys: { nieuwste: [] },
      });

    expect(typeof define).toBe('function');
  });

  test('zonder cursorKeys is een typefout', () => {
    // @ts-expect-error -- lijstpagina/AC-14: cursorKeys is verplicht
    const define = () => defineListSearch({ sorts: ['nieuwste'], filters: {} });

    expect(define).toThrow(Error);
  });
});

describe('encodeCursor van de lijst (lijstpagina/AC-15)', () => {
  const search = defineListSearch({
    sorts: ['nieuwste', 'naam-az'],
    filters: {},
    cursorKeys: { nieuwste: [MAX_TIMESTAMP_LENGTH, MAX_ID_LENGTH], 'naam-az': [MAX_ID_LENGTH] },
  });

  test.each([
    ['te weinig delen', 'nieuwste', ['2026-01-01T00:00:00.000Z']],
    ['te veel delen', 'nieuwste', ['2026-01-01T00:00:00.000Z', 'id-1', 'extra']],
    ['geen delen', 'naam-az', []],
    ['te veel delen bij één gedeclareerd deel', 'naam-az', ['ada', 'id-1']],
  ] as const)('%s geeft een AssertionError', (_, sort, parts) => {
    expect(() => search.encodeCursor(sort, parts)).toThrow(AssertionError);
  });

  test.each([
    ['nieuwste', ['2026-01-01T00:00:00.000Z', 'id-1']],
    ['naam-az', ['id-1']],
  ] as const)('%s met het juiste aantal delen is gelijk aan core encodeCursor', (sort, parts) => {
    expect(search.encodeCursor(sort, parts)).toBe(encodeCursor([sort, ...parts]));
  });
});
