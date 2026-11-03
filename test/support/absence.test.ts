import { describe, expect, test } from 'vitest';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';
import { expectAbsent } from './absence.ts';

// Leerpunt #402: `expect(tekst).not.toMatch(/mandat/i)` bleef groen terwijl de bron "taakmandaat" noemde, want "mandaat"
// bevat geen "mandat". expectAbsent bewijst eerst dat het patroon de genoemde vormen herkent, en pas dan de afwezigheid.
describe('expectAbsent', () => {
  test('slaagt als het patroon de voorbeelden herkent en de tekst geen match heeft', () => {
    expect(() => {
      expectAbsent('alleen de eigenaar beslist', /manda+te?|taakscope/i, { recognizes: ['taakmandaat', 'mandate'] });
    }).not.toThrow();
  });

  test('faalt als de tekst een match heeft, en noemt de match', () => {
    expect(() => {
      expectAbsent('het taakmandaat geldt', /manda+te?/i, { recognizes: ['mandaat'] });
    }).toThrow(/mandaat/);
  });

  test('faalt op een te smal patroon, ook als de tekst het woord bevat (de fout uit #402)', () => {
    expect(() => {
      expectAbsent('het taakmandaat geldt', /mandat|taakscope/i, { recognizes: ['mandaat', 'mandate'] });
    }).toThrow(/herkent.*"mandaat"/);
  });

  test('faalt op een te smal patroon, ook als de tekst schoon is', () => {
    expect(() => {
      expectAbsent('schoon', /mandat/i, { recognizes: ['mandate', 'mandaat'] });
    }).toThrow(/"mandaat"/);
  });

  test('faalt op een te breed patroon: een toegestaan voorbeeld matcht', () => {
    expect(() => {
      expectAbsent('schoon', /manda/i, { recognizes: ['mandaat'], allows: ['mandarijn'] });
    }).toThrow(/"mandarijn"/);
  });

  test('slaagt als de toegestane voorbeelden niet matchen', () => {
    expect(() => {
      expectAbsent('een mandarijn', /\bmanda+te?\b/i, { recognizes: ['mandaat'], allows: ['mandarijn'] });
    }).not.toThrow();
  });

  test('faalt zonder voorbeelden, ook als het type omzeild is', () => {
    const leeg = unsafeCast<{ recognizes: readonly [string] }>(
      JSON.parse('{"recognizes":[]}'),
      'test: een lege lijst via JSON omzeilt het tuple-type',
    );
    expect(() => {
      expectAbsent('schoon', /mandaat/i, leeg);
    }).toThrow(/voorbeeld/);
  });

  test('de vlaggen g en y veranderen de uitkomst niet', () => {
    expect(() => {
      expectAbsent('abc', /x/g, { recognizes: ['x', 'x', 'x'] });
    }).not.toThrow();
    expect(() => {
      expectAbsent('x', /x/y, { recognizes: ['x', 'x'] });
    }).toThrow(/"x"/);
  });
});
