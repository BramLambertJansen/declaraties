import { describe, expect, test } from 'vitest';
import { cents } from '../../shared/money.ts';
import { format } from './format.ts';

describe('format (nl-NL, Europe/Amsterdam)', () => {
  test('datum en datum-tijd in de tijdzone van de gebruikers, ook over de datumgrens', () => {
    expect(format.date('2026-10-09T22:30:00Z')).toBe('10 oktober 2026');
    expect(format.dateTime('2026-01-15T08:05:00Z')).toBe('15 januari 2026 om 09:05');
  });

  // Intl zet een vaste spatie (U+00A0) na het euroteken: het bedrag breekt nooit af.
  test('centen als euro, getallen met Nederlandse scheiding', () => {
    expect(format.cents(cents(123456))).toBe('€\u00a01.234,56');
    expect(format.cents(cents(-5))).toBe('€\u00a0-0,05');
    expect(format.number(1234567)).toBe('1.234.567');
  });

  test('een ongeldige tijd faalt hard in plaats van "Invalid Date" te tonen', () => {
    expect(() => format.date('gisteren')).toThrow("geen geldige ISO-tijd: 'gisteren'");
  });
});
