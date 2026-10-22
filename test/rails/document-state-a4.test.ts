import { describe, expect, test } from 'vitest';
import { A4_MELDING, beslisOvergang } from '../../rails/hooks/lib/document-state.mjs';

// A4 in een besluit-PR (ADR 0046 punt 2, eigenaarbesluit 2026-10-22): een geaccepteerd ADR mag worden herschreven als de
// nieuwe tekst meer geldige herzieningsregels heeft (`Herzien: JJJJ-MM-DD (#NNN): <wat>`); dan is de uitslag `herzien`.
// De uitslag 'herzien' bestaat nog niet in het type, daarom vergelijken de tests de uitslag als tekst.
const ADR = 'docs/adr/0099-demo.md';
const SPEC = 'docs/specs/demo.md';
const HERZIEN = 'Herzien: 2026-10-22 (#262): tekst aangepast.';

const adr = (status: string, besluit = 'Iets.', extra: string[] = []): string =>
  `# 0099 — Demo\n\nStatus: ${status}\n\n## Besluit\n\n${besluit}\n${extra.map((regel) => `\n${regel}\n`).join('')}`;
const spec = (status: string, tekst = 'Bestaande kit.'): string =>
  `---\nstatus: ${status}\nnamespace: demo\n---\n\n# Demo\n\n## Hergebruik en UX\n\n${tekst}\n`;

function uitkomst(voor: string | null, na: string, file = ADR): { uitslag: string; nieuw: boolean } {
  const { uitslag, nieuw } = beslisOvergang(file, voor, na);
  return { uitslag, nieuw };
}

describe('B1: geaccepteerd naar geaccepteerd met meer geldige herzieningsregels is herzien', () => {
  test('B1 een geldige herzieningsregel erbij en andere inhoud: herzien, nieuw false', () => {
    expect(uitkomst(adr('geaccepteerd'), adr('geaccepteerd', 'Iets anders.', [HERZIEN]))).toStrictEqual({
      uitslag: 'herzien',
      nieuw: false,
    });
  });

  test('B1 een tweede herzieningsregel bij een ADR dat er al een heeft: herzien', () => {
    const eerder = 'Herzien: 2026-09-01 (#200): eerste herziening.';
    const na = adr('geaccepteerd', 'Nog weer anders.', [eerder, HERZIEN]);
    expect(uitkomst(adr('geaccepteerd', 'Iets anders.', [eerder]), na)).toStrictEqual({
      uitslag: 'herzien',
      nieuw: false,
    });
  });

  test('B1 een schrikkeldag telt als bestaande kalenderdatum: herzien', () => {
    const na = adr('geaccepteerd', 'Iets anders.', ['Herzien: 2028-02-29 (#7): schrikkeldag.']);
    expect(uitkomst(adr('geaccepteerd'), na).uitslag).toBe('herzien');
  });

  test('B1 de statusregel met datum en PR achter de waarde verandert niets aan de uitslag: herzien', () => {
    const na = adr('geaccepteerd (2026-10-22), #262', 'Iets anders.', [HERZIEN]);
    expect(uitkomst(adr('geaccepteerd'), na).uitslag).toBe('herzien');
  });
});

describe('B2: zonder extra geldige herzieningsregel blijft het a4', () => {
  test.each([
    ['geen herzieningsregel', adr('geaccepteerd', 'Iets anders.')],
    ['onbestaande datum (2026-02-30)', adr('geaccepteerd', 'Iets anders.', ['Herzien: 2026-02-30 (#262): tekst.'])],
    ['onbestaande maand (2026-13-01)', adr('geaccepteerd', 'Iets anders.', ['Herzien: 2026-13-01 (#262): tekst.'])],
    ['geen PR-nummer', adr('geaccepteerd', 'Iets anders.', ['Herzien: 2026-10-22: tekst.'])],
    ['PR-nummer 0', adr('geaccepteerd', 'Iets anders.', ['Herzien: 2026-10-22 (#0): tekst.'])],
    ['lege omschrijving', adr('geaccepteerd', 'Iets anders.', ['Herzien: 2026-10-22 (#262): '])],
    ['omschrijving ontbreekt', adr('geaccepteerd', 'Iets anders.', ['Herzien: 2026-10-22 (#262):'])],
    ['kleine letter in het label', adr('geaccepteerd', 'Iets anders.', ['herzien: 2026-10-22 (#262): tekst.'])],
  ])('B2 %s: a4', (_naam, na) => {
    expect(uitkomst(adr('geaccepteerd'), na).uitslag).toBe('a4');
  });

  test('B2 alleen een bestaande herzieningsregel is gewijzigd (niet méér regels): a4', () => {
    const oud = adr('geaccepteerd', 'Iets.', [HERZIEN]);
    const na = adr('geaccepteerd', 'Iets.', ['Herzien: 2026-10-23 (#263): andere omschrijving.']);
    expect(uitkomst(oud, na).uitslag).toBe('a4');
  });

  test('B2 een geldige herzieningsregel erbij, maar een andere verdwijnt (niet méér): a4', () => {
    const oud = adr('geaccepteerd', 'Iets.', [HERZIEN]);
    const na = adr('geaccepteerd', 'Iets anders.', ['Herzien: 2026-10-23 (#263): vervangen regel.']);
    expect(uitkomst(oud, na).uitslag).toBe('a4');
  });

  test('B2 een ongeldige regel erbij naast een bestaande geldige (telt niet mee): a4', () => {
    const oud = adr('geaccepteerd', 'Iets.', [HERZIEN]);
    const na = adr('geaccepteerd', 'Iets anders.', [HERZIEN, 'Herzien: 2026-02-30 (#263): tekst.']);
    expect(uitkomst(oud, na).uitslag).toBe('a4');
  });
});

