import { describe, expect, test } from 'vitest';
import { safeRedirect } from './session.ts';

describe('safeRedirect', () => {
  test.each([
    undefined,
    '',
    'account',
    'https://example.test/account',
    'javascript:alert(1)',
    '//example.test/account',
    '/\\example.test/account',
    '/\\\\example.test/account',
    '/\t/example.test/account',
    '/\n/example.test/account',
    '/\r/example.test/account',
    '/\\[invalid',
    '/\\redirect.invalid/account',
    '/\t/redirect.invalid/account',
  ])('weigert een externe of ongeldige terugweg: %j', (target) => {
    expect(safeRedirect(target)).toBeNull();
  });

  test.each(['/login', '/login?redirect=%2Faccount', '/login#formulier', '/account/../login', '/%2e/login'])(
    'weigert een terugweg naar de inlogpagina: %s',
    (target) => {
      expect(safeRedirect(target)).toBeNull();
    },
  );

  test.each(['/', '/account', '/admin/accounts?q=Anna#lijst', '/account?next=https%3A%2F%2Fexample.test'])(
    'behoudt een interne terugweg inclusief zoekparameters en fragment: %s',
    (target) => {
      expect(safeRedirect(target)).toBe(target);
    },
  );
});
