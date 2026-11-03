import { describe, expect, test } from 'vitest';
import { emailLinkKey, signedPart, totpKey } from './one-time-use.ts';

// Sleutels voor eenmalig gebruik (ADR 0075, spec inloggat-dichten): nooit de code of het token zelf, een vaste prefix, en
// voor een e-maillink dezelfde sleutel voor elke spelling van de handtekening. De claim zelf: db/tests/one_time_use.sql en
// test/auth/eenmalig.int.test.ts.
const HEADER = 'eyJhbGciOiJIUzI1NiJ9';
const PAYLOAD = 'eyJlbWFpbCI6ImFAYi50ZXN0In0';
const SIGNATURE = 'A'.repeat(42) + 'A';

describe('totpKey', () => {
  test('prefix totp: en een hash, zonder de code of de gebruiker leesbaar', () => {
    const key = totpKey('gebruiker-1', '123456');

    expect(key).toMatch(/^totp:[0-9a-f]{64}$/);
    expect(key).not.toContain('123456');
    expect(key).not.toContain('gebruiker-1');
  });

  test('dezelfde code van een andere gebruiker geeft een andere sleutel', () => {
    expect(totpKey('a', '123456')).not.toBe(totpKey('b', '123456'));
  });

  test.each([[''], ['12345'], ['1234567'], ['12345a'], [123456], [null], [undefined], [' 123456']])(
    'geen code van zes cijfers (%j): geen sleutel',
    (code) => {
      expect(totpKey('a', code)).toBeNull();
    },
  );
});

describe('signedPart en emailLinkKey', () => {
  test('een token met de vorm van HS256 geeft header.payload', () => {
    expect(signedPart(`${HEADER}.${PAYLOAD}.${SIGNATURE}`)).toBe(`${HEADER}.${PAYLOAD}`);
  });

  test('een andere spelling van de handtekening (laatste teken, ongebruikte bits) geeft dezelfde sleutel', () => {
    const een = signedPart(`${HEADER}.${PAYLOAD}.${'A'.repeat(42)}A`);
    const ander = signedPart(`${HEADER}.${PAYLOAD}.${'A'.repeat(42)}D`);

    expect(een).not.toBeNull();
    expect(emailLinkKey('u', een ?? '')).toBe(emailLinkKey('u', ander ?? ''));
  });

  test.each([
    ['afgekapt', `${HEADER}.${PAYLOAD}.${'A'.repeat(20)}`],
    ['te lang', `${HEADER}.${PAYLOAD}.${'A'.repeat(44)}`],
    ['twee delen', `${HEADER}.${PAYLOAD}`],
    ['vier delen', `${HEADER}.${PAYLOAD}.${SIGNATURE}.x`],
    ['ongeldig teken', `${HEADER}.${PAYLOAD}.${'A'.repeat(42)}=`],
    ['leeg', ''],
  ])('geen HS256-vorm (%s): null', (_naam, token) => {
    expect(signedPart(token)).toBeNull();
  });

  test('prefix email-link:, de actor in de sleutel, nooit het token', () => {
    const key = emailLinkKey('u', `${HEADER}.${PAYLOAD}`);

    expect(key).toMatch(/^email-link:[0-9a-f]{64}$/);
    expect(key).not.toContain(PAYLOAD);
    expect(emailLinkKey('ander', `${HEADER}.${PAYLOAD}`)).not.toBe(key);
  });
});
