import { afterEach, describe, expect, test } from 'vitest';
import {
  PR,
  SOURCE,
  builtLine,
  commit,
  draaiChecker,
  draaiDocsStatus,
  git,
  maakRepo,
  opruimen,
  read,
  write,
  type Uitvoer,
} from '../hooks/follow-up-kit';

// docs/specs/specarchief-en-bouwvorm.md (ADR 0080 punt 5), AC-10 en AC-11: na de merge van PR N schrijft docs:status alleen
// `gebouwd # #N`, en de guard toetst die regel via de gemergde route met de head uit GitHub. De oude vorm met SHA toetst als
// nu. Echte tijdelijke repositories (squash-merge op main, daarna een status-PR); GitHub komt van de `gh`-stub.
afterEach(opruimen);

const SPEC = 'docs/specs/bouw.md';
const FEATURE = 'feat/bouw';
const STATUS_BRANCH = 'docs/status-bouw';
const ARGS = [SPEC, 'gebouwd', '--pr', String(PR)];
const REGEL = `gebouwd # #${String(PR)}`;
const CHECKS = `alle verplichte GitHub Actions-checks groen op de head van PR #${String(PR)}`;
const BOUWPAD = `een wijziging buiten docs/ in PR #${String(PR)} op een pad dat de spec noemt`;
const SPEC_BIJ_MERGE = 'de spec ongewijzigd en goedgekeurd in de mergecommit';
const ALLEEN = 'alleen statusregels en het eigen roadmapvinkje in deze PR';

function specTekst(status = 'goedgekeurd', extra = ''): string {
  return `---\nstatus: ${status}\nnamespace: bouw\n---\n\n# Spec bouw\n\n## Raakt ook\n\n- \`${SOURCE}\`\n${extra}`;
}

interface Merge {
  root: string;
  prHead: string;
  mergeSha: string;
}

/** main met de goedgekeurde spec, PR N squash-gemerged (met `bron` als bouw), daarna de statusbranch vanaf main. */
function gemergdePr(opties: { bron?: Record<string, string>; naMerge?: string } = {}): Merge {
  const { root } = maakRepo({ specs: [], mandaat: [], roadmap: [] });
  git(root, ['switch', '-q', 'main']);
  write(root, SPEC, specTekst());
  const main = commit(root, 'docs(spec): bouw (#129)');
  git(root, ['switch', '-q', '-c', FEATURE, main]);
  for (const [pad, inhoud] of Object.entries(opties.bron ?? { [SOURCE]: 'export const version = 2;\n' }))
    write(root, pad, inhoud);
  const prHead = commit(root, 'feat: bouw');
  git(root, ['switch', '-q', 'main']);
  git(root, ['merge', '-q', '--squash', FEATURE]);
  const mergeSha = commit(root, `feat: bouw (#${String(PR)})`);
  if (opties.naMerge !== undefined) {
    write(root, SPEC, opties.naMerge);
    commit(root, 'docs: erratum');
  }
  git(root, ['update-ref', 'refs/remotes/origin/main', git(root, ['rev-parse', 'HEAD'])]);
  git(root, ['switch', '-q', '-c', STATUS_BRANCH, 'main']);
  return { root, prHead, mergeSha };
}

function gemergd(merge: Merge, extra: Record<string, string> = {}): Record<string, string> {
  return {
    STUB_PR_MERGED: 'true',
    STUB_MERGE_SHA: merge.mergeSha,
    STUB_PR_HEAD: merge.prHead,
    STUB_PR_REF: FEATURE,
    ...extra,
  };
}

/** De status-PR: `regel` als statusregel (en eventueel een ander bestand) in een eigen commit; daarna de guard. */
function ci(merge: Merge, opties: { regel?: string; env?: Record<string, string>; ander?: boolean } = {}): Uitvoer {
  const { root } = merge;
  write(root, SPEC, read(root, SPEC).replace(/^status: .*$/m, `status: ${opties.regel ?? REGEL}`));
  if (opties.ander === true) write(root, 'README.md', 'Gewijzigd.\n');
  const head = commit(root, 'docs: gebouwd');
  const base = git(root, ['rev-parse', 'origin/main']);
  return draaiChecker({ root, base }, head, { HEAD_REF: STATUS_BRANCH, ...(opties.env ?? gemergd(merge)) });
}

