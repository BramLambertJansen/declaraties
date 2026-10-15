import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// check:roadmap, structuurregels (opdracht stap 4, ADR 0029 P1 en P7): hooguit 3 open items onder `## Nu`, `terug als:` bij elk
// geparkeerd item, geen gedateerd statusproza, `aanleiding:` met verwijzing bij een nieuw open item onder Nu/Volgende, en de
// vereiste koppen. De regels gelden alleen als de head-roadmap `## Nu` heeft; verdwijnt die kop, dan is dat een fout.
// Zelfde opzet als check-roadmap.test.ts: fixtures als data in fixtures/roadmap/<geval>/{basis,head}/, module pas in de test geladen.
const REPO = path.resolve(import.meta.dirname, '../..');
const FIXTURES = path.join(import.meta.dirname, 'fixtures/roadmap');
const ROADMAP_MODULE = ['../../scripts/kit', 'check-roadmap.mjs'].join('/');

interface Melding {
  key: string;
  message: string;
}

async function roadmapMeldingenFunctie(): Promise<unknown> {
  const geladen: unknown = await import(/* @vite-ignore */ ROADMAP_MODULE);
  if (typeof geladen !== 'object' || geladen === null || !('roadmapMeldingen' in geladen))
    throw new Error('check-roadmap.mjs exporteert roadmapMeldingen niet');
  const waarde: unknown = Reflect.get(geladen, 'roadmapMeldingen');
  return waarde;
}

function alsMeldingen(resultaat: unknown): Melding[] {
  if (!Array.isArray(resultaat)) throw new Error('geen lijst van meldingen');
  const lijst: unknown[] = resultaat;
  return lijst.map((item) => {
    if (
      typeof item === 'object' &&
      item !== null &&
      'key' in item &&
      typeof item.key === 'string' &&
      'message' in item &&
      typeof item.message === 'string'
    )
      return { key: item.key, message: item.message };
    throw new Error('geen { key, message }');
  });
}

function leesMap(dir: string): { lees: (pad: string) => string | null; bestanden: string[] } {
  const bestanden = existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
        .sort()
    : [];
  return {
    bestanden,
    lees: (pad) => (bestanden.includes(pad) ? readFileSync(path.join(dir, pad), 'utf8') : null),
  };
}

function leesTestpaden(): string[] {
  const json: unknown = JSON.parse(readFileSync(path.join(REPO, '.claude/gates.json'), 'utf8'));
  if (typeof json !== 'object' || json === null || !('testpaden' in json) || !Array.isArray(json.testpaden))
    throw new Error('gates.json zonder testpaden');
  const lijst: unknown[] = json.testpaden;
  return lijst.map(String);
}

async function meldingenVoor(geval: string): Promise<Melding[]> {
  const functie = await roadmapMeldingenFunctie();
  if (typeof functie !== 'function') throw new Error('roadmapMeldingen is geen functie');
  const basis = leesMap(path.join(FIXTURES, geval, 'basis'));
  const head = { ...leesMap(path.join(FIXTURES, geval, 'head')), hernoemd: {} };
  const resultaat: unknown = await Reflect.apply(functie, undefined, [
    { basis, head, scripts: {}, testpaden: leesTestpaden() },
  ]);
  return alsMeldingen(resultaat);
}

