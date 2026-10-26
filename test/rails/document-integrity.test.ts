import { readFileSync } from 'node:fs';
import { afterEach, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';
import { draaiChecker, commit, git, maakRepo, opruimen, write } from '../hooks/follow-up-kit';

afterEach(opruimen);
const adr = (number: string, status = 'voorgesteld') => `# ${number} — Test\n\nStatus: ${status}\n`;
const fixture = () => maakRepo({ specs: [], mandaat: [], roadmap: [] });

test.each(['docs/adr/0060-second.md', 'docs/adr/archief/0060-second.md'])(
  'guard weigert een dubbel ADR-nummer, ook met archief: %s',
  (second) => {
    const f = fixture();
    write(f.root, 'docs/adr/0060-first.md', adr('0060'));
    write(f.root, second, adr('0060'));
    expect(draaiChecker(f, commit(f.root)).status).toBe(1);
  },
);

test('een nummer uit een later verwijderd archiefbestand blijft gereserveerd', () => {
  const f = fixture();
  write(f.root, 'docs/adr/archief/0070-old.md', adr('0070', 'vervallen'));
  commit(f.root);
  git(f.root, ['rm', 'docs/adr/archief/0070-old.md']);
  const base = commit(f.root);
  git(f.root, ['update-ref', 'refs/remotes/origin/main', base]);
  write(f.root, 'docs/adr/0070-new.md', adr('0070'));
  const result = draaiChecker({ ...f, base }, commit(f.root));
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/nummer 0070 is al gebruikt/);
});

test('een verouderde branch kiest geen nummer dat inmiddels op main bestaat', () => {
  const f = fixture();
  write(f.root, 'docs/adr/0070-main.md', adr('0070'));
  const base = commit(f.root);
  git(f.root, ['update-ref', 'refs/remotes/origin/main', base]);
  git(f.root, ['checkout', '--detach', f.base]);
  write(f.root, 'docs/adr/0070-branch.md', adr('0070'));
  const result = draaiChecker({ ...f, base }, commit(f.root));
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/nummer 0070/);
});

test.each([false, true])('vervangingsketen heeft geen zelfverwijzing of cyclus: %s', (cycle) => {
  const f = fixture();
  write(f.root, 'docs/adr/0060-first.md', adr('0060', `vervangen door ${cycle ? '0061' : '0060'}`));
  if (cycle) write(f.root, 'docs/adr/0061-second.md', adr('0061', 'vervangen door 0060'));
  expect(draaiChecker(f, commit(f.root)).status).toBe(1);
});

test('check-docs telt actieve en gearchiveerde nummers samen', async () => {
  const f = fixture();
  write(f.root, 'docs/adr/0060-first.md', adr('0060'));
  write(f.root, 'docs/adr/archief/0060-second.md', adr('0060'));
  git(f.root, ['add', '.']);
  expect((await docsViolations(f.root)).some(({ key }) => key.includes('adr:0060:dubbel'))).toBe(true);
});

test('de historische 0039-uitzondering dekt geen derde ADR', async () => {
  const f = fixture();
  for (const name of ['lokale-gate-hergebruik', 'stack-provider-neutraal-en-toolchain', 'extra'])
    write(f.root, `docs/adr/0039-${name}.md`, adr('0039'));
  git(f.root, ['add', '.']);
  expect((await docsViolations(f.root)).some(({ key }) => key.startsWith('docs:adr:0039:dubbel:'))).toBe(true);
});

test.each(['1. OV-1 ⚠ open', '2) OV-1 ⚠ open', '+ OV-1 ⚠ open'])(
  'een goedgekeurde spec heeft ook geen open vraag in lijstvorm %s',
  async (item) => {
    const f = fixture();
    write(
      f.root,
      'docs/specs/test.md',
      `status: goedgekeurd\n\n## Hergebruik en UX\n\nKit.\n\n## Open vragen\n\n${item}\n`,
    );
    git(f.root, ['add', '.']);
    expect((await docsViolations(f.root)).some(({ key }) => key.endsWith(':open-vraag'))).toBe(true);
  },
);

test('bronvoorbeelden verwijzen naar het exacte repositorypad', async () => {
  const f = fixture();
  write(f.root, 'test/copies/src/api/example.ts', 'export {};');
  write(f.root, 'docs/specs/test.md', 'status: voorstel\n\n## Kopieer de vorm van\n\n`src/api/example.ts`\n');
  git(f.root, ['add', '.']);
  expect((await docsViolations(f.root)).some(({ key }) => key.endsWith(':vorm'))).toBe(true);
});

test('de twee historische 0039-bestanden blijven als bestaande ratchet-afwijking herkenbaar', async () => {
  const violations = await docsViolations();
  expect(violations.find(({ key }) => key === 'docs:adr:0039:dubbel')).toBeDefined();
  expect(readFileSync('.kit/baseline.json', 'utf8')).toContain('docs:adr:0039:dubbel');
});

test.each([
  'docs/adr/0060_second.md',
  'docs/adr/00600-second.md',
  'docs/adr/archief/060-second.md',
  'docs/adr/notes.md',
])('check-docs weigert een ADR-bestand buiten het patroon NNNN-slug.md: %s', async (file) => {
  const f = fixture();
  write(f.root, file, adr('0060'));
  git(f.root, ['add', '.']);
  expect((await docsViolations(f.root)).map(({ key }) => key)).toContain(`docs:${file}:adr-naam`);
});

test.each(['docs/adr/README.md', 'docs/adr/_template.md', 'docs/adr/archief/README.md', 'docs/adr/0060-goed.md'])(
  'README, sjablonen en goede namen zijn geen naamfout: %s',
  async (file) => {
    const f = fixture();
    write(f.root, file, adr('0060'));
    git(f.root, ['add', '.']);
    expect((await docsViolations(f.root)).filter(({ key }) => key.endsWith(':adr-naam'))).toStrictEqual([]);
  },
);
