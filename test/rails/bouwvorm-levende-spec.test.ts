import { chmodSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { commit, draaiChecker, git, maakRepo, opruimen, tempDir, write, type Fixture } from '../hooks/follow-up-kit';

// docs/specs/specarchief-en-bouwvorm.md (ADR 0080 punt 4 en 6): de guard `check-document-status` op een levende spec
// (AC-7) en op het omzetten van een SHA-regel (AC-12). Echte tijdelijke repositories, main als basis, `gh`-stub.
afterEach(opruimen);

const SPEC = 'docs/specs/demo.md';
const SHA = 'a'.repeat(40);
const CODE = 'src/web/features/demo/page.tsx';
const KRITIEK = '.github/workflows/demo.yml';
const BOUW_PR = { PR_NUMBER: '130' };

const AC1 = '- **demo/AC-1** — Gegeven iets, dan iets.';
const AC2 = '- **demo/AC-2** — Gegeven meer, dan meer.';
const AC2_GEMARKEERD = '- **demo/AC-2** (nog niet gebouwd) — Gegeven meer, dan meer.';

function spec(status: string, acs: string[] = [AC1]): string {
  return [
    '---',
    `status: ${status}`,
    'namespace: demo',
    '---',
    '',
    '# Spec demo',
    '',
    '## Hergebruik en UX',
    '',
    'Bestaande kit.',
    '',
    '## Acceptatiecriteria',
    '',
    ...acs,
    '',
  ].join('\n');
}

/** main met `tekst` als spec; de branch start daarop (origin/main = HEAD). */
function metBasis(tekst: string): Fixture {
  const fixture = maakRepo({ specs: [], mandaat: [], roadmap: [] });
  write(fixture.root, SPEC, tekst);
  const base = commit(fixture.root, 'chore: basis');
  git(fixture.root, ['update-ref', 'refs/remotes/origin/main', base]);
  return { root: fixture.root, base };
}

/** De spec in een eigen commit, daarna (optioneel) de bestanden in een tweede commit; geeft de head. */
function pr(fixture: Fixture, tekst: string, bestanden: Record<string, string> = {}): string {
  write(fixture.root, SPEC, tekst);
  const head = commit(fixture.root, 'docs(spec): demo');
  if (Object.keys(bestanden).length === 0) return head;
  for (const [pad, inhoud] of Object.entries(bestanden)) write(fixture.root, pad, inhoud);
  return commit(fixture.root, 'feat: demo');
}

function groen(fixture: Fixture, head: string, extra: Record<string, string> = {}): void {
  const uitvoer = draaiChecker(fixture, head, extra);
  expect(uitvoer.stderr).toBe('');
  expect(uitvoer.status).toBe(0);
}

function rood(fixture: Fixture, head: string, extra: Record<string, string> = {}): string {
  const uitvoer = draaiChecker(fixture, head, extra);
  expect(uitvoer.status).toBe(1);
  expect(uitvoer.stderr).not.toBe('');
  return uitvoer.stderr;
}

/** Een `gh` die elke aanroep laat falen: zo bewijst groen dat de guard GitHub niet nodig had. */
function zonderGitHub(): Record<string, string> {
  const dir = tempDir('gh-weigert-');
  write(dir, 'gh', `#!${process.execPath}\nconsole.error('geen GitHub-aanroep verwacht');\nprocess.exit(1);\n`);
  chmodSync(path.join(dir, 'gh'), 0o755);
  return { PATH: `${dir}:${process.env['PATH'] ?? ''}` };
}

describe('specarchief-en-bouwvorm/AC-7: een gebouwde spec krijgt in een besluit-PR een nieuwe AC', () => {
  test('specarchief-en-bouwvorm/AC-7 gebouwd blijft met een nieuwe AC (nog niet gebouwd), alleen docs: groen', () => {
    const fixture = metBasis(spec('gebouwd # #120'));
    groen(fixture, pr(fixture, spec('gebouwd # #120', [AC1, AC2_GEMARKEERD])));
  });

  test('specarchief-en-bouwvorm/AC-7 dezelfde nieuwe AC zonder markering: rood', () => {
    const fixture = metBasis(spec('gebouwd # #120'));
    rood(fixture, pr(fixture, spec('gebouwd # #120', [AC1, AC2])));
  });

  test('specarchief-en-bouwvorm/AC-7 de markering in een PR met code: rood', () => {
    const fixture = metBasis(spec('gebouwd # #120'));
    rood(fixture, pr(fixture, spec('gebouwd # #120', [AC1, AC2_GEMARKEERD]), { [CODE]: 'export const x = 1;\n' }));
  });

  test('specarchief-en-bouwvorm/AC-7 gebouwd # #<deze PR> met een markering: rood met de melding', () => {
    const fixture = metBasis(spec('gebouwd # #120'));
    const head = pr(fixture, spec('gebouwd # #130', [AC1, AC2_GEMARKEERD]), { [CODE]: 'export const x = 1;\n' });
    expect(rood(fixture, head, BOUW_PR)).toContain(`${SPEC}: gebouwd # #130 met een AC (nog niet gebouwd) (ADR 0080)`);
  });

  test('specarchief-en-bouwvorm/AC-7 een markering op een id dat al op main staat: rood', () => {
    const fixture = metBasis(spec('gebouwd # #120', [AC1, AC2]));
    rood(fixture, pr(fixture, spec('gebouwd # #120', [AC1, AC2_GEMARKEERD])));
  });

  test('specarchief-en-bouwvorm/AC-7 een gebouwde spec terug naar goedgekeurd: rood', () => {
    const fixture = metBasis(spec('gebouwd # #120'));
    rood(fixture, pr(fixture, spec('goedgekeurd', [AC1, AC2_GEMARKEERD])));
  });

  test('specarchief-en-bouwvorm/AC-7 een kritieke bouw-PR haalt de markering weg, voegt de test toe en zet gebouwd # #<deze PR>: groen', () => {
    const fixture = metBasis(spec('gebouwd # #120', [AC1, AC2_GEMARKEERD]));
    write(fixture.root, KRITIEK, 'name: demo\n');
    write(fixture.root, 'test/demo.test.ts', "test('demo/AC-2 werkt', () => {});\n");
    write(fixture.root, SPEC, spec('gebouwd # #130', [AC1, AC2]));
    groen(fixture, commit(fixture.root, 'feat: demo/AC-2'), BOUW_PR);
  });
});

describe('specarchief-en-bouwvorm/AC-12: op main gebouwd # #N; gevalideerd: <sha> omzetten', () => {
  test('specarchief-en-bouwvorm/AC-12 de PR maakt er gebouwd # #N van: groen zonder GitHub-aanroep', () => {
    const fixture = metBasis(spec(`gebouwd # #130; gevalideerd: ${SHA}`));
    groen(fixture, pr(fixture, spec('gebouwd # #130')), zonderGitHub());
  });

  test('specarchief-en-bouwvorm/AC-12 gebouwd # #M zonder bewijs voor M: rood', () => {
    const fixture = metBasis(spec(`gebouwd # #130; gevalideerd: ${SHA}`));
    rood(fixture, pr(fixture, spec('gebouwd # #131')), { STUB_PR_STATE: 'closed' });
  });

  test('specarchief-en-bouwvorm/AC-12 SHA weg en inhoud gewijzigd: rood', () => {
    const fixture = metBasis(spec(`gebouwd # #130; gevalideerd: ${SHA}`));
    rood(fixture, pr(fixture, spec('gebouwd # #130', [AC1, AC2])), { STUB_PR_STATE: 'closed' });
  });
});
