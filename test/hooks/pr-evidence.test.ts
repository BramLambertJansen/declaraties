import { describe, expect, test } from 'vitest';
import { checkProgress } from '../../scripts/kit/pr-verify.mjs';
import { labelScope } from '../../scripts/kit/pr-gate-label.mjs';

type CheckRun = Parameters<typeof checkProgress>[0][number];
type Change = Parameters<typeof labelScope>[0][number];

// Autoritatieve checkfeiten als invoer; deze pure tests halen geen GitHub-data op en wijzigen geen PR.
const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const REQUIRED = { names: ['gate:fast', 'gate:slow'], sha: SHA };

function check(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    id: 100,
    name: 'gate:fast',
    headSha: SHA,
    status: 'completed',
    conclusion: 'success',
    appId: 15368,
    ...overrides,
  };
}

function successfulChecks(): CheckRun[] {
  return [check(), check({ id: 101, name: 'gate:slow' })];
}

function change(pad: string, options: { status?: string; van?: string } = {}): Change {
  return {
    status: options.status ?? 'M',
    pad,
    ...(options.van === undefined ? {} : { van: options.van }),
  };
}

describe('checkProgress: werkelijk bewijs voor de huidige PR-commit', () => {
  test('alle verplichte checks moeten op exact deze SHA afgerond en groen zijn', () => {
    expect(checkProgress(successfulChecks(), REQUIRED)).toStrictEqual({
      state: 'success',
      lines: ['gate:fast: success', 'gate:slow: success'],
    });
  });

  test.each([
    { name: 'failure', latest: { id: 200, conclusion: 'failure' }, line: 'gate:fast: failure' },
    { name: 'cancelled', latest: { id: 200, conclusion: 'cancelled' }, line: 'gate:fast: cancelled' },
    { name: 'timed_out', latest: { id: 200, conclusion: 'timed_out' }, line: 'gate:fast: timed_out' },
    { name: 'skipped', latest: { id: 200, conclusion: 'skipped' }, line: 'gate:fast: skipped' },
    { name: 'afgerond zonder conclusie', latest: { id: 200, conclusion: null }, line: 'gate:fast: completed' },
  ])('de nieuwste $name-run verslaat eerder groen, ongeacht invoervolgorde', ({ latest, line }) => {
    const newest = check(latest);
    const expected = { state: 'failure', lines: [line, 'gate:slow: success'] };

    expect(checkProgress([...successfulChecks(), newest], REQUIRED)).toStrictEqual(expected);
    expect(checkProgress([newest, ...successfulChecks()], REQUIRED)).toStrictEqual(expected);
  });

  test('een latere succesvolle rerun vervangt eerder rood op dezelfde SHA', () => {
    const oldFailure = check({ id: 99, conclusion: 'failure' });

    expect(checkProgress([oldFailure, ...successfulChecks()], REQUIRED).state).toBe('success');
  });

  test('een ontbrekende verplichte check blijft pending', () => {
    expect(checkProgress([check()], REQUIRED)).toStrictEqual({
      state: 'pending',
      lines: ['gate:fast: success', 'gate:slow: ontbreekt'],
    });
  });

  test('zonder checks blijft de PR pending', () => {
    expect(checkProgress([], REQUIRED)).toStrictEqual({
      state: 'pending',
      lines: ['gate:fast: ontbreekt', 'gate:slow: ontbreekt'],
    });
  });

  test.each(['queued', 'in_progress', 'waiting', 'requested', 'pending'])(
    'een nog niet afgeronde %s-check blijft pending',
    (status) => {
      const checks = [check({ status, conclusion: null }), check({ name: 'gate:slow' })];

      expect(checkProgress(checks, REQUIRED)).toStrictEqual({
        state: 'pending',
        lines: [`gate:fast: ${status}`, 'gate:slow: success'],
      });
    },
  );

  test('een nieuwe lopende run maakt een eerder groene run opnieuw pending', () => {
    const newer = check({ id: 200, status: 'in_progress', conclusion: null });

    expect(checkProgress([...successfulChecks(), newer], REQUIRED)).toStrictEqual({
      state: 'pending',
      lines: ['gate:fast: in_progress', 'gate:slow: success'],
    });
  });

  test('een rode verplichte check blijft failure wanneer een andere check nog ontbreekt', () => {
    expect(checkProgress([check({ conclusion: 'failure' })], REQUIRED)).toStrictEqual({
      state: 'failure',
      lines: ['gate:fast: failure', 'gate:slow: ontbreekt'],
    });
  });

  test('groene checks op een vorige commit voldoen niet voor de huidige PR-head', () => {
    const checks = successfulChecks().map((item) => ({ ...item, headSha: OTHER_SHA }));

    expect(checkProgress(checks, REQUIRED)).toStrictEqual({
      state: 'pending',
      lines: ['gate:fast: ontbreekt', 'gate:slow: ontbreekt'],
    });
  });

  test('een latere run op een andere SHA verandert het bewijs voor deze SHA niet', () => {
    const otherHead = check({ id: 500, headSha: OTHER_SHA, conclusion: 'failure' });

    expect(checkProgress([...successfulChecks(), otherHead], REQUIRED).state).toBe('success');
  });

  test('gelijkende checknamen vervangen geen exacte verplichte check', () => {
    const checks = [check({ name: 'gate:fast-extra' }), check({ name: 'gate:slow' })];

    expect(checkProgress(checks, REQUIRED)).toStrictEqual({
      state: 'pending',
      lines: ['gate:fast: ontbreekt', 'gate:slow: success'],
    });
  });

  test.each([1, 15367, 15369])('gelijknamige app-id %s is een failure', (appId) => {
    const checks = [check({ appId }), check({ name: 'gate:slow' })];

    expect(checkProgress(checks, REQUIRED)).toStrictEqual({
      state: 'failure',
      lines: ['gate:fast: ongeldige check-identiteit', 'gate:slow: success'],
    });
  });

  test('een vervalste gelijknamige check wordt ook naast een echte groene check geweigerd', () => {
    const forged = check({ id: 50, appId: 1 });

    expect(checkProgress([forged, ...successfulChecks()], REQUIRED).state).toBe('failure');
  });

  test('een niet-verplichte rode check blokkeert de vereiste groene checks niet', () => {
    const optional = check({ name: 'optional', conclusion: 'failure', appId: 1 });

    expect(checkProgress([...successfulChecks(), optional], REQUIRED).state).toBe('success');
  });

  test.each([
    { names: [], sha: SHA },
    { names: REQUIRED.names, sha: '' },
    { names: REQUIRED.names, sha: 'a'.repeat(39) },
    { names: REQUIRED.names, sha: 'a'.repeat(41) },
    { names: REQUIRED.names, sha: 'g'.repeat(40) },
  ])('ongeldige verplichte checks of SHA leveren geen voortgangsbewijs', (required) => {
    expect(() => checkProgress(successfulChecks(), required)).toThrow();
  });
});

