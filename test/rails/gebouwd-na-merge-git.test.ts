import { afterEach, describe, expect, test } from 'vitest';
import {
  PR,
  SOURCE,
  STATUS_GIT,
  builtLine,
  commit,
  doneItem,
  draaiChecker,
  draaiDocsStatus,
  git,
  maakRepo,
  openItem,
  opruimen,
  read,
  roep,
  write,
  type Uitvoer,
} from '../hooks/follow-up-kit';

// docs/specs/gebouwd-na-merge.md met echte tijdelijke git-repo's: een squash- of mergecommit van PR n op main, daarna een
// status-PR vanaf main. GitHub komt van de `gh`-stub (STUB_PR_MERGED, STUB_MERGE_SHA, STUB_PR_HEAD, STUB_CHECK_NAMES).
afterEach(opruimen);

const SPEC = 'docs/specs/bouw.md';
const ROADMAP = 'docs/roadmap.md';
const FEATURE = 'feat/bouw';
const STATUS_BRANCH = 'docs/status-bouw';
const REGISTER = '.claude/decisions.json';
const ARGS = [SPEC, 'gebouwd', '--pr', String(PR)];

const IN_HEAD = `de mergecommit van PR #${String(PR)} in HEAD`;
const SPEC_BIJ_MERGE = 'de spec ongewijzigd en goedgekeurd in de mergecommit';
const CHECKS = `alle verplichte GitHub Actions-checks groen op de head van PR #${String(PR)}`;
const BOUWPAD = `een wijziging buiten docs/ in PR #${String(PR)} op een pad dat de spec noemt`;
const ALLEEN = 'alleen statusregels en het eigen roadmapvinkje in deze PR';
const GENERIEK = 'de juiste PR en gevalideerde commit';

function specTekst(status = 'goedgekeurd', extra = ''): string {
  return `---\nstatus: ${status}\nnamespace: bouw\n---\n\n# Spec bouw\n\n## Raakt ook\n\n- \`${SOURCE}\`\n- \`CHANGELOG.md\` en \`docs/roadmap.md\`\n- \`src/core/web/ui/other.tsx\` en src/core/web/ui/plain.tsx\n${extra}`;
}

function roadmap(item = openItem(SPEC)): string {
  return `# Roadmap\n\n## Stuk\n\n${item}\n\nToelichting.\n`;
}

interface Main {
  root: string;
  /** main na de besluit-PR: de goedgekeurde spec staat erop (tenzij `spec: null`). */
  spec: string;
}

/** main met register, roadmap en (optioneel) de goedgekeurde spec; origin/main volgt main. */
function maakMain(opties: { spec?: string | null; zonderRegister?: boolean; requiredChecks?: string[] } = {}): Main {
  const { root } = maakRepo({ specs: [], mandaat: [], roadmap: [], zonderRegister: opties.zonderRegister === true });
  git(root, ['switch', '-q', 'main']);
  write(root, ROADMAP, roadmap());
  if (opties.requiredChecks !== undefined)
    write(
      root,
      REGISTER,
      read(root, REGISTER).replace(
        '"requiredChecks":["gate:fast"]',
        `"requiredChecks":${JSON.stringify(opties.requiredChecks)}`,
      ),
    );
  const spec = opties.spec === undefined ? specTekst() : opties.spec;
  if (spec !== null) write(root, SPEC, spec);
  const sha = commit(root, 'docs(spec): bouw (#129)');
  git(root, ['update-ref', 'refs/remotes/origin/main', sha]);
  return { root, spec: sha };
}

interface Merge {
  prHead: string;
  mergeSha: string;
  /** De eerste commit op de featurebranch (bij twee commits). */
  eerste: string;
}

