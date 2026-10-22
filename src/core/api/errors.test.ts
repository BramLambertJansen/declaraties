import { describe, expect, test } from 'vitest';
import { AppError, statusFor, translateDatabaseError } from './errors.ts';

// Databasefouten op één plek (framework §6). Drizzle verpakt de pg-fout als `cause` (DrizzleQueryError).
const pg = (code: string, message = 'details') => Object.assign(new Error(message), { code });
const wrapped = (cause: Error) => Object.assign(new Error('Failed query: …'), { cause });

describe('translateDatabaseError', () => {
  test.each([
    ['23505', 'ALREADY_EXISTS'],
    ['23503', 'NOT_FOUND'],
    ['42501', 'FORBIDDEN'],
  ])('%s → %s, ook verpakt door Drizzle', (code, expected) => {
    expect(translateDatabaseError(pg(code))).toMatchObject({ code: expected });
    expect(translateDatabaseError(wrapped(pg(code)))).toMatchObject({ code: expected });
  });

  test("raise exception 'LAST_ADMIN' (P0001) → LAST_ADMIN", () => {
    const translated = translateDatabaseError(wrapped(pg('P0001', 'LAST_ADMIN')));

    expect(translated).toBeInstanceOf(AppError);
    expect(translated).toMatchObject({ code: 'LAST_ADMIN' });
  });

  test('een P0001 met vrije tekst en een andere SQLSTATE blijven ongewijzigd', () => {
    const free = pg('P0001', 'iets ging mis');
    const other = pg('40001');

    expect(translateDatabaseError(free)).toBe(free);
    expect(translateDatabaseError(other)).toBe(other);
  });

  test('statussen: core-codes volgens de tabel, app-codes 409', () => {
    expect([
      statusFor('UNAUTHENTICATED'),
      statusFor('MFA_REQUIRED'),
      statusFor('VALIDATION'),
      statusFor('LAST_ADMIN'),
    ]).toStrictEqual([401, 403, 400, 409]);
  });

  // ADR 0047 (OV-1): de generator maakt handlers die NOT_IMPLEMENTED gooien tot de developer ze bouwt.
  test('NOT_IMPLEMENTED is een basiscode met status 501', () => {
    expect(statusFor('NOT_IMPLEMENTED')).toBe(501);
  });
});
