import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { createContracts } from './contract.ts';
import { definePermissions } from './can.ts';
import { MAX_SEARCH_LENGTH } from './limits.ts';
import { defineListSearch } from './list-search.ts';

// Spec lijstpagina: één schema, strict voor de API (VALIDATION), `.catch()` per veld voor de URL.
const search = defineListSearch({
  sorts: ['nieuwste', 'oudste', 'naam-az'],
  filters: { rol: ['user', 'admin'], status: ['actief', 'uitgenodigd'] },
});

describe('defineListSearch: grenzen', () => {
  test('MAX_SEARCH_LENGTH is 100', () => {
    expect(MAX_SEARCH_LENGTH).toBe(100);
  });

  test('defaultSort is de eerste sortering', () => {
    expect(search.defaultSort).toBe('nieuwste');
  });
});

describe('defineListSearch: api (strict)', () => {
  test('een geldige zoekopdracht gaat door; q is getrimd', () => {
    const result = search.api.safeParse({ q: '  ada  ', rol: 'admin', status: 'actief', sort: 'naam-az' });

    expect(result.success).toBe(true);
    expect(result.data).toStrictEqual({ q: 'ada', rol: 'admin', status: 'actief', sort: 'naam-az' });
  });

  test('zonder sort geldt de standaardsortering; zonder q of filters ontbreken die', () => {
    const result = search.api.safeParse({});

    expect(result.success).toBe(true);
    expect(result.data).toStrictEqual({ sort: 'nieuwste' });
  });

  test('de cursor uit het contract mag mee', () => {
    expect(search.api.safeParse({ cursor: 'abc' }).success).toBe(true);
  });

  test.each([
    ['onbekende sleutel', { onbekend: '1' }],
    ['ongeldige sort', { sort: 'onzin' }],
    ['ongeldig filter rol', { rol: 'koning' }],
    ['ongeldig filter status', { status: 'weg' }],
    ['q langer dan MAX_SEARCH_LENGTH', { q: 'a'.repeat(MAX_SEARCH_LENGTH + 1) }],
  ])('%s geeft een ZodError', (_, input) => {
    expect(() => search.api.parse(input)).toThrow(z.ZodError);
  });

  test('q van precies MAX_SEARCH_LENGTH mag', () => {
    expect(search.api.safeParse({ q: 'a'.repeat(MAX_SEARCH_LENGTH) }).success).toBe(true);
  });

  test.each(['', '   '])('q %j (alleen spaties) telt als leeg: geen fout, niet in de uitvoer', (q) => {
    const result = search.api.safeParse({ q });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('q');
  });

  test('% _ en \\ blijven letterlijk in q (escapen gebeurt bij de query)', () => {
    expect(search.api.safeParse({ q: '50%_\\' }).data).toStrictEqual({ q: '50%_\\', sort: 'nieuwste' });
  });
});

describe('defineListSearch: web (.catch per veld)', () => {
  test('geldige waarden blijven staan', () => {
    expect(search.web.parse({ q: 'ada', rol: 'admin', sort: 'oudste' })).toStrictEqual({
      q: 'ada',
      rol: 'admin',
      sort: 'oudste',
    });
  });

  test('ongeldige waarden vallen terug en geven nooit een fout (AC-6)', () => {
    const result = search.web.safeParse({
      sort: 'onzin',
      rol: 'koning',
      status: 3,
      q: 'a'.repeat(MAX_SEARCH_LENGTH + 1),
    });

    expect(result.success).toBe(true);
    expect(result.data).toStrictEqual({});
  });

  test('onbekende sleutels worden genegeerd', () => {
    expect(search.web.safeParse({ onbekend: 'x', rol: 'user' }).data).toStrictEqual({ rol: 'user' });
  });

  test('standaardwaarden komen niet in de uitvoer, dus niet in de URL', () => {
    expect(search.web.parse({ sort: 'nieuwste' })).toStrictEqual({});
    expect(search.web.parse({})).toStrictEqual({});
  });

  test.each(['', '   '])('q %j wordt weggelaten', (q) => {
    expect(search.web.parse({ q })).toStrictEqual({});
  });

  test('q wordt getrimd', () => {
    expect(search.web.parse({ q: '  ada ' })).toStrictEqual({ q: 'ada' });
  });
});

describe('defineListSearch: contract en gereserveerde sleutels', () => {
  test('api is een strict ZodObject dat als input door defineContract komt, en blijft ongeldige velden weigeren', () => {
    const { defineContract } = createContracts(definePermissions({}));

    const contract = defineContract({
      method: 'GET',
      path: '/lijst',
      input: search.api,
      output: z.object({}),
      permission: 'app.use',
    });

    expect(contract.input.safeParse({ onbekend: 'x' }).success).toBe(false);
    expect(contract.input.safeParse({ q: 'ada' }).success).toBe(true);
  });

  test.each(['q', 'sort', 'cursor'])('een filter met de sleutel %s laat defineListSearch gooien', (key) => {
    expect(() => defineListSearch({ sorts: ['a'], filters: { [key]: ['x'] } })).toThrow(key);
  });

  test('web: een getal als q (TanStack parset ?q=2026) wordt de string "2026"', () => {
    expect(search.web.parse({ q: 2026 })).toStrictEqual({ q: '2026' });
  });
});
