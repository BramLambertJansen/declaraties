import { describe, expect, test } from 'vitest';
import { beslisOvergang, documentKind } from '../../rails/hooks/lib/document-state.mjs';

// compacte-kennisbasis-rails PR 2 (docs/specs/compacte-kennisbasis-rails.md, ADR 0063 punt 1 en 4, ADR 0053 punt 2):
// `documentKind` kent het archief en de template-specs; `beslisOvergang` geeft dan `a4` op een gearchiveerd ADR.
const ARCHIEF = 'docs/adr/archief/0096-oud.md';

const adr = (status: string, besluit = 'Iets.'): string =>
  `# 0096 — Oud\n\nStatus: ${status}\n\n## Besluit\n\n${besluit}\n`;

describe('compacte-kennisbasis-rails/AC-2: documentKind kent het archief', () => {
  test.each([
    ['docs/adr/archief/0096-oud.md', 'adr'],
    ['docs/adr/0096-oud.md', 'adr'],
  ])('compacte-kennisbasis-rails/AC-2 documentKind(%s) is %s', (pad, kind) => {
    expect(documentKind(pad)).toBe(kind);
  });

  test.each([
    'docs/adr/archief/README.md',
    'docs/adr/archief/_sjabloon.md',
    'docs/adr/archief/sub/0096-oud.md',
    'docs/adr/archief/096-oud.md',
    'docs/archief/0096-oud.md',
  ])('compacte-kennisbasis-rails/AC-2 documentKind(%s) is geen ADR', (pad) => {
    expect(documentKind(pad)).toBeNull();
  });
});

describe('compacte-kennisbasis-rails/AC-2: elke wijziging of verwijdering in archief/ geeft a4', () => {
  test.each([
    ['vervallen', 'vervallen'],
    ['vervangen door 0060', 'vervangen door 0060'],
    ['geaccepteerd', 'geaccepteerd'],
  ])('compacte-kennisbasis-rails/AC-2 een gewijzigde tekst bij status %s: a4', (_naam, status) => {
    expect(beslisOvergang(ARCHIEF, adr(status), adr(status, 'Iets anders.')).uitslag).toBe('a4');
  });

  test('compacte-kennisbasis-rails/AC-2 een verwijderd gearchiveerd ADR: a4', () => {
    expect(beslisOvergang(ARCHIEF, adr('vervallen'), '').uitslag).toBe('a4');
  });

  test('compacte-kennisbasis-rails/AC-2 een gearchiveerd ADR terug naar voorgesteld: a4', () => {
    expect(beslisOvergang(ARCHIEF, adr('vervallen'), adr('voorgesteld')).uitslag).toBe('a4');
  });

  // Eigenaarbesluit: elke wijziging wordt geweigerd; `a4` of `geweigerd` maakt niet uit.
  test('compacte-kennisbasis-rails/AC-2 alleen de status gewijzigd (vervallen naar vervangen door 0060): niet toegestaan', () => {
    expect(['a4', 'geweigerd']).toContain(
      beslisOvergang(ARCHIEF, adr('vervallen'), adr('vervangen door 0060')).uitslag,
    );
  });

  test('compacte-kennisbasis-rails/AC-2 ongewijzigd gearchiveerd ADR: vrij', () => {
    expect(beslisOvergang(ARCHIEF, adr('vervallen'), adr('vervallen')).uitslag).toBe('vrij');
  });
});

describe('compacte-kennisbasis-rails/AC-5: documentKind herkent docs/template/specs/ als spec', () => {
  test.each(['docs/template/specs/demo.md', 'docs/template/specs/demo-twee.md', 'docs/specs/demo.md'])(
    'compacte-kennisbasis-rails/AC-5 documentKind(%s) is spec',
    (pad) => {
      expect(documentKind(pad)).toBe('spec');
    },
  );

  test.each([
    'docs/template/specs/_template.md',
    'docs/template/specs/sub/demo.md',
    'docs/template/demo.md',
    'docs/template/specs/Demo.md',
  ])('compacte-kennisbasis-rails/AC-5 documentKind(%s) is geen spec', (pad) => {
    expect(documentKind(pad)).toBeNull();
  });

  test('compacte-kennisbasis-rails/AC-5 een gewijzigde goedgekeurde spec onder docs/template/specs/ is een besluit, geen weigering', () => {
    const spec = (tekst: string) =>
      `---\nstatus: goedgekeurd\nnamespace: demo\n---\n\n# Demo\n\n## Hergebruik en UX\n\n${tekst}\n`;
    expect(beslisOvergang('docs/template/specs/demo.md', spec('Kit.'), spec('Andere kit.'))).toStrictEqual({
      uitslag: 'besluit',
      nieuw: false,
    });
  });
});
