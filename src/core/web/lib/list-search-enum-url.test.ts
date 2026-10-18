import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';
import { expect, test } from 'vitest';
import { defineListSearch } from '../../shared/list-search.ts';

const search = defineListSearch({
  sorts: ['nieuwste', '0', '1', 'true', 'false'],
  filters: { jaar: ['2025', '2026'], actief: ['true', 'false'], groep: ['0', '1'] },
});

test.each([
  ['?sort=0', { sort: '0' }],
  ['?sort=1', { sort: '1' }],
  ['?sort=true', { sort: 'true' }],
  ['?sort=false', { sort: 'false' }],
  ['?jaar=2026&actief=false&groep=0', { jaar: '2026', actief: 'false', groep: '0' }],
  ['?jaar=2025&actief=true&groep=1', { jaar: '2025', actief: 'true', groep: '1' }],
])('een gedeelde URL behoudt geldige enumwaarden: %s', (url, expected) => {
  expect(search.web.parse(defaultParseSearch(url))).toStrictEqual(expected);
});

test.each([{ sort: 1 }, { jaar: 2026 }, { actief: false }, { groep: 0 }])(
  'de API blijft echte getallen en booleans weigeren: %j',
  (input) => {
    expect(search.api.safeParse(input).success).toBe(false);
  },
);

test.each(['?sort=2&jaar=2027&actief=0', '?sort=null&jaar=[]&actief={}'])(
  'ongeldige waarden vallen nog terug: %s',
  (url) => {
    expect(search.web.parse(defaultParseSearch(url))).toStrictEqual({});
  },
);

test.each([
  { sort: 'false', jaar: '2026', actief: 'false', groep: '0' },
  { sort: '1', jaar: '2025', actief: 'true', groep: '1' },
])('door de router gemaakte URL’s blijven werken: %j', (input) => {
  expect(search.web.parse(defaultParseSearch(defaultStringifySearch(input)))).toStrictEqual(input);
});
