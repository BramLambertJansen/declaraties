import { afterEach, describe, expect, test } from 'vitest';
import {
  BRANCH,
  commit,
  draaiChecker,
  git,
  maakRepo,
  opruimen,
  roep,
  write,
  bouw,
  type Fixture,
} from './follow-up-kit';

// ADR 0031 besluit 4 (strikte statusregel voor ADR's), tests vóór de bouw.
//
// Verwachte pure functie in .claude/hooks/lib/document-state.mjs:
//   statusregelOvertreding(nieuweRegel: string, oudeRegel: string | null, bestaandeAdrNummers: readonly string[]): string | null
// `nieuweRegel` en `oudeRegel` zijn de volledige regels (`Status: ...`); `oudeRegel` is null bij een nieuw ADR-bestand.
// Resultaat: null = geen overtreding, anders de melding (niet-lege tekst). Een regel gelijk aan `oudeRegel` wordt niet getoetst.
// Een regel die niet met `Status:` begint (spec-frontmatter, `status: gebouwd # #<PR>; gevalideerd: <sha>`) valt erbuiten.
// Toegestaan achter de statuswaarde: `(JJJJ-MM-DD)`, `#<nr>` en `[NNNN](NNNN-<slug>.md)` (alleen het nummer als linktekst, het
// nummer moet in `bestaandeAdrNummers` staan), gescheiden door `, ` of ` — `.
afterEach(opruimen);

const MODULE = ['../../.claude/hooks/lib', 'document-state.mjs'].join('/');
const BESTAAND = ['0001', '0017'];

async function overtreding(nieuw: string, oud: string | null = null): Promise<unknown> {
  return roep(MODULE, 'statusregelOvertreding', nieuw, oud, BESTAAND);
}

describe('statusregelOvertreding: toegestane regels', () => {
  test.each([
    ['alleen een datum', 'Status: geaccepteerd (2026-10-14)'],
    ['alleen de statuswaarde', 'Status: geaccepteerd'],
    ['datum, PR en ADR-link met komma', 'Status: geaccepteerd (2026-10-14), #153, [0017](0017-diff-guard.md)'],
    ['datum, PR en ADR-link met streepje', 'Status: geaccepteerd (2026-10-14) — #153 — [0017](0017-diff-guard.md)'],
    ['alleen een ADR-link', 'Status: geaccepteerd — [0001](0001-voorbeeld.md)'],
    ['vervangen door', 'Status: vervangen door 0017 (2026-10-14)'],
  ])('%s: geen overtreding', async (_naam, regel) => {
    expect(await overtreding(regel)).toBeNull();
  });
});

describe('statusregelOvertreding: overtredingen in een nieuwe of gewijzigde regel', () => {
  test.each([
    ['link naar een niet-bestaand ADR', 'Status: geaccepteerd (2026-10-14), [0099](0099-bestaat-niet.md)'],
    ['vrije tekst achter de statuswaarde', 'Status: geaccepteerd (2026-10-14) — herzien na review van de eigenaar'],
    ['vrije tekst zonder datum', 'Status: geaccepteerd — zomaar tekst'],
    ['link met begeleidende woorden', 'Status: geaccepteerd (2026-10-14), zie [0017](0017-diff-guard.md)'],
    ['link met een andere tekst dan het nummer', 'Status: geaccepteerd (2026-10-14), [diff-guard](0017-diff-guard.md)'],
    ['datum in een verkeerde vorm', 'Status: geaccepteerd (14-10-2026)'],
    ['PR zonder nummer', 'Status: geaccepteerd (2026-10-14), #'],
    ['komma direct na de statuswaarde', 'Status: geaccepteerd, #153'],
    ['spatie aan het eind', 'Status: geaccepteerd (2026-10-14) '],
    ['dubbele spatie na de komma', 'Status: geaccepteerd (2026-10-14),  #153'],
    ['tab als scheiding', 'Status: geaccepteerd\t(2026-10-14)'],
    ['dubbel streepje', 'Status: geaccepteerd — — #153'],
  ])('%s: overtreding', async (_naam, regel) => {
    const resultaat = await overtreding(regel, 'Status: voorgesteld');
    expect(typeof resultaat).toBe('string');
    expect(resultaat).toContain('mag niet achter de statuswaarde');
  });

  test('een nieuw ADR-bestand (geen oude regel) wordt ook getoetst', async () => {
    const resultaat = await overtreding('Status: voorgesteld — nog bespreken met de eigenaar', null);
    expect(typeof resultaat).toBe('string');
    expect(resultaat).not.toBe('');
  });
});

