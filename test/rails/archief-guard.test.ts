import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { commit, draaiChecker, git, maakRepo, opruimen, specBody, write, type Fixture } from '../hooks/follow-up-kit';

// compacte-kennisbasis-rails PR 2, AC-1, AC-3, AC-4 en AC-5: de guard `scripts/kit/check-document-status.mjs` zoals guard.yml
// hem draait (echte tijdelijke repositories, main als basis). ADR 0053 punt 1 (verhuizen mag, wijzigen niet) en ADR 0063 punt 4.
afterEach(opruimen);

const ARCHIEF = 'docs/adr/archief/';
const SHA = 'a'.repeat(40);

/** Een lange, onderscheidende tekst: een wijziging van één byte blijft zo een rename, een ander bestand nooit. */
const uniek = (prefix: string): string =>
  Array.from(
    { length: 12 },
    (_regel, index) => `${prefix} regel ${String(index)} met eigen woorden ${prefix}${String(index * 7)}.`,
  ).join('\n');

const adr = (nr: string, status: string, prefix = `adr${nr}`): string =>
  `# ${nr} — Demo\n\nStatus: ${status}\n\n## Besluit\n\n${uniek(prefix)}\n`;

/** main krijgt deze bestanden; de branch start daarop (origin/main = HEAD). */
function metBasis(bestanden: Record<string, string>): Fixture {
  const fixture = maakRepo({ specs: [], mandaat: [], roadmap: [] });
  for (const [pad, tekst] of Object.entries(bestanden)) write(fixture.root, pad, tekst);
  const base = commit(fixture.root, 'chore: basis');
  git(fixture.root, ['update-ref', 'refs/remotes/origin/main', base]);
  return { root: fixture.root, base };
}

function verhuis(fixture: Fixture, van: string, naar: string): void {
  mkdirSync(path.dirname(path.join(fixture.root, naar)), { recursive: true });
  git(fixture.root, ['mv', van, naar]);
}

function slaagt(fixture: Fixture): string {
  const uitvoer = draaiChecker(fixture, commit(fixture.root, 'docs: verhuis'));
  expect(uitvoer.stderr).toBe('');
  expect(uitvoer.status).toBe(0);
  return uitvoer.stdout;
}

function faalt(fixture: Fixture): string {
  const uitvoer = draaiChecker(fixture, commit(fixture.root, 'docs: verhuis'));
  expect(uitvoer.status).toBe(1);
  expect(uitvoer.stderr).not.toBe('');
  return uitvoer.stderr;
}

const OUD = 'docs/adr/0050-oud.md';
const OUD_ARCHIEF = `${ARCHIEF}0050-oud.md`;
const ANDER = 'docs/adr/0051-ander.md';
const DOEL = 'docs/adr/0060-doel.md';

const BASIS: Record<string, string> = {
  [DOEL]: adr('0060', 'geaccepteerd'),
};

describe('compacte-kennisbasis-rails/AC-1: een byte-gelijke git mv naar archief/ is groen', () => {
  test.each([
    ['vervangen door NNNN', 'vervangen door 0060'],
    ['vervallen', 'vervallen'],
  ])('compacte-kennisbasis-rails/AC-1 een %s ADR verhuist byte-gelijk: groen', (_naam, status) => {
    const fixture = metBasis({ ...BASIS, [OUD]: adr('0050', status) });
    verhuis(fixture, OUD, OUD_ARCHIEF);
    slaagt(fixture);
  });

  test("compacte-kennisbasis-rails/AC-1 twee ADR's (vervangen en vervallen) verhuizen in één PR: groen", () => {
    const fixture = metBasis({
      ...BASIS,
      [OUD]: adr('0050', 'vervangen door 0060'),
      [ANDER]: adr('0051', 'vervallen'),
    });
    verhuis(fixture, OUD, OUD_ARCHIEF);
    git(fixture.root, ['mv', ANDER, `${ARCHIEF}0051-ander.md`]);
    slaagt(fixture);
  });

  test('compacte-kennisbasis-rails/AC-1 het archief bevat al een ADR en er verhuist er nog een: groen', () => {
    const fixture = metBasis({
      ...BASIS,
      [OUD]: adr('0050', 'vervallen'),
      [`${ARCHIEF}0049-eerder.md`]: adr('0049', 'vervallen'),
    });
    verhuis(fixture, OUD, OUD_ARCHIEF);
    slaagt(fixture);
  });

  test('compacte-kennisbasis-rails/AC-1 een verhuisde vervangen-door-verwijzing wijst nog naar een bestaand ADR: groen', () => {
    const fixture = metBasis({ ...BASIS, [OUD]: adr('0050', 'vervangen door 0060') });
    verhuis(fixture, OUD, OUD_ARCHIEF);
    expect(slaagt(fixture)).toContain('document-status');
  });
});