const GEEN: string[] = [];
// [fixture, regel van de spec, verwachte foutsleutels]. De sleutels zijn het voorstel voor de developer:
//   roadmap:nu-open                 R1 (meer dan 3 open items onder ## Nu)
//   roadmap:geparkeerd:<regel>      R2 (item onder ## Geparkeerd zonder `terug als:` met tekst)
//   roadmap:stand:<regel>           R3 (gedateerd statusproza)
//   roadmap:aanleiding:<regel>      R4 (nieuw open item onder Nu/Volgende zonder aanleiding met verwijzing)
//   roadmap:kop:<naam>              ontbrekende vereiste kop (Nu, Volgende, Geparkeerd, Besluiten)
//   roadmap:structuur               basis had ## Nu, head niet ("structuur verwijderd")
// <regel> is het regelnummer (1-gebaseerd) van het item of de proza-regel in de head-roadmap.
const matrix: [geval: string, regel: string, verwacht: string[]][] = [
  ['structuur-schoon', 'R1 (afgevinkte items tellen niet) + R2 vervolgregel + R3 geen datum', GEEN],
  ['structuur-nieuw-ingevoerd', 'activering: basis zonder structuur, bestaande items', GEEN],
  ['nu-te-veel-open', 'R1', ['roadmap:nu-open']],
  ['geparkeerd-zonder-terug-als', 'R2', ['roadmap:geparkeerd:14']],
  ['geparkeerd-terug-als-leeg', 'R2 (lege tekst na terug als:)', ['roadmap:geparkeerd:14']],
  ['stand-proza', 'R3', ['roadmap:stand:5']],
  ['stand-proza-kleine-letters', 'R3 (hoofdletterongevoelig)', ['roadmap:stand:5']],
  ['nieuw-item-zonder-aanleiding', 'R4 (Volgende)', ['roadmap:aanleiding:10']],
  ['nieuw-item-in-nu-zonder-aanleiding', 'R4 (Nu)', ['roadmap:aanleiding:6']],
  ['nieuw-item-aanleiding-zonder-verwijzing', 'R4 (aanleiding zonder #, pad of meting)', ['roadmap:aanleiding:10']],
  ['nieuw-item-aanleiding-pad-bestaat-niet', 'R4 (pad bestaat niet in head)', ['roadmap:aanleiding:10']],
  ['nieuw-item-aanleiding-pr', 'R4 (#nummer)', GEEN],
  ['nieuw-item-aanleiding-meting', 'R4 (woord meting)', GEEN],
  ['nieuw-item-aanleiding-vervolgregel', 'R4 (aanleiding op vervolgregel)', GEEN],
  ['nieuw-item-aanleiding-pad', 'R4 (bestaand pad tussen backticks)', GEEN],
  ['nieuw-item-geparkeerd-geen-aanleiding-nodig', 'R4 geldt niet onder Geparkeerd', GEEN],
  ['verplaatst-item-geen-aanleiding-nodig', 'R4 geldt niet voor bestaande, verplaatste items', GEEN],
  ['structuur-verwijderd', 'basis had ## Nu, head niet', ['roadmap:structuur']],
  ['kop-ontbreekt', 'vereiste kop Besluiten ontbreekt', ['roadmap:kop:Besluiten']],
  ['kop-ontbreekt-geparkeerd', 'vereiste kop Geparkeerd ontbreekt', ['roadmap:kop:Geparkeerd']],
];

describe('roadmapMeldingen: structuurregels', () => {
  test.each(matrix)('%s (%s)', async (geval, _regel, verwacht) => {
    expect((await meldingenVoor(geval)).map((melding) => melding.key)).toStrictEqual(verwacht);
  });
});

describe('roadmapMeldingen: structuur, meldteksten', () => {
  test('te veel open items noemt het maximum en het aantal', async () => {
    const [melding] = await meldingenVoor('nu-te-veel-open');
    expect(melding?.message).toContain('docs/roadmap.md');
    expect(melding?.message).toMatch(/\b3\b.*\b4\b|\b4\b.*\b3\b/);
  });

  test('geparkeerd item noemt regel en "terug als:"', async () => {
    const [melding] = await meldingenVoor('geparkeerd-zonder-terug-als');
    expect(melding?.message).toContain('docs/roadmap.md:14');
    expect(melding?.message).toContain('terug als:');
  });

  test('statusproza noemt regel en "Stand"', async () => {
    const [melding] = await meldingenVoor('stand-proza');
    expect(melding?.message).toContain('docs/roadmap.md:5');
    expect(melding?.message).toMatch(/stand/i);
  });

  test('nieuw item zonder aanleiding noemt regel en "aanleiding:"', async () => {
    const [melding] = await meldingenVoor('nieuw-item-zonder-aanleiding');
    expect(melding?.message).toContain('docs/roadmap.md:10');
    expect(melding?.message).toContain('aanleiding:');
  });

  test('ontbrekende kop noemt de kop', async () => {
    const [melding] = await meldingenVoor('kop-ontbreekt');
    expect(melding?.message).toContain('## Besluiten');
  });

  test('verwijderde structuur noemt "structuur verwijderd"', async () => {
    const [melding] = await meldingenVoor('structuur-verwijderd');
    expect(melding?.message).toContain('structuur verwijderd');
  });
});
