import { describe, expect, test } from 'vitest';
import { MIN_PASSWORD_LENGTH } from '#core/shared/limits.ts';
import { loginInput, newPasswordInput, totpInput } from './auth.ts';

describe('formulierschema’s rond inloggen', () => {
  test('wachtwoord instellen: de grens is MIN_PASSWORD_LENGTH uit limits.ts (spec: minstens 12)', () => {
    const exact = 'a'.repeat(MIN_PASSWORD_LENGTH);
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);

    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(newPasswordInput.safeParse({ wachtwoord: exact, herhaal: exact }).success).toBe(true);
    expect(newPasswordInput.safeParse({ wachtwoord: short, herhaal: short }).error?.issues[0]?.message).toBe(
      'Minstens 12 tekens.',
    );
  });

  test('wachtwoord herhalen: verschil geeft de spectekst op het tweede veld', () => {
    const result = newPasswordInput.safeParse({ wachtwoord: 'a'.repeat(12), herhaal: 'b'.repeat(12) });

    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toStrictEqual([
      ['herhaal', 'De wachtwoorden zijn niet gelijk.'],
    ]);
  });

  test('TOTP: precies 6 cijfers; inloggen: geldig e-mailadres en een wachtwoord', () => {
    expect(totpInput.safeParse({ code: '123456' }).success).toBe(true);
    expect(totpInput.safeParse({ code: '12345a' }).success).toBe(false);
    expect(loginInput.safeParse({ email: 'a@example.test', password: 'x' }).success).toBe(true);
    expect(loginInput.safeParse({ email: 'geen-adres', password: 'x' }).success).toBe(false);
  });
});
