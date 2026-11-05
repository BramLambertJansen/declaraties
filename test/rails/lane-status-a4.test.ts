import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { draaiChecker, git, maakRepo, opruimen, write, type Fixture } from '../hooks/follow-up-kit';

// A4 in een besluit-PR (ADR 0046 punt 2, eigenaarbesluit 2026-10-22), guard `scripts/kit/check-document-status.mjs`:
// een geaccepteerd ADR mag worden herschreven met een herzieningsregel en een ADR met een eigenaarstatus mag worden
// verwijderd, maar alleen in een besluit-PR (framework-lane: alleen docs/adr, docs/specs en het record). Echte tijdelijke
// repositories; de checker draait zoals guard.yml hem draait, met main als basis.
afterEach(opruimen);

const ADR_OUD = 'docs/adr/0050-oud.md';
const ADR_NIEUW = 'docs/adr/0051-nieuw.md';
const ADR_VERVANGER = 'docs/adr/0052-vervanger.md';
const WEB = 'src/web/features/demo/page.tsx';
const HERZIEN = 'Herzien: 2026-10-22 (#262): tekst aangepast.';
const A4 = /A4/;
/** Het PR-nummer uit HERZIEN, zoals guard.yml het als PR_NUMBER meegeeft (G5). */
const PR262 = { PR_NUMBER: '262' };

const adrTekst = (nr: string, status: string, besluit = 'Iets.'): string =>
  `# ${nr} — Demo\n\nStatus: ${status}\n\n## Besluit\n\n${besluit}\n`;

/** Een lange, onderscheidende tekst, zodat een verwijderd en een nieuw bestand nooit als rename gelden. */
const uniek = (prefix: string): string =>
  Array.from(
    { length: 12 },
    (_regel, index) => `${prefix} regel ${String(index)} met eigen woorden ${prefix}${String(index * 7)}.`,
  ).join('\n');

function commitAgent(root: string, message: string): string {
  git(root, ['add', '-A']);
  execFileSync('git', ['commit', '-q', '-m', message], {
    cwd: root,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.test',
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.test',
    },
  });
  return git(root, ['rev-parse', 'HEAD']);
}

/** main krijgt deze bestanden; de branch start daarop (origin/main = HEAD). */
function metBasis(bestanden: Record<string, string>): Fixture {
  const fixture = maakRepo({ specs: [], mandaat: [], roadmap: [] });
  for (const [pad, tekst] of Object.entries(bestanden)) write(fixture.root, pad, tekst);
  commitAgent(fixture.root, 'chore: basis');
  const base = git(fixture.root, ['rev-parse', 'HEAD']);
  git(fixture.root, ['update-ref', 'refs/remotes/origin/main', base]);
  return { root: fixture.root, base };
}

const agent = (fixture: Fixture, bericht = 'docs: besluit'): string => commitAgent(fixture.root, bericht);

function slaagt(fixture: Fixture, head: string, extra: Record<string, string> = {}): string {
  const uitvoer = draaiChecker(fixture, head, extra);
  expect(uitvoer.stderr).toBe('');
  expect(uitvoer.status).toBe(0);
  return uitvoer.stdout;
}

function faalt(fixture: Fixture, head: string, extra: Record<string, string> = {}): string {
  const uitvoer = draaiChecker(fixture, head, extra);
  expect(uitvoer.status).toBe(1);
  expect(uitvoer.stderr).not.toBe('');
  return uitvoer.stderr;
}

function herschrijf(root: string, file: string, nr: string): void {
  write(root, file, adrTekst(nr, 'geaccepteerd', `Iets anders.\n\n${HERZIEN}`));
}

