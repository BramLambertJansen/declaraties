import { describe, expect, test } from 'vitest';
import {
  accountItem,
  accountsListContract,
  accountsSearch,
  blockContract,
  STATUSSEN,
  unblockContract,
} from './accounts.ts';

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

// Spec accountbeheer-uitbreiding (ADR 0026): blokkeren en deblokkeren.
describe.each([
  ['blockContract', blockContract, '/accounts/:id/block'],
  ['unblockContract', unblockContract, '/accounts/:id/unblock'],
])('%s', (_, contract, path) => {
  test('POST met permissie accounts:manage en pad met :id', () => {
    expect([contract.method, contract.path, contract.permission]).toStrictEqual(['POST', path, 'accounts:manage']);
  });

  test('input: alleen een id van 1 tot 200 tekens, strict; antwoord is null', () => {
    expect(contract.input.parse({ id: 'abc' })).toStrictEqual({ id: 'abc' });
    for (const bad of [{}, { id: '' }, { id: 'x'.repeat(201) }, { id: 'a', extra: 1 }, { id: 1 }])
      expect(contract.input.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    expect(contract.output.safeParse(null).success).toBe(true);
    expect(contract.output.safeParse({}).success).toBe(false);
  });
});

test('de status geblokkeerd is een geldige status in de lijst, het filter en het item', () => {
  expect(STATUSSEN).toContain('geblokkeerd');
  expect(api.parse({ status: 'geblokkeerd' })).toStrictEqual({ status: 'geblokkeerd', sort: 'nieuwste' });
  const item = {
    id: 'a',
    naam: 'A',
    email: 'a@x.test',
    rol: 'user',
    status: 'geblokkeerd',
    aangemaakt: '2026-10-12T10:00:00Z',
  };
  expect(accountItem.safeParse(item).success).toBe(true);
});
