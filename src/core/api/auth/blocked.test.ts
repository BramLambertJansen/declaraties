import { describe, expect, test, vi } from 'vitest';
import { APIError } from 'better-auth/api';
import type { Pool } from 'pg';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import { authGateway, type Auth } from './auth.ts';
import { createAuthOptions } from './options.ts';

// ADR 0026: een geblokkeerd account heeft geen sessie (authGateway.getSession) en krijgt er geen nieuwe (session.create.before).
const USER_ID = '0192f0a0-0000-7000-8000-000000000001';
const NOW = Date.parse('2026-10-12T12:00:00Z');

function fakeAuth(blockedAt: Date | null) {
  const deleteUserSessions = vi.fn(() => Promise.resolve());
  const deleteSession = vi.fn(() => Promise.resolve());
  const response = {
    session: { id: 'sess-1', token: 'tok', createdAt: new Date(NOW - 1000), sessionStrength: 'mfa' },
    user: { id: USER_ID, name: 'Bea', email: 'bea@example.com', blockedAt },
  };
  const auth = {
    api: { getSession: () => Promise.resolve({ headers: new Headers(), response }) },
    $context: Promise.resolve({ internalAdapter: { deleteUserSessions, deleteSession } }),
  };
  return { auth, deleteUserSessions };
}

describe('authGateway.getSession bij een geblokkeerd account', () => {
  test('geeft geen sessie en trekt alle sessies van de gebruiker in', async () => {
    const { auth, deleteUserSessions } = fakeAuth(new Date(NOW - 5000));
    const gateway = authGateway(
      unsafeCast<Auth>(auth, 'fake met alleen de methoden die authGateway gebruikt'),
      () => NOW,
    );

    const result = await gateway.getSession(new Headers());

    expect(result.session).toBeNull();
    expect(deleteUserSessions).toHaveBeenCalledExactlyOnceWith(USER_ID);
  });

  test('laat een niet-geblokkeerde gebruiker door, zonder sessies in te trekken', async () => {
    const { auth, deleteUserSessions } = fakeAuth(null);
    const gateway = authGateway(
      unsafeCast<Auth>(auth, 'fake met alleen de methoden die authGateway gebruikt'),
      () => NOW,
    );

    const result = await gateway.getSession(new Headers());

    expect(result.session).toMatchObject({ userId: USER_ID, sessionId: 'sess-1', sessionStrength: 'mfa' });
    expect(deleteUserSessions).not.toHaveBeenCalled();
  });
});

describe('session.create.before (refuseBlockedUser)', () => {
  const options = createAuthOptions(
    { origin: 'http://localhost:5173', secret: 'x'.repeat(40), sendInvitation: () => Promise.resolve() },
    unsafeCast<Pool>({}, 'createAuthOptions opent zelf geen verbinding'),
  );
  const before = options.databaseHooks.session.create.before;
  const contextFor = (user: object | null) => ({
    context: { internalAdapter: { findUserById: () => Promise.resolve(user) } },
  });

  test('weigert een geblokkeerde gebruiker met APIError ACCOUNT_BLOCKED', async () => {
    const blocked = contextFor({ id: USER_ID, blockedAt: new Date(NOW) });

    const result = await before({ userId: USER_ID }, blocked).catch((error: unknown) => error);

    expect(result).toBeInstanceOf(APIError);
    expect(result).toMatchObject({ body: { code: 'ACCOUNT_BLOCKED' } });
  });

  test('laat door zonder context (scripts)', async () => {
    await expect(before({ userId: USER_ID }, null)).resolves.toBeUndefined();
  });

  test('laat een niet-geblokkeerde gebruiker door', async () => {
    await expect(before({ userId: USER_ID }, contextFor({ id: USER_ID, blockedAt: null }))).resolves.toBeUndefined();
  });
});
