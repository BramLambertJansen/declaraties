import { afterEach, describe, expect, test } from 'vitest';
import {
  S1,
  S2,
  ROADMAP,
  basisRoadmap,
  bouw,
  commit,
  doneItem,
  draaiChecker,
  draaiDocsStatus,
  git,
  maakRepo,
  maakSymlink,
  opruimen,
  openItem,
  read,
  roadmapSleutels,
  statusOnly,
  write,
  type Fixture,
  type Stappen,
} from './follow-up-kit';

// mandate-follow-up/AC-6, AC-7, AC-8, AC-9, AC-20, AC-22 (statusOnlyDiff) en AC-8, AC-9, AC-23 (`pnpm docs:status … --roadmap`).
// `statusOnlyDiff` met een derde parameter bestaat nog niet; `statusOnly` laadt hem dynamisch (zie follow-up-kit.ts).
afterEach(opruimen);

function tickS1(): string[] {
  return basisRoadmap().map((regel) => (regel === openItem(S1) ? doneItem(S1) : regel));
}

function repo(zonderRegister: boolean, roadmap: string[] = basisRoadmap(), specs: string[] = [S1, S2]): Fixture {
  return maakRepo({ specs, mandaat: [S1], roadmap, zonderRegister });
}

async function resultaat(fixture: Fixture, stappen: Stappen): Promise<unknown> {
  const { validated, head } = bouw(fixture, stappen);
  return statusOnly(fixture.root, validated, head);
}

const REGISTERS = [
  ['met register op main', false],
  ['zonder enig besluit (AC-7)', true],
] as const;

describe.each(REGISTERS)('statusOnlyDiff, %s: AC-6', (_naam, zonderRegister) => {
  test('alleen de statusregel van S naar gebouwd en het enige open item van S afgevinkt: true', async () => {
    expect(await resultaat(repo(zonderRegister), { gebouwd: [S1], adminRoadmap: tickS1() })).toBe(true);
  });

  test('daarnaast één andere gewijzigde regel in docs/roadmap.md: false', async () => {
    const roadmap = tickS1().map((regel) => (regel === 'Toelichting.' ? 'Anders.' : regel));
    expect(await resultaat(repo(zonderRegister), { gebouwd: [S1], adminRoadmap: roadmap })).toBe(false);
  });

  test('het vinkje van een item van een spec die niet naar gebouwd gaat: false', async () => {
    const roadmap = tickS1().map((regel) => (regel === openItem(S2) ? doneItem(S2) : regel));
    expect(await resultaat(repo(zonderRegister), { gebouwd: [S1], adminRoadmap: roadmap })).toBe(false);
  });

  test('één ander gewijzigd bestand: false', async () => {
    const stappen: Stappen = {
      gebouwd: [S1],
      adminRoadmap: tickS1(),
      admin: (root) => {
        write(root, 'README.md', 'Gewijzigd.\n');
      },
    };
    expect(await resultaat(repo(zonderRegister), stappen)).toBe(false);
  });
});

describe('AC-20: een spec zonder item naast een spec met item', () => {
  test('S1 (met item) en S2 (zonder item) gaan beide naar gebouwd, alleen het item van S1 afgevinkt: true', async () => {
    const roadmap = [openItem(S1), 'Toelichting.'];
    const stappen: Stappen = { gebouwd: [S1, S2], adminRoadmap: [doneItem(S1), 'Toelichting.'] };
    expect(await resultaat(repo(true, roadmap), stappen)).toBe(true);
  });

  test('alleen de statusregel van S2 naar gebouwd en docs/roadmap.md niet in de diff: true', async () => {
    expect(await resultaat(repo(true, [openItem(S1), 'Toelichting.']), { gebouwd: [S2] })).toBe(true);
  });
});

describe('AC-22 bij statusOnlyDiff: bewijs op een ingesprongen vervolgregel', () => {
  test('true', async () => {
    const roadmap = basisRoadmap().map((regel) =>
      regel === openItem(S1) ? `- [x] Taak voor \`${S1}\`\n  (#130)` : regel,
    );
    expect(await resultaat(repo(true), { gebouwd: [S1], adminRoadmap: roadmap })).toBe(true);
  });
});

// --- docs:status --roadmap ------------------------------------------------------------------------------------------------------

const GEBOUWD_ARGS = [S1, 'gebouwd', '--pr', '130', '--roadmap'];
const GEBRUIK = 'Gebruik: pnpm docs:status <document> <status> [--pr <nummer> [--roadmap]]';

/** main met besluit voor S1; HEAD (= de te valideren broncommit) wijzigt alleen de broncode. */
function docsRepo(roadmap: string[] = basisRoadmap()): Fixture {
  const fixture = maakRepo({ specs: [S1, S2], mandaat: [S1], roadmap });
  write(fixture.root, 'src/core/web/ui/example.tsx', 'export const version = 2;\n');
  commit(fixture.root, 'feat: implementatie');
  return fixture;
}

function momentopname(root: string): { spec: string; roadmap: string; status: string } {
  return {
    spec: read(root, S1),
    roadmap: read(root, ROADMAP),
    status: git(root, ['status', '--porcelain']),
  };
}