/** PR n op `feat/bouw`, daarna als squash of mergecommit op main; origin/main volgt. */
function mergePr(
  root: string,
  opties: { variant?: 'squash' | 'merge'; bron?: (root: string) => void; tweeCommits?: boolean } = {},
): Merge {
  git(root, ['switch', '-q', '-c', FEATURE, 'main']);
  write(root, SOURCE, 'export const version = 2;\n');
  opties.bron?.(root);
  const eerste = commit(root, 'feat: bouw');
  if (opties.tweeCommits === true) write(root, SOURCE, 'export const version = 3;\n');
  const prHead = opties.tweeCommits === true ? commit(root, 'feat: bouw, deel 2') : eerste;
  git(root, ['switch', '-q', 'main']);
  if (opties.variant === 'merge')
    git(root, ['merge', '-q', '--no-ff', '-m', `Merge pull request #${String(PR)}`, FEATURE]);
  else {
    git(root, ['merge', '-q', '--squash', FEATURE]);
    commit(root, `feat: bouw (#${String(PR)})`);
  }
  const mergeSha = git(root, ['rev-parse', 'HEAD']);
  git(root, ['update-ref', 'refs/remotes/origin/main', mergeSha]);
  return { prHead, mergeSha, eerste };
}

/** Een commit op main na de merge (erratum, nieuwe check, …); origin/main volgt. */
function naDeMerge(root: string, bewerk: (root: string) => void): string {
  git(root, ['switch', '-q', 'main']);
  bewerk(root);
  const sha = commit(root, 'chore: na de merge');
  git(root, ['update-ref', 'refs/remotes/origin/main', sha]);
  return sha;
}

function statusBranch(root: string, van = 'main'): void {
  git(root, ['switch', '-q', '-c', STATUS_BRANCH, van]);
}

function gemergd(
  merge: { prHead: string; mergeSha: string },
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    STUB_PR_MERGED: 'true',
    STUB_MERGE_SHA: merge.mergeSha,
    STUB_PR_HEAD: merge.prHead,
    STUB_PR_REF: FEATURE,
    ...extra,
  };
}

/** De statusregel zoals docs:status hem zou schrijven, als eigen commit (voor de CI-toets bij een weigering). */
function statusCommit(root: string, sha: string, bewerk?: (root: string) => void): string {
  write(root, SPEC, read(root, SPEC).replace(/^status: .*$/m, `status: ${builtLine(sha)}`));
  bewerk?.(root);
  return commit(root, 'docs: gebouwd');
}

function ci(root: string, head: string, env: Record<string, string>): Uitvoer {
  const base = git(root, ['rev-parse', 'origin/main']);
  return draaiChecker({ root, base }, head, { HEAD_REF: STATUS_BRANCH, ...env });
}

function docsWeigert(root: string, env: Record<string, string>, voorwaarde: string): void {
  const voor = read(root, SPEC);
  const uitvoer = draaiDocsStatus(root, ARGS, env);
  expect(uitvoer.stderr).toContain(`Gebouwd na de merge vereist ${voorwaarde}`);
  expect(uitvoer.status).toBe(1);
  expect(read(root, SPEC)).toBe(voor);
  expect(git(root, ['status', '--porcelain'])).toBe('');
}

function ciWeigert(uitvoer: Uitvoer, voorwaarde: string): void {
  expect(uitvoer.stderr).toContain(`gebouwd na de merge vereist ${voorwaarde}`);
  expect(uitvoer.status).toBe(1);
}

function ciGroen(uitvoer: Uitvoer): void {
  expect(uitvoer.stderr).toBe('');
  expect(uitvoer.status).toBe(0);
}

// GEWIJZIGD (specarchief-en-bouwvorm, ADR 0080 punt 5, OV-1): docs:status schrijft `gebouwd # #<n>`, zonder SHA.
describe('gebouwd-na-merge/AC-1: docs:status schrijft gebouwd na een squash- of mergecommit', () => {
  test.each(['squash', 'merge'] as const)(
    'gebouwd-na-merge/AC-1: %s — status: gebouwd # #<n>, en CI is groen',
    (variant) => {
      const { root } = maakMain();
      const merge = mergePr(root, { variant });
      statusBranch(root);

      const uitvoer = draaiDocsStatus(root, ARGS, gemergd(merge));

      expect(uitvoer.stderr).toBe('');
      expect(uitvoer.status).toBe(0);
      expect(read(root, SPEC)).toBe(specTekst(`gebouwd # #${String(PR)}`));
      expect(git(root, ['diff', '--name-only'])).toBe(SPEC);
      ciGroen(ci(root, commit(root, 'docs: gebouwd'), gemergd(merge)));
    },
  );
});