describe('G1: een herzien ADR is een besluit zonder record', () => {
  test('G1 geaccepteerd ADR herschreven met een herzieningsregel, alleen docs/adr: slaagt en noemt het bestand', () => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd') });
    herschrijf(fixture.root, ADR_OUD, '0050');
    const stdout = slaagt(fixture, agent(fixture), PR262);
    expect(stdout).toContain(ADR_OUD);
    expect(stdout).toContain('besluit-PR');
  });

  test('G1 herzien ADR samen met een nieuw ADR, zonder code: slaagt en noemt alle bestanden', () => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd') });
    herschrijf(fixture.root, ADR_OUD, '0050');
    write(fixture.root, ADR_NIEUW, adrTekst('0051', 'geaccepteerd'));
    const stdout = slaagt(fixture, agent(fixture), PR262);
    expect(stdout).toContain(ADR_OUD);
    expect(stdout).toContain(ADR_NIEUW);
  });

  test('G1 geaccepteerd ADR met andere inhoud maar zonder herzieningsregel: faalt met de A4-melding', () => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd') });
    write(fixture.root, ADR_OUD, adrTekst('0050', 'geaccepteerd', 'Iets anders.'));
    expect(faalt(fixture, agent(fixture), PR262)).toMatch(A4);
  });

  test.each([
    ['een bronbestand in src/web', WEB],
    ['docs/roadmap.md', 'docs/roadmap.md'],
    ['CHANGELOG.md', 'CHANGELOG.md'],
  ])('G1 herzien ADR met %s in dezelfde PR: faalt, geen herkende lane', (_naam, pad) => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd') });
    herschrijf(fixture.root, ADR_OUD, '0050');
    write(fixture.root, pad, 'export const x = 1;\n');
    const stderr = faalt(fixture, agent(fixture), PR262);
    expect(stderr).toContain(ADR_OUD);
    expect(stderr).toContain('geen herkende lane');
  });

  test('G1 herzien ADR maakt de feature-lane nooit mogelijk: een herzien ADR naast een nieuwe mini-spec met code faalt', () => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd') });
    herschrijf(fixture.root, ADR_OUD, '0050');
    write(
      fixture.root,
      'docs/specs/demo.md',
      `---\nstatus: goedgekeurd\nnamespace: demo\nsjabloon: mini\n---\n\n# Demo\n`,
    );
    write(fixture.root, WEB, 'export const x = 1;\n');
    expect(faalt(fixture, agent(fixture), PR262)).toContain('geen herkende lane');
  });

  test('G1 herzien ADR naast een nieuwe spec zonder code is een besluit-PR: slaagt', () => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd') });
    herschrijf(fixture.root, ADR_OUD, '0050');
    write(fixture.root, 'docs/specs/demo.md', `---\nstatus: goedgekeurd\nnamespace: demo\n---\n\n# Demo\n`);
    expect(slaagt(fixture, agent(fixture), PR262)).toContain(ADR_OUD);
  });
});

describe('G2: een ADR met een eigenaarstatus verwijderen in een besluit-PR', () => {
  const eigenaarstatussen = [['geaccepteerd'], ['vervallen'], ['vervangen door 0051']] as const;

  test.each(eigenaarstatussen)(
    'G2 een PR die alleen een ADR met Status: %s verwijdert: slaagt en noemt het bestand',
    (status) => {
      const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', status), [ADR_NIEUW]: adrTekst('0051', 'geaccepteerd') });
      git(fixture.root, ['rm', '-q', ADR_OUD]);
      expect(slaagt(fixture, agent(fixture))).toContain(ADR_OUD);
    },
  );

  test('G2 verwijderen naast een nieuw ADR met eigenaarstatus: slaagt en noemt beide bestanden', () => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd', uniek('alfa')) });
    git(fixture.root, ['rm', '-q', ADR_OUD]);
    write(fixture.root, ADR_VERVANGER, adrTekst('0052', 'geaccepteerd', uniek('beta')));
    const stdout = slaagt(fixture, agent(fixture));
    expect(stdout).toContain(ADR_OUD);
    expect(stdout).toContain(ADR_VERVANGER);
  });

  test.each([
    ['code in src/web', WEB],
    ['een test', 'src/api/routes/demo.test.ts'],
    ['docs/roadmap.md', 'docs/roadmap.md'],
    ['CHANGELOG.md', 'CHANGELOG.md'],
    ['een script', 'scripts/kit/extra.mjs'],
  ])('G2 verwijderen met %s in dezelfde PR: faalt met de A4-melding', (_naam, pad) => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd') });
    git(fixture.root, ['rm', '-q', ADR_OUD]);
    write(fixture.root, pad, 'export const x = 1;\n');
    const stderr = faalt(fixture, agent(fixture));
    expect(stderr).toMatch(A4);
    expect(stderr).toContain(ADR_OUD);
  });

  test('G2 verwijderen met een niet-ADR-document onder docs/ in dezelfde PR: faalt met de A4-melding', () => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'vervallen') });
    git(fixture.root, ['rm', '-q', ADR_OUD]);
    write(fixture.root, 'docs/framework.md', 'Aangepast.\n');
    expect(faalt(fixture, agent(fixture))).toMatch(A4);
  });
});

