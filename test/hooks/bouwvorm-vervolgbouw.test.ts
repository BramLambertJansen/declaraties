import { afterEach, describe, expect, test } from 'vitest';
import { PR, SOURCE, commit, draaiDocsStatus, git, maakRepo, opruimen, read, write } from './follow-up-kit';

// docs/specs/specarchief-en-bouwvorm.md (ADR 0080 punt 4 en 5), AC-7 en AC-9: een vervolgbouw van een levende spec die al
// gebouwd is. De bouw-PR haalt de markering weg; `docs:status` schrijft dan `gebouwd # #<deze PR>` (Codex-bevinding op #544).
afterEach(opruimen);

const SPEC = 'docs/specs/bouw.md';
const FEATURE = 'feat/bouw';
const ARGS = [SPEC, 'gebouwd', '--pr', String(PR)];
const AC1 = '- **bouw/AC-1** — Gegeven iets, dan iets.';
const AC2 = '- **bouw/AC-2** — Gegeven meer, dan meer.';
const AC2_GEMARKEERD = '- **bouw/AC-2** (nog niet gebouwd) — Gegeven meer, dan meer.';

function specTekst(status: string, ac2: string, proza = 'Bestaande kit.'): string {
  return `---\nstatus: ${status}\nnamespace: bouw\n---\n\n# Spec bouw\n\n## Hergebruik en UX\n\n${proza}\n\n## Raakt ook\n\n- \`${SOURCE}\`\n\n## Acceptatiecriteria\n\n${AC1}\n${ac2}\n`;
}

/** main met de gebouwde spec en een gemarkeerde AC; `feat/bouw` schrijft `spec` en code. */
function vervolgPr(spec: string): { root: string; env: Record<string, string> } {
  const { root } = maakRepo({ specs: [], mandaat: [], roadmap: [] });
  git(root, ['switch', '-q', 'main']);
  write(root, SPEC, specTekst('gebouwd # #120', AC2_GEMARKEERD));
  const main = commit(root, 'docs(spec): bouw AC-2 (#129)');
  git(root, ['update-ref', 'refs/remotes/origin/main', main]);
  git(root, ['switch', '-q', '-c', FEATURE, 'main']);
  write(root, SPEC, spec);
  write(root, SOURCE, 'export const version = 2;\n');
  const head = commit(root, 'feat: bouw AC-2');
  return { root, env: { STUB_PR_HEAD: head, STUB_PR_REF: FEATURE } };
}

describe('specarchief-en-bouwvorm/AC-9: docs:status bij een vervolgbouw van een gebouwde spec', () => {
  test('specarchief-en-bouwvorm/AC-9 markering weg, inhoud verder gelijk aan main: schrijft gebouwd # #N', () => {
    const { root, env } = vervolgPr(specTekst('gebouwd # #120', AC2));
    const uitvoer = draaiDocsStatus(root, ARGS, env);
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
    expect(read(root, SPEC)).toBe(specTekst(`gebouwd # #${String(PR)}`, AC2));
  });

  test('specarchief-en-bouwvorm/AC-9 gebouwde spec met andere inhoud dan main: rood en niets geschreven', () => {
    const spec = specTekst('gebouwd # #120', AC2, 'Andere kit.');
    const { root, env } = vervolgPr(spec);
    const uitvoer = draaiDocsStatus(root, ARGS, env);
    expect(uitvoer.status).toBe(1);
    expect(read(root, SPEC)).toBe(spec);
  });
});