describe('gebouwd-na-merge/AC-2: de status-PR wijzigt alleen statusregels en het eigen vinkje', () => {
  test('gebouwd-na-merge/AC-2: met --roadmap groen, ook na een merge van main op de branch', () => {
    const { root } = maakMain();
    const merge = mergePr(root);
    statusBranch(root);
    expect(draaiDocsStatus(root, [...ARGS, '--roadmap'], gemergd(merge)).status).toBe(0);
    const head = commit(root, 'docs: gebouwd');
    ciGroen(ci(root, head, gemergd(merge)));

    naDeMerge(root, (r) => {
      write(r, 'README.md', 'Ander werk op main.\n');
    });
    git(root, ['switch', '-q', STATUS_BRANCH]);
    git(root, ['merge', '-q', '--no-edit', 'main']);
    ciGroen(ci(root, git(root, ['rev-parse', 'HEAD']), gemergd(merge)));
  });

  test.each([
    [
      'een ander bestand',
      (r: string) => {
        write(r, 'README.md', 'Gewijzigd.\n');
      },
    ],
    [
      'andere tekst in de roadmap',
      (r: string) => {
        write(r, ROADMAP, roadmap().replace('Toelichting.', 'Andere toelichting.'));
      },
    ],
  ])('gebouwd-na-merge/AC-2: de status-PR wijzigt ook %s: CI faalt', (_naam, bewerk) => {
    const { root } = maakMain();
    const merge = mergePr(root);
    statusBranch(root);
    const head = statusCommit(root, merge.prHead, bewerk);
    ciWeigert(ci(root, head, gemergd(merge)), ALLEEN);
  });
});

describe('gebouwd-na-merge/AC-3: de mergecommit hoort in HEAD en heeft de PR-head als tweede ouder', () => {
  test('gebouwd-na-merge/AC-3: een statusbranch zonder de mergecommit faalt in docs:status en CI', () => {
    const { root, spec } = maakMain();
    const merge = mergePr(root);
    statusBranch(root, spec);
    docsWeigert(root, gemergd(merge), IN_HEAD);
    ciWeigert(ci(root, statusCommit(root, merge.prHead), gemergd(merge)), IN_HEAD);
  });

  test('gebouwd-na-merge/AC-3: een mergecommit waarvan de tweede ouder niet de PR-head is, faalt', () => {
    const { root } = maakMain();
    const merge = mergePr(root, { variant: 'merge', tweeCommits: true });
    const verkeerd = { prHead: merge.eerste, mergeSha: merge.mergeSha };
    statusBranch(root);
    docsWeigert(root, gemergd(verkeerd), IN_HEAD);
    ciWeigert(ci(root, statusCommit(root, merge.eerste), gemergd(verkeerd)), IN_HEAD);
  });
});

describe('gebouwd-na-merge/AC-3: alleen een merge naar main telt', () => {
  test('gebouwd-na-merge/AC-3: PR n gemerged in een zijbranch die via de statusbranch in HEAD zit, faalt in docs:status en CI', () => {
    const { root, spec } = maakMain();
    git(root, ['switch', '-q', '-c', 'side-x', 'main']);
    git(root, ['switch', '-q', '-c', FEATURE, 'side-x']);
    write(root, SOURCE, 'export const version = 2;\n');
    const prHead = commit(root, 'feat: bouw');
    git(root, ['switch', '-q', 'side-x']);
    git(root, ['merge', '-q', '--no-ff', '-m', `Merge pull request #${String(PR)}`, FEATURE]);
    const mergeSha = git(root, ['rev-parse', 'HEAD']);
    expect(git(root, ['rev-parse', 'origin/main'])).toBe(spec);
    // De statusbranch haalt X binnen en draait de wijzigingen terug: de tree is main plus (straks) de statusregel.
    statusBranch(root);
    git(root, ['merge', '-q', '--no-ff', '--no-edit', 'side-x']);
    git(root, ['checkout', spec, '--', SOURCE]);
    commit(root, 'revert: zijbranch');
    expect(git(root, ['diff', '--name-only', spec, 'HEAD'])).toBe('');
    const merge = { prHead, mergeSha };
    docsWeigert(root, gemergd(merge), IN_HEAD);
    ciWeigert(ci(root, statusCommit(root, prHead), gemergd(merge)), IN_HEAD);
  });

  test('gebouwd-na-merge/AC-3: een PR met basisbranch develop faalt in docs:status en CI', () => {
    const { root } = maakMain();
    const merge = mergePr(root);
    statusBranch(root);
    const env = gemergd(merge, { STUB_PR_BASE: 'develop' });
    docsWeigert(root, env, IN_HEAD);
    ciWeigert(ci(root, statusCommit(root, merge.prHead), env), IN_HEAD);
  });
});