describe('G3: een rename van een ADR met eigenaarstatus blijft geweigerd', () => {
  test.each([['geaccepteerd'], ['vervallen'], ['vervangen door 0051']])(
    'G3 rename van een ADR met Status: %s in een besluit-PR: faalt',
    (status) => {
      const text = adrTekst('0050', status, uniek('gamma'));
      const fixture = metBasis({ [ADR_OUD]: text, [ADR_NIEUW]: adrTekst('0051', 'geaccepteerd') });
      git(fixture.root, ['mv', ADR_OUD, 'docs/adr/0060-hernoemd.md']);
      expect(faalt(fixture, agent(fixture))).not.toBe('');
    },
  );
});

describe('G3: verwijderen naast toevoegen met hetzelfde ADR-nummer is een rename-omweg', () => {
  test.each([['geaccepteerd'], ['vervallen'], ['vervangen door 0051']])(
    'G3 D + A met hetzelfde nummer, verwijderd ADR met Status: %s, in een besluit-PR: faalt met A4',
    (status) => {
      const fixture = metBasis({
        'docs/adr/0017-a.md': adrTekst('0017', status, uniek('alfa')),
        [ADR_NIEUW]: adrTekst('0051', 'geaccepteerd'),
      });
      git(fixture.root, ['rm', '-q', 'docs/adr/0017-a.md']);
      write(fixture.root, 'docs/adr/0017-b.md', adrTekst('0017', 'geaccepteerd', uniek('beta')));
      expect(faalt(fixture, agent(fixture))).toMatch(A4);
    },
  );

  test('G3 D van 0017-a naast A van een ADR met een ander nummer, in een besluit-PR: slaagt', () => {
    const fixture = metBasis({ 'docs/adr/0017-a.md': adrTekst('0017', 'geaccepteerd', uniek('alfa')) });
    git(fixture.root, ['rm', '-q', 'docs/adr/0017-a.md']);
    write(fixture.root, ADR_VERVANGER, adrTekst('0052', 'geaccepteerd', uniek('beta')));
    slaagt(fixture, agent(fixture));
  });
});

describe('G4: een voorgesteld ADR verwijderen blijft vrij', () => {
  test('G4 een voorgesteld ADR verwijderen: slaagt', () => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'voorgesteld') });
    git(fixture.root, ['rm', '-q', ADR_OUD]);
    slaagt(fixture, agent(fixture));
  });

  test('G4 een voorgesteld ADR verwijderen naast code: slaagt (geen besluit, geen A4)', () => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'voorgesteld') });
    git(fixture.root, ['rm', '-q', ADR_OUD]);
    write(fixture.root, WEB, 'export const x = 1;\n');
    slaagt(fixture, agent(fixture));
  });
});

