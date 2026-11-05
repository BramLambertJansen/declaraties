import { describe, expect, test } from 'vitest';
import { checkProgress } from '../../scripts/kit/pr-verify.mjs';

type CheckRun = Parameters<typeof checkProgress>[0][number];

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
