import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';
import { describe, expect, test } from 'vitest';
import { defineListSearch } from '../../shared/list-search.ts';

const search = defineListSearch({ sorts: ['nieuwste'], filters: {} });

describe.each(['true', 'false'])('zoekterm %s in een gedeelde URL', (q) => {
  test('behoudt de zoekterm als de router hem als boolean leest', () => {
    const parsed = defaultParseSearch(`?q=${q}`);

    expect(parsed).toHaveProperty('q', q === 'true');
    expect(search.web.parse(parsed)).toStrictEqual({ q });
  });

  test('behoudt ook de zoekterm in een door de router gemaakte URL', () => {
    const url = defaultStringifySearch({ q });

    expect(search.web.parse(defaultParseSearch(url))).toStrictEqual({ q });
  });

  test('de API accepteert tekst en blijft een boolean weigeren', () => {
    expect(search.api.parse({ q })).toStrictEqual({ q, sort: 'nieuwste' });
    expect(search.api.safeParse(defaultParseSearch(`?q=${q}`)).success).toBe(false);
  });
});

test.each(['null', '[]', '{}'])('ongeldige zoekwaarde %s blijft wegvallen', (q) => {
  expect(search.web.parse(defaultParseSearch(`?q=${encodeURIComponent(q)}`))).toStrictEqual({});
});