describe('statusregelOvertreding: ongewijzigd en buiten de regel', () => {
  test('vrije tekst in een ongewijzigde regel (gelijk aan main): geen overtreding', async () => {
    const regel = 'Status: geaccepteerd — herkomsttekst uit een eerdere correctie';
    expect(await overtreding(regel, regel)).toBeNull();
  });

  test('vrije tekst die afwijkt van de oude regel blijft een overtreding', async () => {
    const oud = 'Status: geaccepteerd — herkomsttekst';
    const resultaat = await overtreding('Status: geaccepteerd — herkomsttekst, uitgebreid', oud);
    expect(typeof resultaat).toBe('string');
  });

  test('de melding noemt het afgewezen deel, ook zonder geldige scheiding', async () => {
    expect(await overtreding('Status: geaccepteerd, #153', 'Status: voorgesteld')).toContain(', #153');
  });

  test('spec met #-commentaar (builtReference) valt buiten de regel', async () => {
    const regel = `status: gebouwd # #153; gevalideerd: ${'a'.repeat(40)}`;
    expect(await overtreding(regel, 'status: goedgekeurd')).toBeNull();
  });
});

// --- check-document-status zelf: nieuwe of gewijzigde ADR-statusregel met vrije tekst faalt ---------------------------------

const NIEUW = 'docs/adr/0002-nieuw.md';
const BESTAAND_ADR = 'docs/adr/0001-voorbeeld.md';

function adr(nummer: string, titel: string, regel: string): string {
  return `# ${nummer} — ${titel}\n\n${regel}\n\n## Context\n\nTekst.\n`;
}

/** Een branch met één administratiecommit; `bewerk` schrijft de ADR-wijziging. Geen taakmandaat. */
function draai(bewerk: (root: string) => void, voorbereiding?: (fixture: Fixture) => Fixture) {
  const start = maakRepo({ specs: [], mandaat: [], roadmap: [] });
  const fixture = voorbereiding === undefined ? start : voorbereiding(start);
  const { head } = bouw(fixture, { gebouwd: [], admin: bewerk });
  return draaiChecker(fixture, head);
}

/** Zet een ADR met de gegeven regel op main (en dus in de vertrouwde basis); de branch start daarna vanaf main. */
function metBasisRegel(regel: string): (fixture: Fixture) => Fixture {
  return ({ root }) => {
    git(root, ['switch', '-q', 'main']);
    write(root, BESTAAND_ADR, adr('0001', 'Voorbeeld', regel));
    const base = commit(root, 'baseline met vrije tekst');
    git(root, ['update-ref', 'refs/remotes/origin/main', base]);
    git(root, ['switch', '-q', '-C', BRANCH]);
    return { root, base };
  };
}

describe('check-document-status: strikte ADR-statusregel', () => {
  test('een nieuw ADR met vrije tekst op de statusregel faalt', () => {
    const uitvoer = draai((root) => {
      write(root, NIEUW, adr('0002', 'Nieuw', 'Status: voorgesteld — zie opmerking van de agent'));
    });
    expect(uitvoer.status).toBe(1);
    expect(uitvoer.stderr).toContain(NIEUW);
    expect(uitvoer.stderr).toContain('statusregel');
  });

  test('een gewijzigde statusregel met vrije tekst faalt', () => {
    const uitvoer = draai((root) => {
      write(root, BESTAAND_ADR, adr('0001', 'Voorbeeld', 'Status: voorgesteld — extra uitleg'));
    });
    expect(uitvoer.status).toBe(1);
    expect(uitvoer.stderr).toContain(BESTAAND_ADR);
    expect(uitvoer.stderr).toContain('statusregel');
  });

  test('een nieuw ADR met link naar een niet-bestaand ADR faalt', () => {
    const uitvoer = draai((root) => {
      write(root, NIEUW, adr('0002', 'Nieuw', 'Status: voorgesteld (2026-10-14), [0099](0099-bestaat-niet.md)'));
    });
    expect(uitvoer.status).toBe(1);
    expect(uitvoer.stderr).toContain('statusregel');
  });

  test('een nieuw ADR met datum, PR en link naar een bestaand ADR slaagt', () => {
    const uitvoer = draai((root) => {
      write(root, NIEUW, adr('0002', 'Nieuw', 'Status: voorgesteld (2026-10-14), #153, [0001](0001-voorbeeld.md)'));
    });
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test('vrije tekst in een regel die gelijk is aan main blijft geldig als de rest van het ADR wijzigt', () => {
    const regel = 'Status: voorgesteld — herkomsttekst van voor besluit 4';
    const uitvoer = draai((root) => {
      write(root, BESTAAND_ADR, `${adr('0001', 'Voorbeeld', regel)}\nExtra alinea.\n`);
    }, metBasisRegel(regel));
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });
});
