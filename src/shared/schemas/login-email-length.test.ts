import { expect, test } from 'vitest';
import { MAX_EMAIL_LENGTH } from '../limits.ts';
import { loginInput } from './auth.ts';

function emailOfLength(length: number) {
  const prefix = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.`;
  const suffix = '.test';
  return `${prefix}${'d'.repeat(length - prefix.length - suffix.length)}${suffix}`;
}

test('inloggen accepteert een geldig e-mailadres op de gedeelde lengtegrens', () => {
  const email = emailOfLength(MAX_EMAIL_LENGTH);
  expect(email).toHaveLength(MAX_EMAIL_LENGTH);
  expect(loginInput.safeParse({ email, password: 'x' }).success).toBe(true);
});

test('inloggen weigert een e-mailadres boven de gedeelde lengtegrens met een Nederlandse melding', () => {
  const result = loginInput.safeParse({ email: emailOfLength(MAX_EMAIL_LENGTH + 1), password: 'x' });
  expect(result.success).toBe(false);
  expect(result.error?.issues).toContainEqual(
    expect.objectContaining({ path: ['email'], message: `Hooguit ${String(MAX_EMAIL_LENGTH)} tekens.` }),
  );
});