describe('B3: ongewijzigd gedrag voor de overige overgangen', () => {
  test('B3 geaccepteerd naar voorgesteld blijft a4, ook met herzieningsregel', () => {
    expect(uitkomst(adr('geaccepteerd'), adr('voorgesteld', 'Iets anders.', [HERZIEN])).uitslag).toBe('a4');
  });

  test('B3 geaccepteerd naar voorgesteld zonder inhoudswijziging blijft a4', () => {
    expect(uitkomst(adr('geaccepteerd'), adr('voorgesteld')).uitslag).toBe('a4');
  });

  test.each([['vervallen'], ['vervangen door 0098']])('B3 inhoud van een ADR met status %s wijzigen: a4', (status) => {
    expect(uitkomst(adr(status), adr(status, 'Iets anders.')).uitslag).toBe('a4');
  });

  test.each([['vervallen'], ['vervangen door 0098']])(
    'B3 inhoud van een ADR met status %s wijzigen mét herzieningsregel: a4',
    (status) => {
      expect(uitkomst(adr(status), adr(status, 'Iets anders.', [HERZIEN])).uitslag).toBe('a4');
    },
  );

  test.each([
    ['vervallen', 'geaccepteerd', 'geweigerd'],
    ['vervangen door 0098', 'geaccepteerd', 'geweigerd'],
    ['vervallen', 'voorgesteld', 'a4'],
    ['vervangen door 0098', 'voorgesteld', 'a4'],
  ])('B3 status van %s naar %s zonder inhoudswijziging: %s (alleen met record)', (van, naar, uitslag) => {
    expect(uitkomst(adr(van), adr(naar)).uitslag).toBe(uitslag);
  });

  test.each([['vervallen'], ['vervangen door 0098']])(
    'B3 geaccepteerd naar %s zonder inhoudswijziging blijft besluit',
    (status) => {
      expect(uitkomst(adr('geaccepteerd'), adr(status))).toStrictEqual({ uitslag: 'besluit', nieuw: false });
    },
  );

  test('B3 voorgesteld naar geaccepteerd en een nieuw ADR blijven besluit, nieuw', () => {
    expect(uitkomst(adr('voorgesteld'), adr('geaccepteerd', 'Iets anders.'))).toStrictEqual({
      uitslag: 'besluit',
      nieuw: true,
    });
    expect(uitkomst(null, adr('geaccepteerd'))).toStrictEqual({ uitslag: 'besluit', nieuw: true });
  });

  test('B3 een ongewijzigd geaccepteerd ADR en een voorgesteld ADR blijven vrij', () => {
    expect(uitkomst(adr('geaccepteerd'), adr('geaccepteerd')).uitslag).toBe('vrij');
    expect(uitkomst(adr('voorgesteld'), adr('voorgesteld', 'Iets anders.', [HERZIEN])).uitslag).toBe('vrij');
  });

  test('B3 een spec met herzieningsregel krijgt geen herzien: goedgekeurd met andere inhoud blijft besluit', () => {
    expect(uitkomst(spec('goedgekeurd'), spec('goedgekeurd', 'Nieuw.\n\n' + HERZIEN), SPEC)).toStrictEqual({
      uitslag: 'besluit',
      nieuw: false,
    });
  });
});

describe('B4: A4_MELDING noemt de nieuwe regel', () => {
  test.each([
    ['besluit-PR', /besluit-PR/i],
    ['herzieningsregel', /herzieningsregel/i],
    ['architect', /architect/i],
    ['hoofdsessie', /hoofdsessie/i],
    ['vervallen en vervangen ADR wijzigen niet', /vervallen/i],
    ['vervangen', /vervangen/i],
    ['nooit terug naar voorgesteld', /voorgesteld/i],
    ['ADR 0046 punt 2', /0046 punt 2/],
  ])('B4 de melding noemt %s', (_naam, patroon) => {
    expect(A4_MELDING).toMatch(patroon);
  });
});
