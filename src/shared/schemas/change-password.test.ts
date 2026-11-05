import { describe, expect, test } from 'vitest';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '#core/shared/limits.ts';
import { changePasswordInput } from './auth.ts';

// Spec eigen-account: grenzen uit limits.ts en de teksten uit de spec.
const valid = { huidig: 'oud', nieuw: 'n'.repeat(MIN_PASSWORD_LENGTH), herhaal: 'n'.repeat(MIN_PASSWORD_LENGTH) };

function messages(input: unknown): string[] {
  return changePasswordInput.safeParse(input).error?.issues.map((issue) => issue.message) ?? [];
}

describe('changePasswordInput', () => {
  test('geldig: het nieuwe wachtwoord mag gelijk zijn aan het huidige (OV-6)', () => {
    expect(changePasswordInput.safeParse(valid).success).toBe(true);
    expect(changePasswordInput.safeParse({ ...valid, huidig: valid.nieuw }).success).toBe(true);
  });

  test('te kort en te lang', () => {
    const short = 'n'.repeat(MIN_PASSWORD_LENGTH - 1);
    const long = 'n'.repeat(MAX_PASSWORD_LENGTH + 1);
    expect(messages({ ...valid, nieuw: short, herhaal: short })).toStrictEqual(['Minstens 12 tekens.']);
    expect(messages({ ...valid, nieuw: long, herhaal: long })).toStrictEqual(['Hooguit 128 tekens.']);
  });

  test('herhaling anders: "De wachtwoorden zijn niet gelijk."', () => {
    expect(messages({ ...valid, herhaal: 'iets anders dan nieuw' })).toStrictEqual([
      'De wachtwoorden zijn niet gelijk.',
    ]);
  });

  test('huidig wachtwoord leeg', () => {
    expect(messages({ ...valid, huidig: '' })).toStrictEqual(['Vul je huidige wachtwoord in.']);
  });
});
