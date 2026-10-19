import { afterAll, expect, test } from 'vitest';
import { SESSION_ABSOLUTE_SECONDS } from '../../src/core/shared/limits.ts';
import { createAccountTestApp, NEW_PASSWORD, PASSWORD } from '../api/account-harness.ts';

const t = createAccountTestApp();
afterAll(() => t.close());

// Laat de sessie bewust staan: dit is de toestand na een mislukte revokeAll na de block-commit.
async function blocked() {
  const account = await t.account('user');
  await t.migrator.query('update better_auth."user" set blocked_at = now() where id = $1', [account.userId]);
  return account;
}

test('get-session geeft voor een geblokkeerd account geen sessie of token terug en wist de cookie', async () => {
  const account = await blocked();
  const response = await account.browser.get('/api/auth/get-session');
  expect(response.status).toBe(200);
  expect(await response.json()).toBeNull();
  expect(account.browser.cookies.has('__Host-auth.session_token')).toBe(false);
  expect(await t.sessionsOf(account.userId)).toHaveLength(0);
});

test('een geblokkeerde sessie kan het wachtwoord niet meer wijzigen via Better Auth', async () => {
  const account = await blocked();
  const response = await account.browser.post('/api/auth/change-password', {
    currentPassword: PASSWORD,
    newPassword: NEW_PASSWORD,
    revokeOtherSessions: true,
  });
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  await t.migrator.query('update better_auth."user" set blocked_at = null where id = $1', [account.userId]);
  await expect(t.signIn(account.email, PASSWORD)).resolves.toBeDefined();
});

test('ook een pluginroute weigert de sessie wanneer de opruiming nog steeds faalt', async () => {
  const account = await blocked();
  const lock = await t.migrator.connect();
  try {
    await lock.query('begin');
    await lock.query('select id from better_auth.session where "userId" = $1 for update', [account.userId]);
    const response = await account.browser.post('/api/auth/two-factor/enable', { password: PASSWORD });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(account.browser.cookies.has('__Host-auth.session_token')).toBe(false);
    expect(await t.sessionsOf(account.userId)).toHaveLength(1);
    const user = await t.authDb.query<{ twoFactorEnabled: boolean | null }>(
      'select "twoFactorEnabled" from "user" where id = $1',
      [account.userId],
    );
    expect(user.rows[0]?.twoFactorEnabled).not.toBe(true);
  } finally {
    await lock.query('rollback');
    lock.release();
  }
}, 20000);

test('get-session verlengt een absoluut verlopen sessie niet en geeft null terug', async () => {
  const account = await t.account('user');
  const [session] = await t.sessionsOf(account.userId);
  await t.ageSession(session?.token ?? '', SESSION_ABSOLUTE_SECONDS + 1);
  const response = await account.browser.get('/api/auth/get-session');
  expect(response.status).toBe(200);
  expect(await response.json()).toBeNull();
  expect(account.browser.cookies.has('__Host-auth.session_token')).toBe(false);
  expect(await t.sessionsOf(account.userId)).toHaveLength(0);
});

test('een absoluut verlopen sessie kan geen TOTP inschrijven', async () => {
  const account = await t.account('user');
  const [session] = await t.sessionsOf(account.userId);
  await t.ageSession(session?.token ?? '', SESSION_ABSOLUTE_SECONDS + 1);
  const response = await account.browser.post('/api/auth/two-factor/enable', { password: PASSWORD });
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
});

test('een geldige sessie kan de directe auth-routes blijven gebruiken en uitloggen', async () => {
  const account = await t.account('user');
  const response = await account.browser.get('/api/auth/get-session');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ user: { id: account.userId } });
  await t.enableTotp(account.browser);
  expect((await account.browser.post('/api/auth/sign-out')).status).toBe(200);
  expect(await t.sessionsOf(account.userId)).toHaveLength(0);
});

test('opnieuw inloggen op een ander account blijft mogelijk met een oude geblokkeerde cookie', async () => {
  const previous = await blocked();
  const next = await t.account('user');
  const response = await previous.browser.post('/api/auth/sign-in/email', { email: next.email, password: PASSWORD });
  expect(response.status).toBe(200);
  const session = await previous.browser.get('/api/auth/get-session');
  expect(await session.json()).toMatchObject({ user: { id: next.userId } });
});

test('get-session blijft null geven als de sessierij nog niet kan worden verwijderd', async () => {
  const account = await blocked();
  const lock = await t.migrator.connect();
  try {
    await lock.query('begin');
    await lock.query('select id from better_auth.session where "userId" = $1 for update', [account.userId]);
    const response = await account.browser.get('/api/auth/get-session');
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
    expect(account.browser.cookies.has('__Host-auth.session_token')).toBe(false);
    expect(await t.sessionsOf(account.userId)).toHaveLength(1);
  } finally {
    await lock.query('rollback');
    lock.release();
  }
}, 20000);