describe('gebouwd-na-merge/AC-4: de spec staat ongewijzigd op goedgekeurd in de mergecommit', () => {
  test.each([
    [
      'een erratum na de merge',
      {},
      (r: string) => {
        write(r, SPEC, specTekst('goedgekeurd', '\nErratum: andere tekst.\n'));
      },
    ],
    [
      'een spec die pas na PR n op main kwam',
      { spec: null },
      (r: string) => {
        write(r, SPEC, specTekst());
      },
    ],
    [
      'een spec op voorstel in de mergecommit',
      { spec: specTekst('voorstel') },
      (r: string) => {
        write(r, SPEC, specTekst());
      },
    ],
  ])('gebouwd-na-merge/AC-4: %s faalt in docs:status en CI', (_naam, opties, naMerge) => {
    const { root } = maakMain(opties);
    const merge = mergePr(root);
    naDeMerge(root, naMerge);
    statusBranch(root);
    docsWeigert(root, gemergd(merge), SPEC_BIJ_MERGE);
    ciWeigert(ci(root, statusCommit(root, merge.prHead), gemergd(merge)), SPEC_BIJ_MERGE);
  });
});

describe('gebouwd-na-merge/AC-5: verplichte checks uit de eerste ouder, groen op de PR-head', () => {
  test.each([
    ['geen enkele check', { STUB_CHECKS: 'geen' }],
    ['alleen een andere check', { STUB_CHECK_NAMES: 'gate:other' }],
  ])('gebouwd-na-merge/AC-5: %s op de PR-head faalt in docs:status en CI', (_naam, checks) => {
    const { root } = maakMain();
    const merge = mergePr(root);
    statusBranch(root);
    docsWeigert(root, gemergd(merge, checks), CHECKS);
    ciWeigert(ci(root, statusCommit(root, merge.prHead), gemergd(merge, checks)), CHECKS);
  });

  test('gebouwd-na-merge/AC-5: een check die pas na de merge aan requiredChecks is toegevoegd, telt niet mee', () => {
    const { root } = maakMain();
    const merge = mergePr(root);
    naDeMerge(root, (r) => {
      write(
        r,
        REGISTER,
        read(r, REGISTER).replace('"requiredChecks":["gate:fast"]', '"requiredChecks":["gate:fast","gate:slow"]'),
      );
    });
    statusBranch(root);
    const uitvoer = draaiDocsStatus(root, ARGS, gemergd(merge));
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
    ciGroen(ci(root, commit(root, 'docs: gebouwd'), gemergd(merge)));
  });
});

describe('gebouwd-na-merge/AC-6: gevalideerd is de PR-head', () => {
  test.each(['mergecommit', 'eerste ouder'] as const)(
    'gebouwd-na-merge/AC-6: gevalideerd: de %s in plaats van de PR-head faalt in CI',
    (welke) => {
      const { root, spec } = maakMain();
      const merge = mergePr(root);
      statusBranch(root);
      const head = statusCommit(root, welke === 'mergecommit' ? merge.mergeSha : spec);
      ciWeigert(ci(root, head, gemergd(merge)), GENERIEK);
    },
  );
});

