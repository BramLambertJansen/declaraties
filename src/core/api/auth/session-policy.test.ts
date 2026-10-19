import { expect, test } from 'vitest';
import { SESSION_ABSOLUTE_SECONDS } from '../../shared/limits.ts';
import { sessionRejection } from './session-policy.ts';

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
