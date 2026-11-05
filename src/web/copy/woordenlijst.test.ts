import { describe, expect, test } from 'vitest';
import { coreErrorTexts } from '#core/web/copy/errors.ts';
import { uiTexts } from '#core/web/copy/ui.ts';
import { errorTexts } from './errors.ts';
import { copy, roleLabels } from './ui.ts';

// Woordenlijst (framework §7, .claude/rules/web.md): alle zichtbare tekst is Nederlands en volgt dezelfde woorden.
// Een label is een infinitief ("Annuleren", niet "Annuleer"); geen Engelse woorden in de interface.
// Een nieuw woord hoort in deze lijst, met het goede alternatief.

// Een hele tekst die precies zo luidt (knoppen en menu-items), en wat er moet staan.
const LABELS: Readonly<Record<string, string>> = {
  Annuleer: 'Annuleren',
  'Sla op': 'Opslaan',
  Bewaar: 'Opslaan',
  Verwijder: 'Verwijderen',
  Verstuur: 'Versturen',
  Sluit: 'Sluiten',
  'Log in': 'Inloggen',
  'Log uit': 'Uitloggen',
  Wijzig: 'Wijzigen',
  Bevestig: 'Bevestigen',
};

// Een woord dat nergens mag staan (hoofdletterongevoelig, heel woord), en wat er moet staan.
// Als paren, niet als object: `password: '…'` ziet de secret-scanner (Betterleaks) aan voor een wachtwoord.
const WORDS: readonly (readonly [string, string])[] = [
  ['login', 'Inloggen'],
  ['logout', 'Uitloggen'],
  ['submit', 'Versturen'],
  ['cancel', 'Annuleren'],
  ['save', 'Opslaan'],
  ['email', 'E-mailadres (label) of e-mail (in een zin)'],
  ['password', 'Wachtwoord'],
  ['username', 'E-mailadres'],
];

/** Alle teksten in een copy-object, met hun pad; functies (teksten met een waarde) worden met een voorbeeldwaarde aangeroepen. */
function texts(value: unknown, path: string): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (typeof value === 'function') {
    const result: unknown = Reflect.apply(value, undefined, ['voorbeeld@template.test']);
    return texts(result, `${path}()`);
  }
  if (typeof value === 'object' && value !== null)
    return Object.entries(value).flatMap(([key, child]) => texts(child, `${path}.${key}`));
  return [];
}

function violations(entries: readonly [string, string][]): string[] {
  return entries.flatMap(([path, text]) => {
    const label = LABELS[text.trim()];
    const found = label === undefined ? [] : [`${path}: "${text}" → "${label}"`];
    for (const [word, instead] of WORDS) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(text)) found.push(`${path}: "${word}" in "${text}" → ${instead}`);
    }
    return found;
  });
}

describe('woordenlijst', () => {
  test('alle copy van app en core volgt de woordenlijst', () => {
    const all = [
      ...texts(copy, 'copy'),
      ...texts(roleLabels, 'roleLabels'),
      ...texts(errorTexts, 'errorTexts'),
      ...texts(uiTexts, 'uiTexts'),
      ...texts(coreErrorTexts, 'coreErrorTexts'),
    ];

    expect(all.length).toBeGreaterThan(50);
    expect(violations(all)).toStrictEqual([]);
  });

  test('de lijst vangt een bekende fout (zelftest)', () => {
    expect(
      violations([
        ['knop', 'Annuleer'],
        ['zin', 'Je login is verlopen.'],
        ['goed', 'Annuleren'],
        ['zin', 'Je e-mail is verstuurd.'],
      ]),
    ).toStrictEqual(['knop: "Annuleer" → "Annuleren"', 'zin: "login" in "Je login is verlopen." → Inloggen']);
  });
});
