import { execFileSync } from 'node:child_process';
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

function slaagt(fixture: Fixture, head: string): string {
  const uitvoer = draaiChecker(fixture, head);
  expect(uitvoer.stderr).toBe('');
  expect(uitvoer.status).toBe(0);
  return uitvoer.stdout;
}

function faalt(fixture: Fixture, head: string): string {
  const uitvoer = draaiChecker(fixture, head);
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
    const stdout = slaagt(fixture, agent(fixture));
    expect(stdout).toContain(ADR_OUD);
    expect(stdout).toContain('besluit-PR');
  });

  test('G1 herzien ADR samen met een nieuw ADR, zonder code: slaagt en noemt alle bestanden', () => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd') });
    herschrijf(fixture.root, ADR_OUD, '0050');
    write(fixture.root, ADR_NIEUW, adrTekst('0051', 'geaccepteerd'));
    const stdout = slaagt(fixture, agent(fixture));
    expect(stdout).toContain(ADR_OUD);
    expect(stdout).toContain(ADR_NIEUW);
  });

  test('G1 geaccepteerd ADR met andere inhoud maar zonder herzieningsregel: faalt met de A4-melding', () => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd') });
    write(fixture.root, ADR_OUD, adrTekst('0050', 'geaccepteerd', 'Iets anders.'));
    expect(faalt(fixture, agent(fixture))).toMatch(A4);
  });

  test.each([
    ['een bronbestand in src/web', WEB],
    ['docs/roadmap.md', 'docs/roadmap.md'],
    ['CHANGELOG.md', 'CHANGELOG.md'],
  ])('G1 herzien ADR met %s in dezelfde PR: faalt, geen herkende lane', (_naam, pad) => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd') });
    herschrijf(fixture.root, ADR_OUD, '0050');
    write(fixture.root, pad, 'export const x = 1;\n');
    const stderr = faalt(fixture, agent(fixture));
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
    expect(faalt(fixture, agent(fixture))).toContain('geen herkende lane');
  });

  test('G1 herzien ADR naast een nieuwe spec zonder code is een besluit-PR: slaagt', () => {
    const fixture = metBasis({ [ADR_OUD]: adrTekst('0050', 'geaccepteerd') });
    herschrijf(fixture.root, ADR_OUD, '0050');
    write(fixture.root, 'docs/specs/demo.md', `---\nstatus: goedgekeurd\nnamespace: demo\n---\n\n# Demo\n`);
    expect(slaagt(fixture, agent(fixture))).toContain(ADR_OUD);
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