describe('AC-8: één stap voor status en vinkje', () => {
  test.each([
    ['een item van één regel', basisRoadmap(), `- [x] Taak voor \`${S1}\` (#130)`],
    [
      'een item met een vervolgregel (bewijs achter de laatste regel)',
      basisRoadmap().map((regel) => (regel === openItem(S1) ? `${openItem(S1)}\n  vervolgregel` : regel)),
      `- [x] Taak voor \`${S1}\`\n  vervolgregel (#130)`,
    ],
  ])(
    '%s: schrijft alleen statusregel en vinkje, en alle checks accepteren het resultaat',
    async (_naam, roadmap, verwacht) => {
      const fixture = docsRepo(roadmap);
      const { root } = fixture;
      const sha = git(root, ['rev-parse', 'HEAD']);
      const voor = momentopname(root);

      const uitvoer = draaiDocsStatus(root, GEBOUWD_ARGS);

      expect(uitvoer.stderr).toBe('');
      expect(uitvoer.status).toBe(0);
      expect(uitvoer.stdout).toBe(
        `${S1}: gebouwd; bewijs gecontroleerd, alleen de statusregel en het vinkje van het item gewijzigd\n`,
      );
      expect(git(root, ['diff', '--name-only']).split('\n').sort()).toStrictEqual([ROADMAP, S1]);
      expect(read(root, S1)).toBe(
        voor.spec.replace('status: goedgekeurd', `status: gebouwd # #130; gevalideerd: ${sha}`),
      );
      expect(read(root, ROADMAP)).toBe(
        voor.roadmap.replace(roadmap.find((r) => r.startsWith(`- [ ] Taak voor \`${S1}\``)) ?? '', verwacht),
      );

      const head = commit(root, 'docs: administratie');
      expect(await statusOnly(root, sha, head)).toBe(true);
      const uitvoerCi = draaiChecker(fixture, head);
      expect(uitvoerCi.stderr).toBe('');
      expect(uitvoerCi.status).toBe(0);
      expect(await roadmapSleutels(root)).toStrictEqual([]);
    },
  );
});

describe('AC-9: weigeren zonder iets te schrijven', () => {
  function weigert(aanroep: {
    root: string;
    args: string[];
    melding: RegExp | string;
    extra?: Record<string, string>;
  }): void {
    const { root, args, melding, extra } = aanroep;
    const voor = momentopname(root);
    const uitvoer = draaiDocsStatus(root, args, extra);
    expect(uitvoer.status).toBe(1);
    expect(uitvoer.stderr).toMatch(
      melding instanceof RegExp ? melding : new RegExp(melding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    expect(uitvoer.stderr).not.toContain('[--pr <nummer>]');
    expect(momentopname(root)).toStrictEqual(voor);
  }

  const GEEN_EENDUIDIG = `docs/roadmap.md: geen eenduidig open item dat ${S1} noemt; vraag de eigenaar`;

  test('geen item dat S noemt', () => {
    weigert({ root: docsRepo(['Toelichting.']).root, args: GEBOUWD_ARGS, melding: GEEN_EENDUIDIG });
  });

  test('twee open items die S noemen', () => {
    weigert({
      root: docsRepo([openItem(S1), openItem(S1, 'Tweede taak voor')]).root,
      args: GEBOUWD_ARGS,
      melding: GEEN_EENDUIDIG,
    });
  });

  test('het item is al afgevinkt', () => {
    weigert({ root: docsRepo([doneItem(S1, ' (#5)')]).root, args: GEBOUWD_ARGS, melding: GEEN_EENDUIDIG });
  });

  test('docs/roadmap.md wijkt af van HEAD', () => {
    const { root } = docsRepo();
    write(root, ROADMAP, `${read(root, ROADMAP)}Extra.\n`);
    weigert({ root, args: GEBOUWD_ARGS, melding: /\S/ });
  });

  test('docs/roadmap.md is een symlink', () => {
    const { root } = docsRepo();
    write(root, 'docs/roadmap-echt.md', read(root, ROADMAP));
    maakSymlink(root, ROADMAP, 'roadmap-echt.md');
    commit(root, 'test: roadmap als symlink');
    weigert({ root, args: GEBOUWD_ARGS, melding: /\S/ });
  });

  test('het bouwbewijs ontbreekt (PR niet open): de bestaande controle blijft gelden', () => {
    weigert({
      root: docsRepo().root,
      args: GEBOUWD_ARGS,
      melding: 'Gebouwd vereist de juiste geopende PR',
      extra: { STUB_PR_STATE: 'closed' },
    });
  });

  test('de verplichte checks ontbreken: de bestaande controle blijft gelden', () => {
    weigert({
      root: docsRepo().root,
      args: GEBOUWD_ARGS,
      melding: 'Gebouwd vereist de juiste geopende PR',
      extra: { STUB_CHECKS: 'geen' },
    });
  });

  test('--roadmap zonder --pr', () => {
    weigert({ root: docsRepo().root, args: [S1, 'gebouwd', '--roadmap'], melding: '--roadmap' });
  });
});

describe('AC-23: gebruiksfouten', () => {
  test.each([
    ['onjuist aantal argumenten', ['a', 'b', 'c']],
    ['verkeerde volgorde', ['docs/specs/x.md', 'gebouwd', '--roadmap', '--pr', '1']],
  ])('%s: exit 1 en de letterlijke gebruikstekst', (_naam, args) => {
    const { root } = docsRepo();
    const uitvoer = draaiDocsStatus(root, args);
    expect(uitvoer.status).toBe(1);
    expect(uitvoer.stderr).toBe(`${GEBRUIK}\n`);
  });

  test.each([
    ['een ADR', ['docs/adr/0001-voorbeeld.md', 'gebouwd', '--pr', '1', '--roadmap']],
    ['status goedgekeurd', [S1, 'goedgekeurd', '--pr', '1', '--roadmap']],
  ])('--roadmap met %s: letterlijke melding, niets geschreven', (_naam, args) => {
    const { root } = docsRepo();
    const voor = momentopname(root);
    const uitvoer = draaiDocsStatus(root, args);
    expect(uitvoer.status).toBe(1);
    expect(uitvoer.stderr).toBe('--roadmap kan alleen met een spec, status gebouwd en --pr\n');
    expect(momentopname(root)).toStrictEqual(voor);
  });
});
