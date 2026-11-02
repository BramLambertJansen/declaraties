import { afterEach, describe, expect, test } from 'vitest';
import { S1, SOURCE, basisRoadmap, bouw, commit, draaiChecker, maakRepo, opruimen, read, write } from './follow-up-kit';

// Review van ADR 0046: een `--path`-record (mandaat) van een spec vervalt zodra de inhoud van die spec in de PR wijzigt
// (punt 9, 0027 punt 2), en een `gebouwd`-overgang met bouwbewijs blijft werken in de nieuwe route. Echte tijdelijke
// repositories met een register op main, zoals mandate-follow-up-ci.test.ts.
afterEach(opruimen);

const repo = (mandaat: string[]) => maakRepo({ specs: [S1], mandaat, roadmap: basisRoadmap() });

// GEWIJZIGD (compacte-kennisbasis-rails/AC-14 en AC-15, PR 6b): een record geeft niets meer, dus ook geen mandaat dat vervalt.
describe('record en inhoudswijziging van de spec', () => {
  // GEWIJZIGD (spec-en-bouw/AC-7, ADR 0062): de spec-commit staat vóór de bron, zodat de weigering op het vervallen mandaat
  // berust en niet op de volgordecheck.
  // AC-15: record geeft niets meer; met of zonder record dezelfde uitslag.
  test.each([[[S1]], [[]]])('inhoud van de spec en een bronbestand in dezelfde PR, record %j: slaagt', (mandaat) => {
    const fixture = repo(mandaat);
    write(fixture.root, S1, `${read(fixture.root, S1)}\nNieuw gedrag.\n`);
    commit(fixture.root, 'docs: spec');
    write(fixture.root, SOURCE, 'export const version = 2;\n');
    const uitvoer = draaiChecker(fixture, commit(fixture.root, 'feat: spec en bron'));
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test('controle: zonder inhoudswijziging van de spec slaagt een bronbestand bij een record op main', () => {
    const fixture = repo([S1]);
    write(fixture.root, SOURCE, 'export const version = 2;\n');
    const uitvoer = draaiChecker(fixture, commit(fixture.root, 'feat: alleen bron'));
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test('alleen de inhoud van de gemandateerde spec wijzigt (besluit-PR zonder code): slaagt', () => {
    const fixture = repo([S1]);
    write(fixture.root, S1, `${read(fixture.root, S1)}\nNieuw gedrag.\n`);
    const uitvoer = draaiChecker(fixture, commit(fixture.root, 'docs: spec'));
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });
});

describe('gebouwd met bouwbewijs in de nieuwe route (regressie)', () => {
  test.each([
    ['met een mandaat', [S1]],
    ['zonder mandaat', []],
  ])('een spec naar gebouwd met geldig bewijs, %s: slaagt', (_naam, mandaat) => {
    const fixture = repo(mandaat);
    const { head } = bouw(fixture, { gebouwd: [S1] });
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test('gebouwd zonder passend bewijs (andere SHA in de regel): faalt', () => {
    const fixture = repo([S1]);
    bouw(fixture, { gebouwd: [S1] });
    write(
      fixture.root,
      S1,
      read(fixture.root, S1).replace(/gevalideerd: [0-9a-f]{40}/, `gevalideerd: ${'b'.repeat(40)}`),
    );
    const uitvoer = draaiChecker(fixture, commit(fixture.root, 'docs: ander bewijs'));
    expect(uitvoer.status).toBe(1);
  });
});
