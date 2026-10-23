import { describe, expect, test } from 'vitest';
import { checkedCommit } from '../../rails/hooks/lib/built-evidence.mjs';
import { checkProgress } from '../../scripts/kit/pr-verify.mjs';

type CheckRun = Parameters<typeof checkProgress>[0][number];
const SHA = 'a'.repeat(40);
const JOB = 'codeql (javascript-typescript)';
const REQUIRED = { names: [JOB], sha: SHA };
const ANALYSIS: CheckRun = {
  id: 1,
  name: JOB,
  headSha: SHA,
  status: 'completed',
  conclusion: 'success',
  appId: 15368,
};

function result(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    id: 2,
    name: 'CodeQL',
    headSha: SHA,
    status: 'completed',
    conclusion: 'success',
    appId: 57789,
    ...overrides,
  };
}

describe('CodeQL-resultaten tellen mee naast het slagen van de analysejob', () => {
  test('een bevinding blokkeert zowel opleveren als bouwbewijs, ook als de analysejob groen is', () => {
    const checks = [ANALYSIS, result({ conclusion: 'failure' })];

    expect(checkedCommit(checks, REQUIRED)).toBe(false);
    expect(checkProgress(checks, REQUIRED)).toEqual({
      state: 'failure',
      lines: [`${JOB}: success`, 'CodeQL: failure'],
    });
  });

  test('een nog niet gepubliceerde resultaatcheck voorkomt een voortijdige groene uitslag', () => {
    expect(checkedCommit([ANALYSIS], REQUIRED)).toBe(false);
    expect(checkProgress([ANALYSIS], REQUIRED)).toEqual({
      state: 'pending',
      lines: [`${JOB}: success`, 'CodeQL: ontbreekt'],
    });
  });

  test('de analysejob en een schoon resultaat op dezelfde commit leveren samen bewijs', () => {
    const checks = [ANALYSIS, result()];

    expect(checkedCommit(checks, REQUIRED)).toBe(true);
    expect(checkProgress(checks, REQUIRED)).toEqual({
      state: 'success',
      lines: [`${JOB}: success`, 'CodeQL: success'],
    });
  });

  test.each([
    { name: 'lopend resultaat', change: { status: 'in_progress', conclusion: null } },
    { name: 'overgeslagen resultaat', change: { conclusion: 'skipped' } },
    { name: 'geannuleerd resultaat', change: { conclusion: 'cancelled' } },
    { name: 'andere commit', change: { headSha: 'b'.repeat(40) } },
    { name: 'verkeerde app', change: { appId: 1 } },
  ])('$name geeft geen bouwbewijs', ({ change }) => {
    const checks = [ANALYSIS, result(change)];

    expect(checkedCommit(checks, REQUIRED)).toBe(false);
    expect(checkProgress(checks, REQUIRED).state).not.toBe('success');
  });

  test('de nieuwste resultaatrun beslist; een oude groene uitslag verbergt geen nieuwe fout', () => {
    const checks = [ANALYSIS, result(), result({ id: 3, conclusion: 'failure' })];

    expect(checkedCommit(checks, REQUIRED)).toBe(false);
    expect(checkProgress(checks, REQUIRED).state).toBe('failure');
  });

  test('een nieuw schoon resultaat herstelt een oude bevinding', () => {
    const checks = [ANALYSIS, result({ conclusion: 'failure' }), result({ id: 3 })];

    expect(checkedCommit(checks, REQUIRED)).toBe(true);
    expect(checkProgress(checks, REQUIRED).state).toBe('success');
  });

  test('een aanwezige CodeQL-bevinding wordt ook zonder vermelding in het register geweigerd', () => {
    const required = { names: ['gate:fast'], sha: SHA };
    const checks = [{ ...ANALYSIS, name: 'gate:fast' }, result({ conclusion: 'failure' })];

    expect(checkedCommit(checks, required)).toBe(false);
    expect(checkProgress(checks, required).state).toBe('failure');
  });
});
