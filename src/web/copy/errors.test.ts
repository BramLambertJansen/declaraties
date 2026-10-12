import { describe, expect, test } from 'vitest';
import { errors } from '#shared/errors.ts';
import { errorTexts } from './errors.ts';

describe('errorTexts', () => {
  test('elke foutcode uit het register heeft een tekst, en er zijn geen teksten zonder code', () => {
    expect(Object.keys(errorTexts).sort()).toStrictEqual([...errors.codes].sort());
  });

  test('geen tekst noemt een code of is leeg', () => {
    for (const [code, text] of Object.entries(errorTexts)) {
      expect(text.length, code).toBeGreaterThan(0);
      expect(text, code).not.toMatch(/[A-Z]{2,}_[A-Z]/);
    }
  });
});

// Spec accountbeheer-uitbreiding, foutteksten bij blokkeren (ADR 0026): letterlijk uit de spec.
test('OWN_ACCOUNT, ACCOUNT_INVITED en ACCOUNT_BLOCKED hebben de teksten uit de spec', () => {
  expect(errorTexts.OWN_ACCOUNT).toBe('Dit kan niet bij je eigen account.');
  expect(errorTexts.ACCOUNT_INVITED).toBe(
    'Dit account is nog niet actief. Nodig opnieuw uit of trek de uitnodiging in.',
  );
  expect(errorTexts.ACCOUNT_BLOCKED).toBe('Dit account is geblokkeerd. Deblokkeer het eerst.');
});
