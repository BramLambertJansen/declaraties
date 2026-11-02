import { afterEach, describe, expect, test } from 'vitest';
import {
  S1,
  S2,
  ROADMAP,
  basisRoadmap,
  bouw,
  doneItem,
  draaiChecker,
  git,
  maakRepo,
  opruimen,
  openItem,
  roadmapSleutels,
  type Fixture,
  type Stappen,
} from './follow-up-kit';

// mandate-follow-up/AC-1 t/m AC-5, AC-19, AC-21, AC-22 en AC-25 (spec docs/specs/taakmandaat-vervolg.md):
// `check-document-status` (guard.yml) in echte tijdelijke Git-repositories, met actieve mandaten in het register op main en een
// `gh`-stub voor PR en checks. Een spec die naar `gebouwd` gaat, krijgt de statusregel van `pnpm docs:status` met als gevalideerde
// SHA de broncommit; het vinkje staat in de broncommit (`bronRoadmap`) of in de administratiecommit (`adminRoadmap`).
afterEach(opruimen);

// GEWIJZIGD (compacte-kennisbasis-rails/AC-14 en AC-15, PR 6b): een record in `.claude/decisions.json` geeft niets meer en
// `check-document-status` kent geen taakscope of roadmapcontrole per mandaat. De fixtures schrijven nog records (tolerant
// gelezen) om te bewijzen dat ze genegeerd worden: elke wijziging die het mandaat weigerde, slaagt nu. Het succesmerk is:
// exitcode 0, lege stderr, `document-status:` op stdout en nergens "mandat" of "taakscope".
const NIET_NEUTRAAL = /manda+te?|taakscope/i;

function repo(roadmap: string[], mandaat: string[] = [S1], specs: string[] = [S1, S2]): Fixture {
  return maakRepo({ specs, mandaat, roadmap });
}

function slaagt(fixture: Fixture, stappen: Stappen): void {
  const { head } = bouw(fixture, stappen);
  const uitvoer = draaiChecker(fixture, head);
  expect(uitvoer.stderr).toBe('');
  expect(uitvoer.status).toBe(0);
  expect(uitvoer.stdout).toContain('document-status:');
  expect(uitvoer.stdout).not.toMatch(NIET_NEUTRAAL);
}

function metTick(regels: string[], spec: string, bewijs = ' (#130)'): string[] {
  return regels.map((regel) => (regel === openItem(spec) ? doneItem(spec, bewijs) : regel));
}

describe('fixture-controle (regressie): een spec naar gebouwd zonder roadmapwijziging', () => {
  test('slaagt met geldig bouwbewijs uit de gh-stub', () => {
    slaagt(repo(basisRoadmap()), { gebouwd: [S1] });
  });
});

describe('AC-1: het vinkje van de taak naast de statusovergang', () => {
  test.each([
    ['in de broncommit', 'bronRoadmap'],
    ['in de administratiecommit', 'adminRoadmap'],
  ] as const)('slaagt: enige open item van S afgevinkt met PR-nummer, %s', (_naam, waar) => {
    slaagt(repo(basisRoadmap()), { gebouwd: [S1], [waar]: metTick(basisRoadmap(), S1) });
  });
});