describe('gebouwd-na-merge/AC-7: gesloten zonder merge of uit een fork', () => {
  test.each([
    ['gesloten zonder merge', { STUB_PR_MERGED: 'false', STUB_PR_STATE: 'closed' }],
    ['gemergd uit een fork', { STUB_PR_HEAD_REPO: 'other/template' }],
  ])('gebouwd-na-merge/AC-7: %s faalt in docs:status en CI', (_naam, extra) => {
    const { root } = maakMain();
    const merge = mergePr(root);
    statusBranch(root);
    const voor = read(root, SPEC);
    const docs = draaiDocsStatus(root, ARGS, gemergd(merge, extra));
    expect(docs.status).toBe(1);
    expect(read(root, SPEC)).toBe(voor);
    const uitvoer = ci(root, statusCommit(root, merge.prHead), gemergd(merge, extra));
    expect(uitvoer.status).toBe(1);
    expect(uitvoer.stderr).not.toBe('');
  });
});

describe('gebouwd-na-merge/AC-8: een open PR via de bestaande route, een gemergde nooit', () => {
  test('gebouwd-na-merge/AC-8: een open PR op zijn eigen head schrijft gebouwd zoals nu', () => {
    const { root } = maakMain();
    git(root, ['switch', '-q', '-c', FEATURE, 'main']);
    write(root, SOURCE, 'export const version = 2;\n');
    const prHead = commit(root, 'feat: bouw');
    const uitvoer = draaiDocsStatus(root, ARGS, { STUB_PR_HEAD: prHead, STUB_PR_REF: FEATURE });
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
    // GEWIJZIGD (specarchief-en-bouwvorm, ADR 0080 punt 5, OV-1): ook de open route schrijft `gebouwd # #<n>`.
    expect(read(root, SPEC)).toBe(specTekst(`gebouwd # #${String(PR)}`));
  });

  test('gebouwd-na-merge/AC-8: een gemergde PR gaat niet via de open route, ook niet op de lokale PR-head en branch', () => {
    const { root } = maakMain();
    const merge = mergePr(root);
    git(root, ['switch', '-q', FEATURE]);
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(merge.prHead);
    docsWeigert(root, gemergd(merge), IN_HEAD);
  });

  test('gebouwd-na-merge/AC-8: CI toetst een gemergde PR met de head van de status-PR via de gemergde route', () => {
    const { root } = maakMain();
    const merge = mergePr(root);
    git(root, ['switch', '-q', FEATURE]);
    const head = statusCommit(root, merge.prHead);
    const uitvoer = ci(root, head, { ...gemergd(merge, { STUB_PR_HEAD: head }), HEAD_REF: FEATURE });
    ciWeigert(uitvoer, GENERIEK);
  });
});

describe('gebouwd-na-merge/AC-9: --roadmap in de gemergde route', () => {
  test('gebouwd-na-merge/AC-9: tikt het item van de spec af zoals nu', () => {
    const { root } = maakMain();
    const merge = mergePr(root);
    statusBranch(root);

    const uitvoer = draaiDocsStatus(root, [...ARGS, '--roadmap'], gemergd(merge));

    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
    expect(uitvoer.stdout).toBe(
      `${SPEC}: gebouwd; bewijs gecontroleerd, alleen de statusregel en het vinkje van het item gewijzigd\n`,
    );
    expect(read(root, ROADMAP)).toBe(roadmap(doneItem(SPEC, ` (#${String(PR)})`, 'Taak voor')));
    // GEWIJZIGD (specarchief-en-bouwvorm, ADR 0080 punt 5, OV-1): de regel is `gebouwd # #<n>`.
    expect(read(root, SPEC)).toBe(specTekst(`gebouwd # #${String(PR)}`));
  });
});

