import { describe, expect, test } from 'vitest';
import { exportVan, roep } from '../hooks/follow-up-kit';

// compacte-kennisbasis-rails/AC-10 (ADR 0053 punt 3 en 5, ADR 0063 punt 4): `heeftAdr` in check-roadmap vindt een ADR ook in
// `docs/adr/archief/`. `heeftAdr` is niet geëxporteerd; deze test gaat via `heeftBewijs`, dat voor een vervallen (doorgehaald)
// roadmap-item een ADR-verwijzing als bewijs telt.
const ROADMAP_MODULE = ['../../scripts/kit', 'check-roadmap.mjs'].join('/');

async function bewijs(tekst: string, bestanden: string[]): Promise<unknown> {
  const items: unknown = await roep(ROADMAP_MODULE, 'leesItems', tekst);
  if (!Array.isArray(items)) throw new Error('geen lijst van items');
  const lijst: unknown[] = items;
  const [item] = lijst;
  const kader = { scripts: {}, testpaden: [], bestanden, register: new Set<string>() };
  return roep(ROADMAP_MODULE, 'heeftBewijs', item, kader);
}

const ITEM = '- [x] ~~Oude taak~~ vervallen door ADR 0050\n';

describe('compacte-kennisbasis-rails/AC-10: heeftAdr kent het archief', () => {
  test('compacte-kennisbasis-rails/AC-10 heeftBewijs wordt geëxporteerd', async () => {
    expect(typeof (await exportVan(ROADMAP_MODULE, 'heeftBewijs'))).toBe('function');
  });

  test('compacte-kennisbasis-rails/AC-10 een ADR in docs/adr/: bewijs (bestaand gedrag)', async () => {
    expect(await bewijs(ITEM, ['docs/adr/0050-besluit.md'])).toBe(true);
  });

  test('compacte-kennisbasis-rails/AC-10 een ADR alleen in docs/adr/archief/: bewijs', async () => {
    expect(await bewijs(ITEM, ['docs/adr/archief/0050-besluit.md'])).toBe(true);
  });

  test('compacte-kennisbasis-rails/AC-10 een ander nummer in archief/: geen bewijs', async () => {
    expect(await bewijs(ITEM, ['docs/adr/archief/0051-besluit.md'])).toBe(false);
  });

  test('compacte-kennisbasis-rails/AC-10 een ADR-nummer dat nergens bestaat: geen bewijs', async () => {
    expect(await bewijs(ITEM, ['docs/adr/0049-besluit.md'])).toBe(false);
  });

  test('compacte-kennisbasis-rails/AC-10 een bestand in archief/ dat geen ADR is (README.md): geen bewijs', async () => {
    expect(await bewijs(ITEM, ['docs/adr/archief/README.md'])).toBe(false);
  });
});
