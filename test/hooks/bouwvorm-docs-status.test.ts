import { afterEach, describe, expect, test } from 'vitest';
import { PR, SOURCE, commit, draaiDocsStatus, git, maakRepo, opruimen, read, write } from './follow-up-kit';

// docs/specs/specarchief-en-bouwvorm.md (ADR 0080 punt 5, Werking 3), AC-9: `docs:status <spec> gebouwd --pr N` voor een open
// PR schrijft alleen `status: gebouwd # #N`, zonder check-runs. Echte tijdelijke repository; GitHub komt van de `gh`-stub.
afterEach(opruimen);

const SPEC = 'docs/specs/bouw.md';
const FEATURE = 'feat/bouw';
const ARGS = [SPEC, 'gebouwd', '--pr', String(PR)];
const WEIGERING = 'Gebouwd vereist de juiste geopende PR op deze branch en code buiten docs/';

function specTekst(status = 'goedgekeurd'): string {
  return `---\nstatus: ${status}\nnamespace: bouw\n---\n\n# Spec bouw\n\n## Hergebruik en UX\n\nBestaande kit.\n\n## Raakt ook\n\n- \`${SOURCE}\`\n`;
}

/** main met de goedgekeurde spec; daarna `feat/bouw` met één commit die `bestanden` schrijft. Geeft root en PR-head. */
function openPr(bestanden: Record<string, string>): { root: string; head: string } {
  const { root } = maakRepo({ specs: [], mandaat: [], roadmap: [] });
  git(root, ['switch', '-q', 'main']);
  write(root, SPEC, specTekst());
  const main = commit(root, 'docs(spec): bouw (#129)');
  git(root, ['update-ref', 'refs/remotes/origin/main', main]);
  git(root, ['switch', '-q', '-c', FEATURE, 'main']);
  for (const [pad, inhoud] of Object.entries(bestanden)) write(root, pad, inhoud);
  return { root, head: commit(root, 'feat: bouw') };
}

function open(head: string, extra: Record<string, string> = {}): Record<string, string> {
  return { STUB_PR_HEAD: head, STUB_PR_REF: FEATURE, ...extra };
}

function weigert(root: string, env: Record<string, string>): void {
  const voor = read(root, SPEC);
  const uitvoer = draaiDocsStatus(root, ARGS, env);
  expect(uitvoer.stderr).toContain(WEIGERING);
  expect(uitvoer.status).toBe(1);
  expect(read(root, SPEC)).toBe(voor);
  expect(git(root, ['status', '--porcelain'])).toBe('');
}

describe('specarchief-en-bouwvorm/AC-9: docs:status voor een open PR schrijft gebouwd # #N', () => {
  test.each([
    ['met groene check-runs', {}],
    ['zonder check-runs', { STUB_CHECKS: 'geen' }],
  ])('specarchief-en-bouwvorm/AC-9 PR N open op de branch met code, %s: status: gebouwd # #N', (_naam, checks) => {
    const { root, head } = openPr({ [SOURCE]: 'export const version = 2;\n' });
    const uitvoer = draaiDocsStatus(root, ARGS, open(head, checks));
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
    expect(read(root, SPEC)).toBe(specTekst(`gebouwd # #${String(PR)}`));
  });

  test('specarchief-en-bouwvorm/AC-9 PR N gesloten: rood en niets geschreven', () => {
    const { root, head } = openPr({ [SOURCE]: 'export const version = 2;\n' });
    weigert(root, open(head, { STUB_PR_STATE: 'closed' }));
  });

  test('specarchief-en-bouwvorm/AC-9 PR N op een andere branch: rood en niets geschreven', () => {
    const { root, head } = openPr({ [SOURCE]: 'export const version = 2;\n' });
    weigert(root, open(head, { STUB_PR_REF: 'feat/ander' }));
  });

  test('specarchief-en-bouwvorm/AC-9 geen code buiten docs/ en CHANGELOG.md: rood en niets geschreven', () => {
    const { root, head } = openPr({ 'CHANGELOG.md': '# Changelog\n\n- bouw\n', 'docs/operations/bouw.md': '# Bouw\n' });
    weigert(root, open(head));
  });
});