describe('gebouwd-na-merge/AC-10: een gemergde PR zonder bouwpad', () => {
  test('gebouwd-na-merge/AC-10: de besluit-PR die de spec goedkeurde faalt in docs:status en CI', () => {
    const { root, spec } = maakMain();
    const besluit = { prHead: spec, mergeSha: spec };
    statusBranch(root);
    docsWeigert(root, gemergd(besluit), BOUWPAD);
    ciWeigert(ci(root, statusCommit(root, spec), gemergd(besluit)), BOUWPAD);
  });

  test.each([
    ['een bestand dat de spec niet noemt', 'README.md'],
    ['een pad dat de spec zonder backticks noemt', 'src/core/web/ui/plain.tsx'],
    ['CHANGELOG.md, ook als de spec het noemt', 'CHANGELOG.md'],
    ['een docs-pad, ook als de spec het noemt', ROADMAP],
  ])('gebouwd-na-merge/AC-10: een PR die alleen %s wijzigt, faalt', (_naam, pad) => {
    const { root } = maakMain();
    git(root, ['switch', '-q', '-c', FEATURE, 'main']);
    write(root, pad, `${read(root, ROADMAP)}\nGewijzigd.\n`);
    const prHead = commit(root, 'chore: geen bouw');
    git(root, ['switch', '-q', 'main']);
    git(root, ['merge', '-q', '--squash', FEATURE]);
    const mergeSha = commit(root, `chore: geen bouw (#${String(PR)})`);
    git(root, ['update-ref', 'refs/remotes/origin/main', mergeSha]);
    statusBranch(root);
    docsWeigert(root, gemergd({ prHead, mergeSha }), BOUWPAD);
  });
});

describe('gebouwd-na-merge/AC-10: alleen een volledig backtick-token is een genoemd pad', () => {
  const TOKENS = [
    '---\nstatus: goedgekeurd\nnamespace: bouw\n---\n\n# Spec bouw\n\n',
    '- `src/core/web/ui/a.tsx en src/core/web/ui/b.tsx`\n',
    `- \`${SOURCE}.bak\`\n`,
    '- `eerste`src/core/web/ui/c.tsx`tweede`\n',
  ].join('');
  const PADEN = [SOURCE, 'src/core/web/ui/a.tsx', 'src/core/web/ui/b.tsx', 'src/core/web/ui/c.tsx'];

  test.each([
    ['deel van een token met spaties', ['src/core/web/ui/a.tsx', 'src/core/web/ui/b.tsx']],
    ['voorvoegsel van een langer token (.bak)', [SOURCE]],
    ['tussen twee tokens (`eerste`pad`tweede`)', ['src/core/web/ui/c.tsx']],
  ])('gebouwd-na-merge/AC-10: een pad als %s telt niet als bouwpad', async (_naam, paden) => {
    const { root } = maakMain({ spec: TOKENS });
    const merge = mergePr(root, {
      bron: (r) => {
        for (const pad of paden) write(r, pad, 'gewijzigd\n');
      },
    });
    expect(await mergedEvidence(root, merge.mergeSha, merge.mergeSha)).toMatchObject({ bouwpaden: [] });
  });

  test('gebouwd-na-merge/AC-10: een PR die alleen zulke paden wijzigt, faalt in docs:status', () => {
    const { root } = maakMain({ spec: TOKENS });
    const merge = mergePr(root, {
      bron: (r) => {
        for (const pad of PADEN) write(r, pad, 'gewijzigd\n');
      },
    });
    statusBranch(root);
    docsWeigert(root, gemergd(merge), BOUWPAD);
  });
});

describe('gebouwd-na-merge/AC-11: requiredChecks in de eerste ouder', () => {
  test.each([
    ['zonder decisions.json', { zonderRegister: true }],
    ['met lege requiredChecks', { requiredChecks: [] }],
  ])('gebouwd-na-merge/AC-11: een eerste ouder %s faalt in docs:status en CI', (_naam, opties) => {
    const { root } = maakMain(opties);
    const merge = mergePr(root);
    // main na de merge heeft weer een geldig register: alleen de eerste ouder van de mergecommit telt.
    if ('requiredChecks' in opties)
      naDeMerge(root, (r) => {
        write(r, REGISTER, read(r, REGISTER).replace('"requiredChecks":[]', '"requiredChecks":["gate:fast"]'));
      });
    statusBranch(root);
    docsWeigert(root, gemergd(merge), CHECKS);
    ciWeigert(ci(root, statusCommit(root, merge.prHead), gemergd(merge)), CHECKS);
  });
});

