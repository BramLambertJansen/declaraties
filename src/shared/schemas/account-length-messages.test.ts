import { describe, expect, test } from 'vitest';
import { MAX_PASSWORD_LENGTH } from '#core/shared/limits.ts';
import { MAX_EMAIL_LENGTH } from '../limits.ts';
import { changeEmailInput, changePasswordInput, loginInput } from './auth.ts';

const password = 'a'.repeat(MAX_PASSWORD_LENGTH);
const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(56)}.test`;

describe.each([
  {
    name: 'inloggen',
    schema: loginInput,
    field: 'password',
    maximum: MAX_PASSWORD_LENGTH,
    value: password,
    input: (value: string) => ({ email: 'a@example.test', password: value }),
  },
  {
    name: 'huidig wachtwoord bij wijzigen',
    schema: changePasswordInput,
    field: 'huidig',
    maximum: MAX_PASSWORD_LENGTH,
    value: password,
    input: (value: string) => ({ huidig: value, nieuw: password, herhaal: password }),
  },
  {
    name: 'e-mailadres wijzigen',
    schema: changeEmailInput,
    field: 'email',
    maximum: MAX_EMAIL_LENGTH,
    value: email,
    input: (value: string) => ({ email: value }),
  },
])('$name', ({ schema, field, maximum, value, input }) => {
  test('accepteert de bestaande lengtegrens', () => {
    expect(value).toHaveLength(maximum);
    expect(schema.safeParse(input(value)).success).toBe(true);
  });

  test('toont een Nederlandse melding boven de lengtegrens', () => {
    const result = schema.safeParse(input(`${value}a`));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => ({ path: issue.path, message: issue.message }))).toEqual([
      { path: [field], message: `Hooguit ${String(maximum)} tekens.` },
    ]);
  });
});