describe('AC-2 (AC-14: geen mandaatscope meer): roadmapwijzigingen buiten het item van de taak', () => {
  const tickS1 = metTick(basisRoadmap(), S1);
  const zonderToelichting = tickS1.slice(0, -2);
  const gevallen: [string, string[]][] = [
    [
      'één andere regel gewijzigd',
      tickS1.map((regel) => (regel === 'Toelichting.' ? 'Toelichting aangepast.' : regel)),
    ],
    ['een item van een spec zonder mandaat afgevinkt', metTick(tickS1, S2)],
    ['een regel toegevoegd buiten het item', [...tickS1, 'Nieuwe regel.']],
    ['een regel verwijderd buiten het item', zonderToelichting],
    [
      'tekst van het item gewijzigd in plaats van aangevuld',
      [doneItem(S1, ' (#130)', 'Andere taak voor'), ...tickS1.slice(1)],
    ],
    ['een open itemregel in de aanvulling', [`${doneItem(S1)}\n  - [ ] Nieuw deelitem`, ...tickS1.slice(1)]],
    ['een afgevinkte itemregel in de aanvulling', [`${doneItem(S1)}\n  - [x] Nieuw deelitem (#9)`, ...tickS1.slice(1)]],
    [
      'een hoofdletter-X-itemregel diep ingesprongen in de aanvulling',
      [`${doneItem(S1)}\n    - [X] Nieuw (#9)`, ...tickS1.slice(1)],
    ],
    [
      'een ander item heropend',
      tickS1.map((regel) => (regel === '- [x] Oud werk (#5)' ? '- [ ] Oud werk (#5)' : regel)),
    ],
  ];

  test.each(gevallen)('slaagt zonder mandaatscope: %s', (_naam, roadmap) => {
    slaagt(repo(basisRoadmap()), { gebouwd: [S1], bronRoadmap: roadmap });
  });

  test('slaagt zonder mandaatscope: het bestand wordt hernoemd', () => {
    slaagt(repo(basisRoadmap()), {
      gebouwd: [S1],
      bron: (root) => git(root, ['mv', ROADMAP, 'docs/roadmap-oud.md']),
    });
  });

  test('slaagt zonder mandaatscope: het bestand wordt verwijderd', () => {
    slaagt(repo(basisRoadmap()), { gebouwd: [S1], bron: (root) => git(root, ['rm', '-q', ROADMAP]) });
  });
});

describe('AC-3 (AC-14: geen mandaatscope meer): eenduidigheid van het item van de taak wordt niet meer gecontroleerd', () => {
  test('twee open items die S noemen: slaagt', () => {
    const basis = [openItem(S1), openItem(S1, 'Tweede taak voor'), 'Toelichting.'];
    slaagt(repo(basis), { gebouwd: [S1], bronRoadmap: [doneItem(S1), ...basis.slice(1)] });
  });

  test('een open item plus een afgevinkt item dat S noemt: slaagt', () => {
    const basis = [openItem(S1), doneItem(S1, ' (#5)', 'Eerder werk voor'), 'Toelichting.'];
    slaagt(repo(basis), { gebouwd: [S1], bronRoadmap: [doneItem(S1), ...basis.slice(1)] });
  });

  test('noemt in de merge-base geen item S (ook niet als de PR het pad toevoegt): slaagt', () => {
    const basis = ['- [ ] Taak zonder pad', 'Toelichting.'];
    const head = [`- [x] Taak zonder pad \`${S1}\` (#130)`, 'Toelichting.'];
    slaagt(repo(basis), { gebouwd: [S1], bronRoadmap: head });
  });
});

describe('AC-4 (AC-14: geen mandaatscope meer): vinkje zonder bewijs is alleen nog een zaak van check:roadmap', () => {
  test('het afgevinkte item zonder bewijs: check-document-status slaagt, check:roadmap meldt roadmap:bewijs', async () => {
    const fixture = repo(basisRoadmap());
    const { head } = bouw(fixture, { gebouwd: [S1], bronRoadmap: metTick(basisRoadmap(), S1, '') });
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.status).toBe(0);
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.stdout).not.toMatch(NIET_NEUTRAAL);
    expect(await roadmapSleutels(fixture.root)).toContain('roadmap:bewijs:5');
  });

  test('zonder bewijs én een andere regel gewijzigd: slaagt, geen mandaatmelding', () => {
    const roadmap = metTick(basisRoadmap(), S1, '').map((regel) => (regel === 'Toelichting.' ? 'Anders.' : regel));
    slaagt(repo(basisRoadmap()), { gebouwd: [S1], bronRoadmap: roadmap });
  });

  test('zonder bewijs én twee open items: slaagt, geen mandaatmelding', () => {
    const basis = [openItem(S1), openItem(S1, 'Tweede taak voor')];
    slaagt(repo(basis), { gebouwd: [S1], bronRoadmap: [doneItem(S1, ''), basis[1] ?? ''] });
  });
});