async function mergedEvidence(root: string, mergeSha: string, head: string): Promise<unknown> {
  return roep(STATUS_GIT, 'mergedEvidence', root, { mergeSha, head, file: SPEC });
}

describe('gebouwd-na-merge: mergedEvidence leest het bewijs uit git', () => {
  test('gebouwd-na-merge/AC-1: squash-merge levert ouder, spec, checks en bouwpaden', async () => {
    const { root, spec } = maakMain();
    const merge = mergePr(root);
    expect(await mergedEvidence(root, merge.mergeSha, merge.mergeSha)).toStrictEqual({
      inHead: true,
      parents: [spec],
      specAtMerge: specTekst(),
      requiredChecks: ['gate:fast'],
      bouwpaden: [SOURCE],
    });
  });

  test('gebouwd-na-merge/AC-1: mergecommit levert beide ouders', async () => {
    const { root, spec } = maakMain();
    const merge = mergePr(root, { variant: 'merge' });
    statusBranch(root);
    const head = statusCommit(root, merge.prHead);
    const bewijs = await mergedEvidence(root, merge.mergeSha, head);
    expect(bewijs).toMatchObject({ inHead: true, parents: [spec, merge.prHead], bouwpaden: [SOURCE] });
  });

  test('gebouwd-na-merge/AC-3: een mergecommit buiten HEAD of onleesbaar', async () => {
    const { root, spec } = maakMain();
    const merge = mergePr(root);
    expect(await mergedEvidence(root, merge.mergeSha, spec)).toMatchObject({ inHead: false });
    expect(await mergedEvidence(root, 'f'.repeat(40), merge.mergeSha)).toMatchObject({ inHead: false, parents: [] });
  });

  test('gebouwd-na-merge/AC-4: een spec die in de mergecommit ontbreekt, geeft specAtMerge null', async () => {
    const { root } = maakMain({ spec: null });
    const merge = mergePr(root);
    expect(await mergedEvidence(root, merge.mergeSha, merge.mergeSha)).toMatchObject({ specAtMerge: null });
  });

  test('gebouwd-na-merge/AC-5: requiredChecks komt uit de eerste ouder, ook als PR n decisions.json wijzigt', async () => {
    const { root } = maakMain();
    const merge = mergePr(root, {
      bron: (r) => {
        write(
          r,
          REGISTER,
          read(r, REGISTER).replace('"requiredChecks":["gate:fast"]', '"requiredChecks":["gate:fast","gate:slow"]'),
        );
      },
    });
    expect(await mergedEvidence(root, merge.mergeSha, merge.mergeSha)).toMatchObject({ requiredChecks: ['gate:fast'] });
  });

  test('gebouwd-na-merge/AC-10: bouwpaden zijn gesorteerd, buiten docs/ en CHANGELOG.md, en tussen backticks genoemd', async () => {
    const { root } = maakMain();
    const merge = mergePr(root, {
      bron: (r) => {
        for (const pad of ['src/core/web/ui/other.tsx', 'src/core/web/ui/plain.tsx', 'README.md', 'CHANGELOG.md'])
          write(r, pad, 'gewijzigd\n');
        write(r, ROADMAP, roadmap(doneItem(SPEC)));
      },
    });
    expect(await mergedEvidence(root, merge.mergeSha, merge.mergeSha)).toMatchObject({
      bouwpaden: ['src/core/web/ui/example.tsx', 'src/core/web/ui/other.tsx'],
    });
  });

  test('gebouwd-na-merge/AC-10: de besluit-PR zonder code heeft geen bouwpaden', async () => {
    const { root, spec } = maakMain();
    expect(await mergedEvidence(root, spec, spec)).toMatchObject({ bouwpaden: [] });
  });

  test('gebouwd-na-merge/AC-11: zonder decisions.json in de eerste ouder is requiredChecks null', async () => {
    const { root } = maakMain({ zonderRegister: true });
    const merge = mergePr(root);
    expect(await mergedEvidence(root, merge.mergeSha, merge.mergeSha)).toMatchObject({ requiredChecks: null });
  });
});