describe('compacte-kennisbasis-rails/AC-1: rood bij alles wat geen byte-gelijke verhuizing van vervangen of vervallen is', () => {
  test('compacte-kennisbasis-rails/AC-1 een gewijzigde byte bij de verhuizing: rood', () => {
    const fixture = metBasis({ ...BASIS, [OUD]: adr('0050', 'vervallen') });
    verhuis(fixture, OUD, OUD_ARCHIEF);
    write(fixture.root, OUD_ARCHIEF, `${adr('0050', 'vervallen')}\n`);
    faalt(fixture);
  });

  test('compacte-kennisbasis-rails/AC-1 een gewijzigde statusregel bij de verhuizing: rood', () => {
    const fixture = metBasis({ ...BASIS, [OUD]: adr('0050', 'vervangen door 0060') });
    verhuis(fixture, OUD, OUD_ARCHIEF);
    write(fixture.root, OUD_ARCHIEF, adr('0050', 'vervallen'));
    faalt(fixture);
  });

  test('compacte-kennisbasis-rails/AC-1 een geaccepteerd ADR verhuist: rood', () => {
    const fixture = metBasis({ ...BASIS, [OUD]: adr('0050', 'geaccepteerd') });
    verhuis(fixture, OUD, OUD_ARCHIEF);
    faalt(fixture);
  });

  test('compacte-kennisbasis-rails/AC-1 een voorgesteld ADR verhuist: rood', () => {
    const fixture = metBasis({ ...BASIS, [OUD]: adr('0050', 'voorgesteld') });
    verhuis(fixture, OUD, OUD_ARCHIEF);
    faalt(fixture);
  });

  test('compacte-kennisbasis-rails/AC-1 een verhuizing onder een andere bestandsnaam: rood', () => {
    const fixture = metBasis({ ...BASIS, [OUD]: adr('0050', 'vervallen') });
    verhuis(fixture, OUD, `${ARCHIEF}0050-andere-naam.md`);
    faalt(fixture);
  });

  test('compacte-kennisbasis-rails/AC-1 een andere rename binnen docs/adr/: rood', () => {
    const fixture = metBasis({ ...BASIS, [OUD]: adr('0050', 'vervallen') });
    verhuis(fixture, OUD, 'docs/adr/0050-andere-naam.md');
    faalt(fixture);
  });

  test('compacte-kennisbasis-rails/AC-1 een terugverhuizing uit archief/: rood', () => {
    const fixture = metBasis({ ...BASIS, [OUD_ARCHIEF]: adr('0050', 'vervallen') });
    verhuis(fixture, OUD_ARCHIEF, OUD);
    faalt(fixture);
  });

  test.each(['voorgesteld', 'geaccepteerd', 'vervallen', 'vervangen door 0060'])(
    'compacte-kennisbasis-rails/AC-1 een nieuw bestand in archief/ (status %s) dat geen verhuizing is: rood',
    (status) => {
      const fixture = metBasis({ ...BASIS });
      write(fixture.root, `${ARCHIEF}0070-nieuw.md`, adr('0070', status));
      faalt(fixture);
    },
  );

  test('compacte-kennisbasis-rails/AC-1 een verhuizing samen met een ander gewijzigd bestand buiten docs/: rood', () => {
    const fixture = metBasis({ ...BASIS, [OUD]: adr('0050', 'vervallen') });
    verhuis(fixture, OUD, OUD_ARCHIEF);
    write(fixture.root, 'src/web/features/demo/page.tsx', 'export const x = 1;\n');
    faalt(fixture);
  });
});

describe('compacte-kennisbasis-rails/AC-2: verwijderen uit archief/ is absoluut geweigerd (eigenaarbesluit)', () => {
  test.each(['vervallen', 'vervangen door 0060'])(
    'compacte-kennisbasis-rails/AC-2 een gearchiveerd ADR (%s) verwijderen in een besluit-PR: rood',
    (status) => {
      const fixture = metBasis({ ...BASIS, [OUD_ARCHIEF]: adr('0050', status) });
      git(fixture.root, ['rm', '-q', OUD_ARCHIEF]);
      faalt(fixture);
    },
  );
});

describe('compacte-kennisbasis-rails/AC-3: een nummer in beide mappen is rood', () => {
  test('compacte-kennisbasis-rails/AC-3 hetzelfde nummer in docs/adr/ en archief/: rood en het nummer wordt genoemd', () => {
    const fixture = metBasis({ ...BASIS, [`${ARCHIEF}0050-oud.md`]: adr('0050', 'vervallen') });
    write(fixture.root, 'docs/adr/0050-ander.md', adr('0050', 'voorgesteld', 'ander'));
    expect(faalt(fixture)).toMatch(/0050/);
  });
});