describe('G5: elke nieuwe herzieningsregel draagt het PR-nummer uit de omgeving', () => {
  const basis = () => metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd') });

  test('G5 regel (#262) en PR_NUMBER=262: slaagt', () => {
    const fixture = basis();
    herschrijf(fixture.root, ADR_OUD, '0050');
    slaagt(fixture, agent(fixture), PR262);
  });

  test('G5 regel (#262) en PR_NUMBER=263: faalt met de A4-melding en noemt het verwachte nummer', () => {
    const fixture = basis();
    herschrijf(fixture.root, ADR_OUD, '0050');
    const stderr = faalt(fixture, agent(fixture), { PR_NUMBER: '263' });
    expect(stderr).toMatch(A4);
    expect(stderr).toContain('263');
  });

  test.each([['0'], ['-5'], ['abc'], ['26.2'], ['']])(
    'G5 PR_NUMBER=%j is geen positief geheel getal: faalt (dicht)',
    (waarde) => {
      const fixture = basis();
      herschrijf(fixture.root, ADR_OUD, '0050');
      expect(faalt(fixture, agent(fixture), { PR_NUMBER: waarde })).toContain('geen geldig PR_NUMBER');
    },
  );

  test('G5 PR_NUMBER ontbreekt: een herzien ADR faalt (dicht) met geen geldig PR_NUMBER', () => {
    const fixture = basis();
    herschrijf(fixture.root, ADR_OUD, '0050');
    expect(faalt(fixture, agent(fixture))).toContain('geen geldig PR_NUMBER');
  });

  test('G5 het nummer telt alleen uit de vaste plek na de datum: (#1) op die plek en (#262) in de omschrijving faalt', () => {
    const fixture = basis();
    write(
      fixture.root,
      ADR_OUD,
      adrTekst('0050', 'geaccepteerd', 'Iets anders.\n\nHerzien: 2026-10-22 (#1): zie (#262): x'),
    );
    expect(faalt(fixture, agent(fixture), PR262)).toMatch(A4);
  });

  test('G5 een bestaande oude regel met een ander PR-nummer blijft geldig naast een nieuwe regel met het juiste nummer', () => {
    const oud = 'Herzien: 2026-09-01 (#200): eerste herziening.';
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd', `Iets.\n\n${oud}`) });
    write(fixture.root, ADR_OUD, adrTekst('0050', 'geaccepteerd', `Iets anders.\n\n${oud}\n\n${HERZIEN}`));
    slaagt(fixture, agent(fixture), PR262);
  });

  test('G5 de nieuwe regel draagt een ander nummer dan de oude regel én dan PR_NUMBER: faalt', () => {
    const oud = 'Herzien: 2026-09-01 (#200): eerste herziening.';
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd', `Iets.\n\n${oud}`) });
    write(
      fixture.root,
      ADR_OUD,
      adrTekst('0050', 'geaccepteerd', `Iets anders.\n\n${oud}\n\nHerzien: 2026-10-22 (#201): tekst.`),
    );
    expect(faalt(fixture, agent(fixture), PR262)).toMatch(A4);
  });
});

/** main krijgt `behouden`; `verwijderd` staat eerst op main en wordt in een latere basiscommit verwijderd. */
function metGeschiedenis(behouden: Record<string, string>, verwijderd: Record<string, string>): Fixture {
  const fixture = maakRepo({ specs: [], mandaat: [], roadmap: [] });
  for (const [pad, tekst] of Object.entries({ ...behouden, ...verwijderd })) write(fixture.root, pad, tekst);
  commitAgent(fixture.root, 'chore: basis met ADR');
  for (const pad of Object.keys(verwijderd)) git(fixture.root, ['rm', '-q', pad]);
  commitAgent(fixture.root, 'docs: ADR verwijderd');
  const base = git(fixture.root, ['rev-parse', 'HEAD']);
  git(fixture.root, ['update-ref', 'refs/remotes/origin/main', base]);
  return { root: fixture.root, base };
}