function ciGroen(uitvoer: Uitvoer): void {
  expect(uitvoer.stderr).toBe('');
  expect(uitvoer.status).toBe(0);
}

function ciRood(uitvoer: Uitvoer, melding: string): void {
  expect(uitvoer.stderr).toContain(melding);
  expect(uitvoer.status).toBe(1);
}

describe('specarchief-en-bouwvorm/AC-10: kernscenario, gebouwd # #N na de merge', () => {
  test('specarchief-en-bouwvorm/AC-10 docs:status schrijft status: gebouwd # #N na een squash-merge met groene checks', () => {
    const merge = gemergdePr();
    const uitvoer = draaiDocsStatus(merge.root, ARGS, gemergd(merge));
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
    expect(read(merge.root, SPEC)).toBe(specTekst(REGEL));
  });

  test.each([
    ['een ander PR_NUMBER', { PR_NUMBER: String(PR + 1) }],
    ['geen PR_NUMBER', {}],
  ])('specarchief-en-bouwvorm/AC-10 de guard op de status-PR met %s: groen', (_naam, extra) => {
    const merge = gemergdePr();
    ciGroen(ci(merge, { env: { ...gemergd(merge), ...extra } }));
  });

  test('specarchief-en-bouwvorm/AC-10 een check rood (geen check op de head): rood', () => {
    const merge = gemergdePr();
    ciRood(ci(merge, { env: gemergd(merge, { STUB_CHECKS: 'geen' }) }), `gebouwd na de merge vereist ${CHECKS}`);
  });

  test('specarchief-en-bouwvorm/AC-10 geen bouwpad in PR N: rood', () => {
    const merge = gemergdePr({ bron: { 'README.md': 'Alleen tekst.\n' } });
    ciRood(ci(merge), `gebouwd na de merge vereist ${BOUWPAD}`);
  });

  test('specarchief-en-bouwvorm/AC-10 de spec in de mergecommit anders dan nu: rood', () => {
    const merge = gemergdePr({ naMerge: specTekst('goedgekeurd', '\nErratum.\n') });
    ciRood(ci(merge), `gebouwd na de merge vereist ${SPEC_BIJ_MERGE}`);
  });

  test('specarchief-en-bouwvorm/AC-10 de status-PR wijzigt ook een ander bestand: rood', () => {
    const merge = gemergdePr();
    ciRood(ci(merge, { ander: true }), `gebouwd na de merge vereist ${ALLEEN}`);
  });

  test('specarchief-en-bouwvorm/AC-10 PR N niet gemerged en niet deze PR: rood met de melding', () => {
    const merge = gemergdePr();
    const env = { STUB_PR_HEAD: merge.prHead, STUB_PR_REF: FEATURE, PR_NUMBER: String(PR + 1) };
    ciRood(
      ci(merge, { env }),
      `${SPEC}: gebouwd # #${String(PR)} is niet deze PR en PR #${String(PR)} is niet gemerged (ADR 0080)`,
    );
  });
});

describe('specarchief-en-bouwvorm/AC-11: de oude vorm gebouwd # #N; gevalideerd: <sha> toetst zoals nu', () => {
  test('specarchief-en-bouwvorm/AC-11 met bouwbewijs (gemergde PR, groene checks op de head): groen', () => {
    const merge = gemergdePr();
    ciGroen(ci(merge, { regel: builtLine(merge.prHead) }));
  });

  test('specarchief-en-bouwvorm/AC-11 zonder bouwbewijs (geen check op de head): rood', () => {
    const merge = gemergdePr();
    ciRood(ci(merge, { regel: builtLine(merge.prHead), env: gemergd(merge, { STUB_CHECKS: 'geen' }) }), CHECKS);
  });
});
