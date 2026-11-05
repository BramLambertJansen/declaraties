import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { commit, draaiChecker, git, maakRepo, opruimen, write, type Fixture } from '../hooks/follow-up-kit';

// docs/specs/specarchief-en-bouwvorm.md (ADR 0080), AC-2 en AC-8: de guard `scripts/kit/check-document-status.mjs` zoals
// guard.yml hem draait (echte tijdelijke repositories, main als basis). Vorm van test/rails/archief-guard.test.ts.
afterEach(opruimen);

const SPEC = 'docs/specs/oud.md';
const ARCHIEF = 'docs/specs/archief/oud.md';
const AC_WEG = 'docs/specs/oud.md: oud/AC-3 verdwijnt; een AC houdt zijn id (ADR 0080)';
const VERLAAT =
  'docs/specs/oud.md: een spec met eigenaarstatus verlaat docs/specs/ alleen via vervallen naar het archief (ADR 0080)';

/** Een lange, onderscheidende spec met drie AC's: een gewijzigde byte blijft zo een rename. */
function spec(status: string, opties: { namespace?: string; acs?: number[]; extra?: string } = {}): string {
  const ns = opties.namespace ?? 'oud';
  const acs = (opties.acs ?? [1, 2, 3]).map(
    (n) => `- **${ns}/AC-${String(n)}** — Gegeven geval ${String(n)}, dan iets.`,
  );
  const tekst = Array.from({ length: 10 }, (_r, i) => `Regel ${String(i)} met eigen woorden oud${String(i * 7)}.`);
  return [
    '---',
    `status: ${status}`,
    `namespace: ${ns}`,
    '---',
    '',
    '# Oud',
    '',
    '## Hergebruik en UX',
    '',
    ...tekst,
    '',
    '## Acceptatiecriteria',
    '',
    ...acs,
    opties.extra ?? '',
  ].join('\n');
}

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

function slaagt(fixture: Fixture): void {
  const uitvoer = draaiChecker(fixture, commit(fixture.root, 'docs: wijziging'));
  expect(uitvoer.stderr).toBe('');
  expect(uitvoer.status).toBe(0);
}

function faalt(fixture: Fixture): string {
  const uitvoer = draaiChecker(fixture, commit(fixture.root, 'docs: wijziging'));
  expect(uitvoer.status).toBe(1);
  expect(uitvoer.stderr).not.toBe('');
  return uitvoer.stderr;
}

describe('specarchief-en-bouwvorm/AC-2: een byte-gelijke git mv van een vervallen spec naar docs/specs/archief/', () => {
  test('specarchief-en-bouwvorm/AC-2 een op main vervallen spec verhuist byte-gelijk, alleen met docs/: groen', () => {
    const fixture = metBasis({ [SPEC]: spec('vervallen') });
    verhuis(fixture, SPEC, ARCHIEF);
    write(fixture.root, 'docs/operations/notitie.md', '# Notitie\n\nVerhuisd.\n');
    slaagt(fixture);
  });

  test.each(['voorstel', 'goedgekeurd', 'gebouwd # #120'])(
    'specarchief-en-bouwvorm/AC-2 een spec met status %s op main verhuist: rood met de melding',
    (status) => {
      const fixture = metBasis({ [SPEC]: spec(status) });
      verhuis(fixture, SPEC, ARCHIEF);
      const kort = status.split(' ')[0] ?? status;
      expect(faalt(fixture)).toContain(`alleen een vervallen spec verhuist naar het archief (status ${kort})`);
    },
  );

  test('specarchief-en-bouwvorm/AC-2 een gewijzigde byte bij de verhuizing: rood', () => {
    const fixture = metBasis({ [SPEC]: spec('vervallen') });
    verhuis(fixture, SPEC, ARCHIEF);
    write(fixture.root, ARCHIEF, `${spec('vervallen')}\nNog een regel.\n`);
    faalt(fixture);
  });

  test('specarchief-en-bouwvorm/AC-2 een verhuizing onder een andere naam: rood', () => {
    const fixture = metBasis({ [SPEC]: spec('vervallen') });
    verhuis(fixture, SPEC, 'docs/specs/archief/ander.md');
    faalt(fixture);
  });

  test('specarchief-en-bouwvorm/AC-2 een terugverhuizing uit het archief: rood', () => {
    const fixture = metBasis({ [ARCHIEF]: spec('vervallen') });
    verhuis(fixture, ARCHIEF, SPEC);
    faalt(fixture);
  });

  test.each(['voorstel', 'vervallen'])(
    'specarchief-en-bouwvorm/AC-2 een nieuw bestand in het archief (status %s): rood',
    (status) => {
      const fixture = metBasis({ 'docs/specs/ander.md': spec('voorstel', { namespace: 'ander' }) });
      write(fixture.root, ARCHIEF, spec(status));
      faalt(fixture);
    },
  );

  test('specarchief-en-bouwvorm/AC-2 een gewijzigd bestand in het archief: rood', () => {
    const fixture = metBasis({ [ARCHIEF]: spec('vervallen') });
    write(fixture.root, ARCHIEF, spec('vervallen', { extra: 'Erratum.' }));
    faalt(fixture);
  });

  test('specarchief-en-bouwvorm/AC-2 een verwijderd bestand in het archief: rood', () => {
    const fixture = metBasis({ [ARCHIEF]: spec('vervallen') });
    git(fixture.root, ['rm', '-q', ARCHIEF]);
    faalt(fixture);
  });

  test('specarchief-en-bouwvorm/AC-2 een verhuizing met een bestand buiten docs/ ernaast: rood', () => {
    const fixture = metBasis({ [SPEC]: spec('vervallen') });
    verhuis(fixture, SPEC, ARCHIEF);
    write(fixture.root, 'src/web/features/demo/page.tsx', 'export const x = 1;\n');
    faalt(fixture);
  });
});