describe('G6: een ADR-nummer dat ooit bestond en is verwijderd, wordt niet hergebruikt', () => {
  const GEBRUIKT = 'docs/adr/0070-oud-besluit.md';
  const basis = () =>
    metGeschiedenis({ [ADR_OUD]: adrTekst('0050', 'voorgesteld') }, { [GEBRUIKT]: adrTekst('0070', 'geaccepteerd') });

  test.each([['geaccepteerd'], ['voorgesteld']])(
    'G6 een toegevoegd ADR (status A) met Status: %s en het verwijderde nummer 0070: faalt, nummer 0070 is al gebruikt',
    (status) => {
      const fixture = basis();
      write(fixture.root, 'docs/adr/0070-andere-titel.md', adrTekst('0070', status, 'Heel iets anders.'));
      expect(faalt(fixture, agent(fixture))).toMatch(/nummer 0070 is al gebruikt/);
    },
  );

  test('G6 het doel van een rename met het verwijderde nummer 0070: faalt, nummer 0070 is al gebruikt', () => {
    const fixture = metGeschiedenis(
      { [ADR_OUD]: adrTekst('0050', 'voorgesteld', uniek('delta')) },
      { [GEBRUIKT]: adrTekst('0070', 'geaccepteerd') },
    );
    git(fixture.root, ['mv', ADR_OUD, 'docs/adr/0070-hernoemd.md']);
    expect(faalt(fixture, agent(fixture))).toMatch(/nummer 0070 is al gebruikt/);
  });

  test('G6 een nieuw nummer dat nooit bestond: slaagt', () => {
    const fixture = basis();
    write(fixture.root, 'docs/adr/0071-nieuw.md', adrTekst('0071', 'geaccepteerd'));
    slaagt(fixture, agent(fixture));
  });
});

describe('G7: een ADR met een eigenaarstatus mag niet naar een verwijderd ADR blijven verwijzen', () => {
  const DOEL = 'docs/adr/0060-doel.md';
  const VERWIJZER = 'docs/adr/0061-verwijzer.md';
  const ANDER = 'docs/adr/0062-ander.md';
  const basis = () =>
    metBasis({
      [DOEL]: adrTekst('0060', 'geaccepteerd', uniek('doel')),
      [VERWIJZER]: adrTekst('0061', 'vervangen door 0060', uniek('verwijzer')),
      [ANDER]: adrTekst('0062', 'geaccepteerd', uniek('ander')),
    });

  test('G7 het doel wordt verwijderd, de verwijzer blijft: faalt en noemt het ADR met de losse verwijzing', () => {
    const fixture = basis();
    git(fixture.root, ['rm', '-q', DOEL]);
    const stderr = faalt(fixture, agent(fixture));
    expect(stderr).toContain(VERWIJZER);
    expect(stderr).toContain('0060');
  });

  test('G7 het doel heeft status voorgesteld en wordt als enige verwijderd, de verwijzer blijft: faalt en noemt de verwijzer', () => {
    const fixture = metBasis({
      [DOEL]: adrTekst('0060', 'voorgesteld', uniek('doel')),
      [VERWIJZER]: adrTekst('0061', 'vervangen door 0060', uniek('verwijzer')),
    });
    git(fixture.root, ['rm', '-q', DOEL]);
    const stderr = faalt(fixture, agent(fixture));
    expect(stderr).toContain(VERWIJZER);
    expect(stderr).toContain('0060');
  });

  test('G7 het doel (voorgesteld) wordt hernoemd naar een ander nummer, de verwijzer blijft naar 0060 wijzen: faalt en noemt de verwijzer', () => {
    const fixture = metBasis({
      [DOEL]: adrTekst('0060', 'voorgesteld', uniek('doel')),
      [VERWIJZER]: adrTekst('0061', 'vervangen door 0060', uniek('verwijzer')),
    });
    git(fixture.root, ['mv', DOEL, 'docs/adr/0066-hernoemd.md']);
    expect(faalt(fixture, agent(fixture))).toContain(VERWIJZER);
  });

  test('G7 het doel (voorgesteld) wordt hernoemd met hetzelfde nummer 0060: slaagt (het nummer bestaat nog)', () => {
    const fixture = metBasis({
      [DOEL]: adrTekst('0060', 'voorgesteld', uniek('doel')),
      [VERWIJZER]: adrTekst('0061', 'vervangen door 0060', uniek('verwijzer')),
    });
    git(fixture.root, ['mv', DOEL, 'docs/adr/0060-andere-naam.md']);
    slaagt(fixture, agent(fixture));
  });

  test('G7 verwijzer en doel worden samen verwijderd: slaagt', () => {
    const fixture = basis();
    git(fixture.root, ['rm', '-q', DOEL, VERWIJZER]);
    slaagt(fixture, agent(fixture));
  });

  test('G7 een ander ADR wordt verwijderd, het doel van de verwijzer blijft: slaagt', () => {
    const fixture = basis();
    git(fixture.root, ['rm', '-q', ANDER]);
    slaagt(fixture, agent(fixture));
  });
});