describe('labelScope: administratief label alleen binnen de eigenaarsscope', () => {
  test.each([
    'docs/framework.md',
    'docs/dod.md',
    'docs/roadmap.md',
    'docs/adr/0027-example.md',
    'docs/specs/example.md',
    'AGENTS.md',
    'CLAUDE.md',
    'README.md',
    'CHANGELOG.md',
  ])('docs-scope omvat %s', (file) => {
    expect(labelScope([change(file)], 'docs')).toBe(true);
  });

  test('meerdere documentwijzigingen vallen samen onder docs-scope', () => {
    const changes = [
      change('docs/framework.md'),
      change('docs/specs/example.md', { status: 'A' }),
      change('AGENTS.md'),
    ];

    expect(labelScope(changes, 'docs')).toBe(true);
  });

  test.each([
    'src/core/web/ui/example.tsx',
    '.claude/gates.json',
    '.claude/decisions.json',
    '.github/workflows/guard.yml',
    'scripts/kit/check-document-status.mjs',
    'package.json',
    'test/hooks/pr-evidence.test.ts',
    'docs/reference.png',
    'docs/reference.mdx',
    'other-document.md',
    'scripts/README.md',
  ])('een gemengde PR met %s valt buiten docs-scope', (file) => {
    const changes = [change('docs/framework.md'), change(file)];

    expect(labelScope(changes, 'docs')).toBe(false);
    expect(labelScope(changes, 'all')).toBe(true);
  });

  test('all-scope omvat een gatewijziging aan code, bewaking en documentatie samen', () => {
    const changes = [change('src/core/shared/example.ts'), change('.claude/gates.json'), change('docs/framework.md')];

    expect(labelScope(changes, 'all')).toBe(true);
  });

  test('een rename tussen twee documenten blijft binnen docs-scope', () => {
    const renamed = change('docs/specs/new.md', { status: 'R100', van: 'docs/specs/old.md' });

    expect(labelScope([renamed], 'docs')).toBe(true);
  });

  test.each([
    { pad: 'docs/check.md', van: 'scripts/check.mjs' },
    { pad: 'scripts/check.mjs', van: 'docs/check.md' },
    { pad: 'docs/check.md', van: '.claude/gates.json' },
    { pad: '.claude/gates.json', van: 'docs/check.md' },
  ])('rename $van naar $pad controleert bron en bestemming', ({ pad, van }) => {
    const renamed = change(pad, { status: 'R100', van });

    expect(labelScope([renamed], 'docs')).toBe(false);
    expect(labelScope([renamed], 'all')).toBe(true);
  });

  test('een gekopieerd document met een codebron is ook geen zuivere docs-wijziging', () => {
    const copied = change('docs/reference.md', { status: 'C100', van: 'scripts/reference.mjs' });

    expect(labelScope([copied], 'docs')).toBe(false);
  });

  test('verwijderde gatecode kan niet achter een toegevoegde spec worden verborgen', () => {
    const changes = [
      change('docs/specs/example.md', { status: 'A' }),
      change('scripts/kit/check.mjs', { status: 'D' }),
    ];

    expect(labelScope(changes, 'docs')).toBe(false);
    expect(labelScope(changes, 'all')).toBe(true);
  });

  test.each(['', 'DOCS', 'docs-only', 'all-gates', 'none', ' docs ', 'all '])(
    'onbekende policy %j geeft geen labelmandaat',
    (policy) => {
      expect(labelScope([change('docs/framework.md')], policy)).toBe(false);
    },
  );

  test.each(['docs', 'all'])('een lege diff krijgt ook bij policy %s geen labelmandaat', (policy) => {
    expect(labelScope([], policy)).toBe(false);
  });
});
