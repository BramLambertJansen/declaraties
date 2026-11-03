import { describe, expect, test } from 'vitest';
import { expectAbsent } from './absence.ts';
import { expectNegativeTable } from './negative-table.ts';

// Leerpunt #401: alle rijen van een negatieve tabel gaven `false`, maar de gedeelde basis was zelf al onwaar. Het weghalen
// van een bewaakte voorwaarde (`!authority.safe(...)`) liet daardoor alles groen. expectNegativeTable bewijst eerst dat de
// basis waar is, en eist per rij dat precies die wijziging de uitkomst onwaar maakt.
interface Toegang {
  readonly rol: string;
  readonly veilig: boolean;
  readonly status: string;
}

const BASIS: Toegang = { rol: 'eigenaar', veilig: true, status: 'goedgekeurd' };
const RIJEN = [
  { name: 'andere rol', change: (b: Toegang) => ({ ...b, rol: 'gast' }) },
  { name: 'onveilig pad', change: (b: Toegang) => ({ ...b, veilig: false }) },
  { name: 'voorstel', change: (b: Toegang) => ({ ...b, status: 'voorstel' }) },
];

const goed = (t: Toegang) => t.rol === 'eigenaar' && t.veilig && t.status === 'goedgekeurd';

describe('expectNegativeTable', () => {
  test('slaagt als de basis waar is en elke rij hem onwaar maakt', () => {
    expect(() => {
      expectNegativeTable({ base: BASIS, check: goed, cases: RIJEN });
    }).not.toThrow();
  });

  test('faalt als de basis al onwaar is, ook als elke rij onwaar geeft (de fout uit #401)', () => {
    expect(() => {
      expectNegativeTable({ base: { ...BASIS, status: 'vervallen' }, check: goed, cases: RIJEN });
    }).toThrow(/de basis is al onwaar/);
  });

  test('faalt als een bewaakte voorwaarde uit de code is, en noemt de rij', () => {
    const zonderVeilig = (t: Toegang) => t.rol === 'eigenaar' && t.status === 'goedgekeurd';
    expect(() => {
      expectNegativeTable({ base: BASIS, check: zonderVeilig, cases: RIJEN });
    }).toThrow(/"onveilig pad"/);
  });

  test('noemt alle falende rijen tegelijk', () => {
    const altijd = () => true;
    expect(() => {
      expectNegativeTable({ base: BASIS, check: altijd, cases: RIJEN });
    }).toThrow(/"andere rol".*"onveilig pad".*"voorstel"/s);
  });

  test('faalt op een rij die niets verandert', () => {
    expect(() => {
      expectNegativeTable({ base: { ...BASIS }, check: goed, cases: [...RIJEN, { name: 'leeg', change: (b) => b }] });
    }).toThrow(/"leeg" verandert niets/);
  });

  test('faalt als een rij de basis zelf wijzigt, ook als check dat niet ziet', () => {
    const basis = { veilig: true, tag: 'basis', diep: { n: 1 } };
    const stil = {
      name: 'muteert stil',
      change: (b: typeof basis) => {
        b.tag = 'gemuteerd';
        return { ...b, veilig: false };
      },
    };
    const diep = {
      name: 'muteert diep',
      change: (b: typeof basis) => {
        b.diep.n = 2;
        return { ...b, veilig: false };
      },
    };
    const goedeRij = { name: 'onveilig', change: (b: typeof basis) => ({ ...b, veilig: false }) };
    let melding = '';
    try {
      expectNegativeTable({ base: basis, check: (t) => t.veilig, cases: [stil, diep, goedeRij] });
    } catch (error) {
      melding = String(error);
    }
    expect(melding).toMatch(/"muteert stil" wijzigt de basis zelf/);
    expect(melding).toMatch(/"muteert diep" wijzigt de basis zelf/);
    expectAbsent(melding, /"onveilig"/, { recognizes: ['"onveilig" geeft nog steeds waar'] });
  });

  test('faalt zonder rijen', () => {
    expect(() => {
      expectNegativeTable({ base: BASIS, check: goed, cases: [] });
    }).toThrow(/rij/);
  });
});