describe('G8: G6 en G7 houden rekening met docs/adr/archief/ (ADR 0053)', () => {
  const DOEL = 'docs/adr/0060-doel.md';
  const DOEL_ARCHIEF = 'docs/adr/archief/0060-doel.md';
  const VERWIJZER = 'docs/adr/0061-verwijzer.md';
  const VERWIJZER_ARCHIEF = 'docs/adr/archief/0061-verwijzer.md';
  const ANDER = 'docs/adr/0062-ander.md';

  test('G8a het doel (voorgesteld) verhuist naar archief/ met hetzelfde nummer 0060, de verwijzer blijft: slaagt', () => {
    const fixture = metBasis({
      [DOEL]: adrTekst('0060', 'vervallen', uniek('doel')),
      [VERWIJZER]: adrTekst('0061', 'vervangen door 0060', uniek('verwijzer')),
    });
    mkdirSync(join(fixture.root, 'docs/adr/archief'), { recursive: true });
    git(fixture.root, ['mv', DOEL, DOEL_ARCHIEF]);
    slaagt(fixture, agent(fixture));
  });

  test('G8a het doel staat al in archief/ en een ander (voorgesteld) ADR wordt verwijderd, de verwijzer blijft: slaagt', () => {
    const fixture = metBasis({
      [DOEL_ARCHIEF]: adrTekst('0060', 'geaccepteerd', uniek('doel')),
      [VERWIJZER]: adrTekst('0061', 'vervangen door 0060', uniek('verwijzer')),
      [ANDER]: adrTekst('0062', 'voorgesteld', uniek('ander')),
    });
    git(fixture.root, ['rm', '-q', ANDER]);
    slaagt(fixture, agent(fixture));
  });

  test('G8b een gearchiveerd ADR met vervangen door 0060 blijft staan terwijl ADR 0060 verdwijnt: faalt en noemt het archiefpad', () => {
    const fixture = metBasis({
      [DOEL]: adrTekst('0060', 'voorgesteld', uniek('doel')),
      [VERWIJZER_ARCHIEF]: adrTekst('0061', 'vervangen door 0060', uniek('verwijzer')),
    });
    git(fixture.root, ['rm', '-q', DOEL]);
    const stderr = faalt(fixture, agent(fixture));
    expect(stderr).toContain(VERWIJZER_ARCHIEF);
    expect(stderr).toContain('0060');
  });

  test('G8c een nummer dat op de basis alleen nog in archief/ bestaat (verhuisd) wordt niet hergebruikt: faalt, nummer 0070 is al gebruikt', () => {
    const fixture = metGeschiedenis(
      {
        [ADR_OUD]: adrTekst('0050', 'voorgesteld'),
        'docs/adr/archief/0070-oud-besluit.md': adrTekst('0070', 'geaccepteerd'),
      },
      { 'docs/adr/0070-oud-besluit.md': adrTekst('0070', 'geaccepteerd') },
    );
    write(fixture.root, 'docs/adr/0070-nieuw.md', adrTekst('0070', 'voorgesteld', 'Heel iets anders.'));
    expect(faalt(fixture, agent(fixture))).toMatch(/nummer 0070 is al gebruikt/);
  });
});
