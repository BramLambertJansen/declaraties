import { describe, expect, test } from 'vitest';
import { authErrorCode } from './auth.ts';

// Fouten van Better Auth → foutcodes uit het register (spec accountbeheer, randgevallen).
describe('authErrorCode', () => {
  test('inloggen: onbekend adres en fout wachtwoord geven dezelfde code', () => {
    expect(authErrorCode('signIn', { status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe('INVALID_CREDENTIALS');
    expect(authErrorCode('signIn', { status: 400, code: 'INVALID_EMAIL' })).toBe('INVALID_CREDENTIALS');
  });

  test('inloggen: een geblokkeerd account (403 of 401, ACCOUNT_BLOCKED) lekt niet en geeft INVALID_CREDENTIALS', () => {
    expect(authErrorCode('signIn', { status: 403, code: 'ACCOUNT_BLOCKED' })).toBe('INVALID_CREDENTIALS');
    expect(authErrorCode('signIn', { status: 401, code: 'ACCOUNT_BLOCKED' })).toBe('INVALID_CREDENTIALS');
  });

  test('te veel pogingen: RATE_LIMITED, bij elke stap', () => {
    for (const step of ['signIn', 'verifyTotp', 'setPassword'] as const) {
      expect(authErrorCode(step, { status: 429 })).toBe('RATE_LIMITED');
    }
  });

  test('TOTP: een foute code is INVALID_TOTP; zonder lopende inlogpoging UNAUTHENTICATED', () => {
    expect(authErrorCode('verifyTotp', { status: 401, code: 'INVALID_CODE' })).toBe('INVALID_TOTP');
    expect(authErrorCode('verifyTotp', { status: 401, code: 'INVALID_TWO_FACTOR_COOKIE' })).toBe('UNAUTHENTICATED');
  });

  test('wachtwoord instellen: één melding voor elk ongeldig token; te kort is VALIDATION', () => {
    expect(authErrorCode('setPassword', { status: 400, code: 'INVALID_TOKEN' })).toBe('INVITATION_INVALID');
    expect(authErrorCode('setPassword', { status: 400, code: 'PASSWORD_TOO_SHORT' })).toBe('VALIDATION');
  });

  test('een CSRF-weigering (andere origin) blijft CSRF_REJECTED, ook bij inloggen', () => {
    expect(authErrorCode('signIn', { status: 403, code: 'CSRF_REJECTED' })).toBe('CSRF_REJECTED');
  });

  test('een serverfout blijft INTERNAL_ERROR', () => {
    expect(authErrorCode('signIn', { status: 500 })).toBe('INTERNAL_ERROR');
  });
});
