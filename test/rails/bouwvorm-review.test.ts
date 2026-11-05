import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test } from 'vitest';
import { beslisOvergang, documentInfo } from '../../rails/hooks/lib/document-state.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import {
  PR,
  SOURCE,
  commit,
  draaiChecker,
  draaiDocsStatus,
  git,
  maakRepo,
  opruimen,
  read,
  write,
  type Fixture,
} from '../hooks/follow-up-kit';

// docs/specs/specarchief-en-bouwvorm.md (ADR 0080), aanvullende gevallen uit de review van de bouw-PR: een weggehaalde
// markering vraagt nieuw bouwbewijs (AC-7), nieuwe inhoud van een gebouwde spec hoort niet in een PR met code (AC-7), de
// markering telt alleen voor een spec niet mee in de digest (AC-7), een markering alleen op een spec die op main gebouwd is en
// niet in de mergecommit (AC-7, AC-10), en het rolhek kijkt naar elk pad onder docs/specs/archief/ (AC-3).
afterEach(opruimen);

const SPEC = 'docs/specs/demo.md';
const CODE = 'src/web/features/demo/page.tsx';
const AC1 = '- **demo/AC-1** — Gegeven iets, dan iets.';
const AC2 = '- **demo/AC-2** — Gegeven meer, dan meer.';
const AC2_GEMARKEERD = '- **demo/AC-2** (nog niet gebouwd) — Gegeven meer, dan meer.';

function spec(status: string, acs: string[] = [AC1], proza = 'Bestaande kit.'): string {
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
    proza,
    '',
    '## Acceptatiecriteria',
    '',
    ...acs,
    '',
  ].join('\n');
}

function metBasis(tekst: string): Fixture {
  const fixture = maakRepo({ specs: [], mandaat: [], roadmap: [] });
  write(fixture.root, SPEC, tekst);
  const base = commit(fixture.root, 'chore: basis');
  git(fixture.root, ['update-ref', 'refs/remotes/origin/main', base]);
  return { root: fixture.root, base };
}

function rood(fixture: Fixture, bestanden: Record<string, string>, extra: Record<string, string> = {}): string {
  for (const [pad, inhoud] of Object.entries(bestanden)) write(fixture.root, pad, inhoud);
  const uitvoer = draaiChecker(fixture, commit(fixture.root, 'docs: wijziging'), extra);
  expect(uitvoer.status).toBe(1);
  return uitvoer.stderr;
}

describe('specarchief-en-bouwvorm/AC-7: de markering weghalen vraagt gebouwd # #<deze PR>', () => {
  test('specarchief-en-bouwvorm/AC-7 markering weg, verwijzing gelijk: gebouwd (nieuw bouwbewijs)', () => {
    const uitslag = beslisOvergang(
      SPEC,
      spec('gebouwd # #120', [AC1, AC2_GEMARKEERD]),
      spec('gebouwd # #120', [AC1, AC2]),
    );
    expect(uitslag.uitslag).toBe('gebouwd');
  });

  test('specarchief-en-bouwvorm/AC-7 markering weg, verwijzing gelijk: rood', () => {
    const fixture = metBasis(spec('gebouwd # #120', [AC1, AC2_GEMARKEERD]));
    const melding = rood(fixture, { [SPEC]: spec('gebouwd # #120', [AC1, AC2]) });
    expect(melding).toContain(`${SPEC}: een AC zonder (nog niet gebouwd) vraagt gebouwd # #<deze PR> (ADR 0080)`);
  });
});

describe('specarchief-en-bouwvorm/AC-7: nieuwe inhoud van een gebouwde spec in een PR met code', () => {
  test('specarchief-en-bouwvorm/AC-7 proza gewijzigd, gebouwd # #120 blijft, met code: rood met de melding', () => {
    const fixture = metBasis(spec('gebouwd # #120'));
    const melding = rood(fixture, {
      [SPEC]: spec('gebouwd # #120', [AC1], 'Andere kit.'),
      [CODE]: 'export const x = 1;\n',
    });
    expect(melding).toContain(
      `${SPEC}: nieuwe inhoud van een gebouwde spec: besluit-PR zonder code of gebouwd # #<deze PR> (ADR 0080)`,
    );
  });
  test('specarchief-en-bouwvorm/AC-7 gebouwd naar vervallen met code: geen melding over nieuwe inhoud', () => {
    const fixture = metBasis(spec('gebouwd # #120'));
    write(fixture.root, SPEC, spec('vervallen # vervangen door demo-twee'));
    write(fixture.root, CODE, 'export const x = 1;\n');
    const uitvoer = draaiChecker(fixture, commit(fixture.root, 'feat: demo'));
    expect(uitvoer.stderr).not.toContain('nieuwe inhoud van een gebouwde spec');
  });
});

