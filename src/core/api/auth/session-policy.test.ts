import { describe, expect, test } from 'vitest';
import { SESSION_ABSOLUTE_SECONDS } from '../../shared/limits.ts';
import { accountRejection, sessionRejection, sessionVersion } from './session-policy.ts';

test('de absolute grens behoudt de bestaande strikte vergelijking op milliseconden', () => {
  const createdAt = new Date('2026-10-01T00:00:00Z');
  const boundary = createdAt.getTime() + SESSION_ABSOLUTE_SECONDS * 1000;
  const facts = { session: { createdAt }, user: { blockedAt: null } };
  expect(sessionRejection(facts, boundary - 1)).toBeNull();
  expect(sessionRejection(facts, boundary)).toBeNull();
  expect(sessionRejection(facts, boundary + 1)).toBe('expired');
});

test('een blokkade wordt ook bij een zojuist gemaakte sessie geweigerd', () => {
  const createdAt = new Date();
  const session = { createdAt };
  expect(sessionRejection({ session, user: {} }, createdAt.getTime())).toBeNull();
  expect(sessionRejection({ session, user: { blockedAt: null } }, createdAt.getTime())).toBeNull();
  expect(sessionRejection({ session, user: { blockedAt: createdAt } }, createdAt.getTime())).toBe('blocked');
});

const NOW = Date.parse('2026-10-22T12:00:00.000Z');

describe('sessiegeneraties', () => {
  test.each([
    [{}, 0],
    [{ sessionVersion: 0 }, 0],
    [{ sessionVersion: 4 }, 4],
    [{ sessionVersion: Number.MAX_SAFE_INTEGER }, Number.MAX_SAFE_INTEGER],
    [{ sessionVersion: -1 }, -1],
    [{ sessionVersion: 1.5 }, -1],
    [{ sessionVersion: Number.NaN }, -1],
    [{ sessionVersion: Number.POSITIVE_INFINITY }, -1],
    [{ sessionVersion: Number.MAX_SAFE_INTEGER + 1 }, -1],
    [{ sessionVersion: '1' }, -1],
    [{ sessionVersion: null }, -1],
    [{ sessionVersion: undefined }, -1],
  ] as const)('leest %j als %s', (value, expected) => {
    expect(sessionVersion(value)).toBe(expected);
  });
});

describe('onafhankelijke accountmaatregelen', () => {
  test.each([
    [{}, null],
    [{ blockedAt: null, deactivatedAt: null }, null],
    [{ blockedAt: undefined, deactivatedAt: undefined }, null],
    [{ blockedAt: new Date(NOW) }, 'blocked'],
    [{ deactivatedAt: new Date(NOW) }, 'deactivated'],
    [{ blockedAt: new Date(NOW), deactivatedAt: new Date(NOW) }, 'blocked'],
  ] as const)('weigert %j met reden %s', (user, expected) => {
    expect(accountRejection(user)).toBe(expected);
  });
});

describe('sessietoegang', () => {
  test('een nog geldige bestaande sessie zonder versiekolommen blijft bruikbaar', () => {
    expect(sessionRejection({ session: { createdAt: new Date(NOW) }, user: {} }, NOW)).toBeNull();
  });

  test('gelijke nieuwe generaties zijn bruikbaar; een oude generatie is ingetrokken', () => {
    const session = { createdAt: new Date(NOW), sessionVersion: 2 };

    expect(sessionRejection({ session, user: { sessionVersion: 2 } }, NOW)).toBeNull();
    expect(sessionRejection({ session, user: { sessionVersion: 3 } }, NOW)).toBe('revoked');
  });

  test('ook een ongeldige maar aan beide kanten gelijke generatie is geweigerd', () => {
    const session = { createdAt: new Date(NOW), sessionVersion: -1 };

    expect(sessionRejection({ session, user: { sessionVersion: -1 } }, NOW)).toBe('revoked');
  });

  test('maatregelen worden direct toegepast op een sessie met de huidige generatie', () => {
    const session = { createdAt: new Date(NOW), sessionVersion: 2 };

    expect(sessionRejection({ session, user: { sessionVersion: 2, blockedAt: new Date(NOW) } }, NOW)).toBe('blocked');
    expect(sessionRejection({ session, user: { sessionVersion: 2, deactivatedAt: new Date(NOW) } }, NOW)).toBe(
      'deactivated',
    );
  });

  test('de absolute eindtijd kent dezelfde grens op iedere ingang', () => {
    const createdAt = new Date(NOW - SESSION_ABSOLUTE_SECONDS * 1000);
    const facts = { session: { createdAt, sessionVersion: 2 }, user: { sessionVersion: 2 } };

    expect(sessionRejection(facts, NOW)).toBeNull();
    expect(sessionRejection(facts, NOW + 1)).toBe('expired');
  });
});
