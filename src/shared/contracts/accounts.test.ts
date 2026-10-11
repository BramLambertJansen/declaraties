import { expect, test } from 'vitest';
import { accountsListContract, accountsSearch } from './accounts.ts';

// Spec lijstpagina: AC-6 (ongeldige waarden), AC-7 deels (strict API-input), randgevallen voor q.
const api = accountsListContract.input;

test('AC-6: web valt bij ongeldige waarden terug op de standaard, de API weigert ze', () => {
  expect(accountsSearch.web.parse({ sort: 'onzin', rol: 'koning' })).toStrictEqual({});
  expect(api.safeParse({ sort: 'onzin' }).success).toBe(false);
  expect(api.safeParse({ rol: 'koning' }).success).toBe(false);
});

test('de API neemt q, filters, sortering en cursor aan; sort heeft een standaard', () => {
  expect(api.parse({ q: ' ada ', rol: 'admin', status: 'actief', sort: 'naam-az', cursor: 'x' })).toStrictEqual({
    q: 'ada',
    rol: 'admin',
    status: 'actief',
    sort: 'naam-az',
    cursor: 'x',
  });
  expect(api.parse({})).toStrictEqual({ sort: 'nieuwste' });
});

test('onbekende sleutels en te lange of lege q: API weigert, web negeert', () => {
  expect(api.safeParse({ onbekend: '1' }).success).toBe(false);
  expect(api.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
  expect(api.parse({ q: '   ' })).toStrictEqual({ sort: 'nieuwste' });
  expect(accountsSearch.web.parse({ onbekend: '1', q: '   ' })).toStrictEqual({});
});
