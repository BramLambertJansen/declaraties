import { afterEach, describe, expect, test } from 'vitest';
import {
  commit,
  draaiChecker,
  draaiDocsStatus,
  git,
  maakRepo,
  maakSymlink,
  opruimen,
  PR,
  read,
  SOURCE,
  write,
} from '../hooks/follow-up-kit';

// ADR 0056: echte tijdelijke repositories en de bestaande GitHub-feitenstub; geen applicatie- of databasemocks.
afterEach(opruimen);

const SPEC = 'docs/specs/toast-fix.md';
const UI_TEST = 'src/core/web/ui/example.test.tsx';
const UI_CODE = 'export const version = 2;\n';
const OLD_TEST = "test('version', () => expect(version).toBe(1));\n";
const NEW_TEST = OLD_TEST.replace('toBe(1)', 'toBe(2)');
const MINI = [
  '---',
  'status: goedgekeurd',
  'namespace: toast-fix',
  'sjabloon: mini',
  'scope: functionele-ui',
  '---',
  '',
  '# Toastfix',
  '',
  '## Hergebruik en UX',
  '',
  'Bestaande toast. De versie en de bijbehorende test veranderen samen.',
  '',
].join('\n');

function uiFeature() {
  const fixture = maakRepo({ specs: [], mandaat: [], roadmap: [] });
  write(fixture.root, UI_TEST, OLD_TEST);
  const base = commit(fixture.root, 'test: bestaande UI-test');
  git(fixture.root, ['update-ref', 'refs/remotes/origin/main', base]);
  write(fixture.root, SPEC, MINI);
  write(fixture.root, SOURCE, UI_CODE);
  write(fixture.root, UI_TEST, NEW_TEST);
  return { root: fixture.root, base };
}

describe('ADR 0056: functionele UI in dezelfde feature-PR', () => {
  test('core-UI, bestaande UI-test en nieuwe mini-spec zonder record slagen en zijn zichtbaar voor review', () => {
    const fixture = uiFeature();
    const result = draaiChecker(fixture, commit(fixture.root));

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('functionele UI');
    expect(result.stdout).toContain(SOURCE);
    expect(result.stdout).toContain(UI_TEST);
  });

  test('een nieuw recept en vaste tekst voor het bestaande component mogen mee', () => {
    const fixture = uiFeature();
    write(fixture.root, 'src/core/web/ui/toast-recipe.ts', 'export const tones = {};\n');
    write(fixture.root, 'src/core/web/copy/ui.ts', "export const close = 'Sluiten';\n");

    expect(draaiChecker(fixture, commit(fixture.root)).status).toBe(0);
  });

  test.each([
    ['scope ontbreekt', MINI.replace('scope: functionele-ui\n', '')],
    ['scope staat in de body', `${MINI.replace('scope: functionele-ui\n', '')}\nscope: functionele-ui\n`],
    ['geen mini-spec', MINI.replace('sjabloon: mini\n', '')],
  ])('%s: de uitzondering wordt niet actief', (_name, text) => {
    const fixture = uiFeature();
    write(fixture.root, SPEC, text);

    expect(draaiChecker(fixture, commit(fixture.root)).status).toBe(1);
  });

  test.each([
    'src/core/api/auth/auth.ts',
    'src/core/api/db/index.ts',
    'src/core/shared/can.ts',
    'src/core/web/lib/auth.ts',
    'src/web/lib/auth.ts',
    'src/web/features/session/queries.ts',
    'src/core/web/styles/tokens.css',
    'src/shared/contracts/demo.ts',
    'src/shared/permissions.ts',
    'src/api/routes/demo.ts',
    'scripts/kit/lane.mjs',
    '.claude/rules/web.md',
    '.github/workflows/ci.yml',
    'package.json',
    'pnpm-lock.yaml',
    'test/setup/web.ts',
    'test/rails/fixtures/ui.ts',
    'e2e/support/ui.ts',
    'src/web/AGENTS.md',
  ])('%s maakt de gemengde PR ongeldig voor deze uitzondering', (file) => {
    const fixture = uiFeature();
    write(fixture.root, file, 'gewijzigd\n');

    expect(draaiChecker(fixture, commit(fixture.root)).status).toBe(1);
  });

  test('een app krijgt de core-uitzondering niet', () => {
    const fixture = uiFeature();
    const result = draaiChecker(fixture, commit(fixture.root), { REPO: 'owner/app', STUB_REPO: 'owner/app' });

    expect(result.status).toBe(1);
  });

  test('een symlink onder het toegestane UI-pad geeft geen schrijfrecht', () => {
    const fixture = uiFeature();
    maakSymlink(fixture.root, SOURCE, '../../../api/auth/auth.ts');

    expect(draaiChecker(fixture, commit(fixture.root)).status).toBe(1);
  });

  test.each([
    ['skip', NEW_TEST.replace('test(', 'test.skip(')],
    ['weghalen van testgevallen', 'export {};\n'],
  ])('%s blijft geweigerd', (_name, text) => {
    const fixture = uiFeature();
    write(fixture.root, UI_TEST, text);

    expect(draaiChecker(fixture, commit(fixture.root)).status).toBe(1);
  });

  test('verwijderen van een bestaande UI-test blijft geweigerd', () => {
    const fixture = uiFeature();
    commit(fixture.root);
    git(fixture.root, ['rm', UI_TEST]);

    expect(draaiChecker(fixture, commit(fixture.root)).status).toBe(1);
  });
});

describe('ADR 0056: bouwbewijs zonder vooraf gemergde UI-spec', () => {
  test('docs:status en de guard aanvaarden dezelfde afgebakende broncommit met groene checks', () => {
    const fixture = uiFeature();
    const source = commit(fixture.root);
    const result = draaiDocsStatus(fixture.root, [SPEC, 'gebouwd', '--pr', String(PR)]);

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(read(fixture.root, SPEC)).toContain(`status: gebouwd # #${String(PR)}; gevalideerd: ${source}`);
    const checked = draaiChecker(fixture, commit(fixture.root, 'docs: bouwbewijs'));
    expect(checked.status).toBe(0);
    expect(checked.stdout).toContain('functionele UI');
    expect(checked.stdout).toContain(UI_TEST);
  });

  test('ontbrekend CI-bewijs blijft rood en wijzigt de spec niet', () => {
    const fixture = uiFeature();
    commit(fixture.root);
    const result = draaiDocsStatus(fixture.root, [SPEC, 'gebouwd', '--pr', String(PR)], { STUB_CHECKS: 'geen' });

    expect(result.status).toBe(1);
    expect(read(fixture.root, SPEC)).toBe(MINI);
  });

  test('groene checks geven geen bouwrecht aan een gemengde UI/auth-PR', () => {
    const fixture = uiFeature();
    write(fixture.root, 'src/core/api/auth/auth.ts', 'export const version = 2;\n');
    commit(fixture.root);

    expect(draaiDocsStatus(fixture.root, [SPEC, 'gebouwd', '--pr', String(PR)]).status).toBe(1);
    expect(read(fixture.root, SPEC)).toBe(MINI);
  });

  test('een scope-uitbreiding na de groene broncommit maakt het bouwbewijs ongeldig', () => {
    const fixture = uiFeature();
    const source = commit(fixture.root);
    write(
      fixture.root,
      SPEC,
      MINI.replace('status: goedgekeurd', `status: gebouwd # #${String(PR)}; gevalideerd: ${source}`),
    );
    write(fixture.root, SOURCE, 'export const version = 3;\n');

    expect(draaiChecker(fixture, commit(fixture.root)).status).toBe(1);
  });
});