describe('specarchief-en-bouwvorm/AC-7: de markering valt alleen bij een spec uit de digest', () => {
  test('specarchief-en-bouwvorm/AC-7 een ADR met en zonder markering heeft een andere digest', () => {
    const adr = (regel: string) => `# 0001 — Demo\n\nStatus: geaccepteerd\n\n${regel}\n`;
    const file = 'docs/adr/0001-demo.md';
    expect(documentInfo(file, adr(AC2_GEMARKEERD))?.digest).not.toBe(documentInfo(file, adr(AC2))?.digest);
  });
});

describe('specarchief-en-bouwvorm/AC-7: een nieuwe markering alleen in een spec die op main gebouwd is', () => {
  test('specarchief-en-bouwvorm/AC-7 een goedgekeurde spec krijgt een AC (nog niet gebouwd): rood', () => {
    const fixture = metBasis(spec('goedgekeurd'));
    const melding = rood(fixture, { [SPEC]: spec('goedgekeurd', [AC1, AC2_GEMARKEERD]) });
    expect(melding).toContain(
      '(nog niet gebouwd) hoort in een besluit-PR zonder code op een spec die op main gebouwd is',
    );
  });
});

describe('specarchief-en-bouwvorm/AC-10: geen markering in de mergecommit', () => {
  test('specarchief-en-bouwvorm/AC-10 docs:status na de merge met een AC (nog niet gebouwd) in de spec: rood', () => {
    const { root } = maakRepo({ specs: [], mandaat: [], roadmap: [] });
    git(root, ['switch', '-q', 'main']);
    const tekst = spec('goedgekeurd', [AC1, AC2_GEMARKEERD], `Raakt \`${SOURCE}\`.`);
    write(root, SPEC, tekst);
    commit(root, 'docs(spec): demo (#129)');
    git(root, ['switch', '-q', '-c', 'feat/demo', 'main']);
    write(root, SOURCE, 'export const version = 2;\n');
    const prHead = commit(root, 'feat: demo');
    git(root, ['switch', '-q', 'main']);
    git(root, ['merge', '-q', '--squash', 'feat/demo']);
    const mergeSha = commit(root, `feat: demo (#${String(PR)})`);
    git(root, ['update-ref', 'refs/remotes/origin/main', mergeSha]);
    git(root, ['switch', '-q', '-c', 'docs/status-demo', 'main']);
    const env = { STUB_PR_MERGED: 'true', STUB_MERGE_SHA: mergeSha, STUB_PR_HEAD: prHead, STUB_PR_REF: 'feat/demo' };
    const uitvoer = draaiDocsStatus(root, [SPEC, 'gebouwd', '--pr', String(PR)], env);
    expect(uitvoer.stderr).toContain(
      'Gebouwd na de merge vereist de spec zonder AC (nog niet gebouwd) in de mergecommit',
    );
    expect(uitvoer.status).toBe(1);
    expect(read(root, SPEC)).toBe(tekst);
  });
});

describe('specarchief-en-bouwvorm/AC-3: het rolhek kijkt naar elk pad onder docs/specs/archief/', () => {
  const ROOT = '/repo';
  const MELDING = 'het archief is onwijzigbaar; via Bash alleen';
  const ctx: Parameters<typeof decide>[1] = {
    root: ROOT,
    cwd: ROOT,
    config: loadConfig(readFileSync('.claude/gates.json', 'utf8')),
    read: () => null,
    committed: () => false,
    isDir: (rel: string) => ['docs', 'docs/specs', 'docs/specs/archief'].includes(rel),
    files: () => [],
    branch: 'feat/x',
  };

  test.each(['docs/specs/archief/_a.md', 'docs/specs/archief/x/a.md'])(
    'specarchief-en-bouwvorm/AC-3 echo x > %s is deny met de melding',
    (pad) => {
      const besluit = decide({ tool_name: 'Bash', tool_input: { command: `echo x > ${pad}` } }, ctx);
      expect(besluit.deny.join('\n')).toContain(MELDING);
    },
  );
});