describe('AC-5 (AC-14: geen mandaatscope meer): twee records op één branch', () => {
  const basis = [openItem(S1), openItem(S2), '- [ ] Derde taak', 'Toelichting.'];
  const beide = [doneItem(S1), doneItem(S2), ...basis.slice(2)];

  test('het item van S1 en het item van S2 afgevinkt, elk met bewijs: slaagt', () => {
    slaagt(repo(basis, [S1, S2]), { gebouwd: [S1, S2], bronRoadmap: beide });
  });

  test('daarnaast een derde item afgevinkt: slaagt (geen mandaatscope meer)', () => {
    const derde = [...beide.slice(0, 2), '- [x] Derde taak (#9)', 'Toelichting.'];
    slaagt(repo(basis, [S1, S2]), { gebouwd: [S1, S2], bronRoadmap: derde });
  });
});

describe('AC-19: een mandaat zonder roadmap-item', () => {
  test('S1 met item en S2 zonder item, alleen het item van S1 afgevinkt: slaagt zonder melding over S2', () => {
    const basis = [openItem(S1), 'Toelichting.'];
    slaagt(repo(basis, [S1, S2]), { gebouwd: [S1, S2], bronRoadmap: [doneItem(S1), 'Toelichting.'] });
  });
});

describe('AC-21: één item voor twee specs met mandaat', () => {
  test('een item dat S1 en S2 noemt: afvinken slaagt', () => {
    const gedeeld = `- [ ] Gedeelde taak \`${S1}\` en \`${S2}\``;
    const klaar = `- [x] Gedeelde taak \`${S1}\` en \`${S2}\` (#130)`;
    slaagt(repo([gedeeld, 'Toelichting.'], [S1, S2]), { gebouwd: [S1, S2], bronRoadmap: [klaar, 'Toelichting.'] });
  });

  test('een tweede open item dat ook S2 noemt: slaagt (geen eenduidigheidscontrole meer)', () => {
    const gedeeld = `- [ ] Gedeelde taak \`${S1}\` en \`${S2}\``;
    const klaar = `- [x] Gedeelde taak \`${S1}\` en \`${S2}\` (#130)`;
    const tweede = openItem(S2, 'Tweede taak voor');
    slaagt(repo([gedeeld, tweede, 'Toelichting.'], [S1, S2]), {
      gebouwd: [S1, S2],
      bronRoadmap: [klaar, tweede, 'Toelichting.'],
    });
  });
});

describe('AC-22: bewijs op een nieuwe, ingesprongen vervolgregel', () => {
  test.each([
    ['broncommit', 'bronRoadmap'],
    ['administratiecommit', 'adminRoadmap'],
  ] as const)('slaagt in check-document-status en check:roadmap (%s)', async (_naam, waar) => {
    const fixture = repo(basisRoadmap());
    const roadmap = basisRoadmap().map((regel) =>
      regel === openItem(S1) ? `- [x] Taak voor \`${S1}\`\n  (#130)` : regel,
    );
    const { head } = bouw(fixture, { gebouwd: [S1], [waar]: roadmap });
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
    expect(await roadmapSleutels(fixture.root)).toStrictEqual([]);
  });
});

describe('AC-25 (OV-9, AC-14: geen mandaatscope meer): het vinkje is niet meer aan de statusovergang gebonden', () => {
  test('vinkje terwijl S goedgekeurd blijft: slaagt (geen mandaatscope meer)', () => {
    slaagt(repo(basisRoadmap()), { gebouwd: [], bronRoadmap: metTick(basisRoadmap(), S1) });
  });

  test('vinkje in een eerdere commit, status in een latere commit van dezelfde PR: slaagt', () => {
    slaagt(repo(basisRoadmap()), { gebouwd: [S1], bronRoadmap: metTick(basisRoadmap(), S1) });
  });

  test('records voor S1 en S2, alleen S1 gaat naar gebouwd, beide items afgevinkt: slaagt (geen mandaatscope meer)', () => {
    const beide = metTick(metTick(basisRoadmap(), S1), S2);
    slaagt(repo(basisRoadmap(), [S1, S2]), { gebouwd: [S1], bronRoadmap: beide });
  });
});

describe('zonder actief mandaat (AC-7, regressie)', () => {
  test('een besluit voor een andere branch: een vinkje valt niet onder de mandaatcontrole', () => {
    const fixture = maakRepo({
      specs: [S1],
      mandaat: [S1],
      roadmap: basisRoadmap(),
      besluitBranch: 'feat/elders',
    });
    const { head } = bouw(fixture, { gebouwd: [], bronRoadmap: metTick(basisRoadmap(), S1) });
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });
});
