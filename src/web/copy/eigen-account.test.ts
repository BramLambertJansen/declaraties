import { expect, test } from 'vitest';
import { errors } from '#shared/errors.ts';
import { errorTexts } from './errors.ts';
import { copy } from './ui.ts';

// Spec eigen-account: foutcodes en teksten letterlijk uit de spec.
test('foutcode WRONG_PASSWORD met de spectekst', () => {
  expect(errors.is('WRONG_PASSWORD')).toBe(true);
  expect(errorTexts.WRONG_PASSWORD).toBe('Je huidige wachtwoord klopt niet.');
});

test('profielmenu, paginatitel, naam en wachtwoord', () => {
  expect(copy.menu.account).toBe('Mijn account');
  expect(copy.account.title).toBe('Mijn account');
  expect(copy.account.name).toStrictEqual({
    title: 'Naam',
    label: 'Naam',
    submit: 'Naam opslaan',
    saved: 'Je naam is opgeslagen.',
  });
  expect(copy.account.password).toStrictEqual({
    title: 'Wachtwoord',
    current: 'Huidig wachtwoord',
    new: 'Nieuw wachtwoord',
    repeat: 'Nieuw wachtwoord herhalen',
    help: 'Minstens 12 tekens. Je wordt op je andere apparaten uitgelogd.',
    submit: 'Wachtwoord wijzigen',
    changed: 'Je wachtwoord is gewijzigd. Je andere sessies zijn beëindigd.',
  });
});