describe('specarchief-en-bouwvorm/AC-8: een spec met eigenaarstatus houdt zijn AC-ids en blijft in docs/specs/', () => {
  test('specarchief-en-bouwvorm/AC-8 oud/AC-3 weg uit een goedgekeurde spec: rood met de melding', () => {
    const fixture = metBasis({ [SPEC]: spec('goedgekeurd') });
    write(fixture.root, SPEC, spec('goedgekeurd', { acs: [1, 2] }));
    expect(faalt(fixture)).toContain(AC_WEG);
  });

  test.each(['voorstel', 'vervallen'])(
    'specarchief-en-bouwvorm/AC-8 naar %s zonder oud/AC-3: rood met de melding',
    (status) => {
      const fixture = metBasis({ [SPEC]: spec('goedgekeurd') });
      write(fixture.root, SPEC, spec(status, { acs: [1, 2] }));
      expect(faalt(fixture)).toContain(AC_WEG);
    },
  );

  test('specarchief-en-bouwvorm/AC-8 een andere namespace: rood met de melding', () => {
    const fixture = metBasis({ [SPEC]: spec('goedgekeurd') });
    write(fixture.root, SPEC, spec('goedgekeurd', { namespace: 'nieuw' }));
    expect(faalt(fixture)).toContain(AC_WEG);
  });

  test('specarchief-en-bouwvorm/AC-8 het bestand verwijderd: rood met de melding', () => {
    const fixture = metBasis({ [SPEC]: spec('goedgekeurd') });
    git(fixture.root, ['rm', '-q', SPEC]);
    expect(faalt(fixture)).toContain(VERLAAT);
  });

  test.each(['docs/specs/nieuw.md', 'docs/template/specs/oud.md'])(
    'specarchief-en-bouwvorm/AC-8 een byte-gelijke rename naar %s: rood',
    (naar) => {
      const fixture = metBasis({ [SPEC]: spec('goedgekeurd') });
      verhuis(fixture, SPEC, naar);
      faalt(fixture);
    },
  );

  test('specarchief-en-bouwvorm/AC-8 naar vervallen met gelijke inhoud: groen', () => {
    const fixture = metBasis({ [SPEC]: spec('goedgekeurd') });
    write(fixture.root, SPEC, spec('vervallen'));
    slaagt(fixture);
  });

  test('specarchief-en-bouwvorm/AC-8 een gebouwde spec naar vervallen met gelijke inhoud: groen', () => {
    const fixture = metBasis({ [SPEC]: spec('gebouwd # #120') });
    write(fixture.root, SPEC, spec('vervallen'));
    slaagt(fixture);
  });
});