describe('compacte-kennisbasis-rails/AC-4: vervangen door NNNN lost op naar archief/', () => {
  test('compacte-kennisbasis-rails/AC-4 het doel staat alleen in archief/: groen', () => {
    const fixture = metBasis({
      [`${ARCHIEF}0060-doel.md`]: adr('0060', 'vervallen'),
      [OUD]: adr('0050', 'vervangen door 0060'),
    });
    write(fixture.root, 'docs/adr/0070-nieuw.md', adr('0070', 'voorgesteld'));
    slaagt(fixture);
  });

  test('compacte-kennisbasis-rails/AC-4 een gearchiveerd ADR verwijst naar een doel in docs/adr/: groen', () => {
    const fixture = metBasis({ ...BASIS, [OUD_ARCHIEF]: adr('0050', 'vervangen door 0060') });
    write(fixture.root, 'docs/adr/0070-nieuw.md', adr('0070', 'voorgesteld'));
    slaagt(fixture);
  });

  test('compacte-kennisbasis-rails/AC-4 het doel bestaat nergens: rood en het nummer wordt genoemd', () => {
    const fixture = metBasis({ ...BASIS, [OUD_ARCHIEF]: adr('0050', 'vervangen door 0066') });
    write(fixture.root, 'docs/adr/0070-nieuw.md', adr('0070', 'voorgesteld'));
    expect(faalt(fixture)).toMatch(/0066/);
  });
});

describe('compacte-kennisbasis-rails/AC-5: een byte-gelijke git mv van een spec naar docs/template/specs/ is groen', () => {
  const SPEC = 'docs/specs/demo.md';
  const SPEC_TEMPLATE = 'docs/template/specs/demo.md';
  const tekstVoor = (status: string): string =>
    status === 'gebouwd' ? specBody('demo', `gebouwd # #130; gevalideerd: ${SHA}`) : specBody('demo', status);

  // GEWIJZIGD (specarchief-en-bouwvorm/AC-8, ADR 0080, OV-1): `docs/template/specs/` is geen verhuisdoel meer; een spec met
  // eigenaarstatus verlaat docs/specs/ alleen via vervallen naar docs/specs/archief/. Alleen een voorstel blijft groen.
  test.each(['voorstel'])(
    'compacte-kennisbasis-rails/AC-5 een spec met status %s verhuist byte-gelijk: groen',
    (status) => {
      const fixture = metBasis({ [SPEC]: tekstVoor(status) });
      verhuis(fixture, SPEC, SPEC_TEMPLATE);
      slaagt(fixture);
    },
  );

  test.each(['goedgekeurd', 'gebouwd', 'vervallen'])(
    'compacte-kennisbasis-rails/AC-5 een spec met status %s verhuist byte-gelijk naar docs/template/specs/: rood',
    (status) => {
      const fixture = metBasis({ [SPEC]: tekstVoor(status) });
      verhuis(fixture, SPEC, SPEC_TEMPLATE);
      faalt(fixture);
    },
  );

  test.each(['goedgekeurd', 'gebouwd'])(
    'compacte-kennisbasis-rails/AC-5 een spec met status %s verhuist met een gewijzigde byte: rood',
    (status) => {
      const fixture = metBasis({ [SPEC]: tekstVoor(status) });
      verhuis(fixture, SPEC, SPEC_TEMPLATE);
      write(fixture.root, SPEC_TEMPLATE, `${tekstVoor(status)}\nNog een regel.\n`);
      faalt(fixture);
    },
  );

  test('compacte-kennisbasis-rails/AC-5 een goedgekeurde spec krijgt onder docs/template/specs/ een andere status via een rename: rood', () => {
    const fixture = metBasis({ [SPEC]: specBody('demo', 'goedgekeurd') });
    verhuis(fixture, SPEC, SPEC_TEMPLATE);
    write(fixture.root, SPEC_TEMPLATE, specBody('demo', 'vervallen'));
    faalt(fixture);
  });
});

describe('compacte-kennisbasis-rails/AC-4: een statusregel linkt naar een gearchiveerd ADR', () => {
  test('compacte-kennisbasis-rails/AC-4 Status: voorgesteld — [0060](0060-doel.md) met 0060 alleen in archief/: groen', () => {
    const fixture = metBasis({ [`${ARCHIEF}0060-doel.md`]: adr('0060', 'vervallen') });
    write(fixture.root, 'docs/adr/0070-nieuw.md', adr('0070', 'voorgesteld — [0060](0060-doel.md)'));
    slaagt(fixture);
  });

  test('compacte-kennisbasis-rails/AC-4 een statusregel naar een ADR dat nergens bestaat: rood', () => {
    const fixture = metBasis({ [`${ARCHIEF}0060-doel.md`]: adr('0060', 'vervallen') });
    write(fixture.root, 'docs/adr/0070-nieuw.md', adr('0070', 'voorgesteld — [0066](0066-weg.md)'));
    faalt(fixture);
  });
});

describe('compacte-kennisbasis-rails/AC-9: een ADR boven het budget verhuist naar archief/', () => {
  test('compacte-kennisbasis-rails/AC-9 een vervallen ADR van meer dan 6 KB verhuist byte-gelijk: groen', () => {
    const groot = `${adr('0050', 'vervallen')}\n${'Lange tekst. '.repeat(600)}\n`;
    const fixture = metBasis({ ...BASIS, [OUD]: groot });
    verhuis(fixture, OUD, OUD_ARCHIEF);
    slaagt(fixture);
  });
});
