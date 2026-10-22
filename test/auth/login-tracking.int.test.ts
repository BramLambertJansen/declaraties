import { afterAll, describe, expect, test } from 'vitest';
import { inviteUser } from '../../src/core/api/auth/index.ts';
import { SESSION_IDLE_SECONDS, SESSION_REFRESH_SECONDS } from '../../src/core/shared/limits.ts';
import { accountsListContract } from '../../src/shared/contracts/accounts.ts';
import { createAccountTestApp, NEW_PASSWORD, PASSWORD } from '../api/account-harness.ts';
import { Browser, latestMailTo, tokenFrom, totp, uniqueEmail } from './harness.ts';

const setup = createAccountTestApp();
const HISTORICAL = new Date('2000-01-01T00:00:00.000Z');
afterAll(async () => {
  await setup.close();
});

async function lastLogin(userId: string): Promise<Date | null> {
  const result = await setup.authDb.query<{ last_login_at: Date | null }>(
    'select last_login_at from "user" where id = $1',
    [userId],
  );
  const user = result.rows[0];
  if (user === undefined) throw new Error('Testaccount ontbreekt');
  return user.last_login_at;
}

async function resetLogin(userId: string): Promise<void> {
  await setup.authDb.query('update "user" set last_login_at = $2 where id = $1', [userId, HISTORICAL]);
}

describe('account-lifecycle: laatste geslaagde login', () => {
  test('AC-1/3: uitnodiging heeft geen historie en de beheerder ziet null via het contract', async () => {
    const email = uniqueEmail('login-onbekend');
    const invitation = await inviteUser(setup.auth, { name: 'Zonder Login', email });
    await setup.migrator.query("select app.assign_role($1, 'user')", [invitation.userId]);
    const admin = await setup.account('admin', 'Loginhistorie Beheerder');
    await setup.enableTotp(admin.browser);

    expect(await lastLogin(invitation.userId)).toBeNull();
    const response = await admin.browser.get(`/api/accounts?q=${encodeURIComponent(email)}`);
    expect(response.status).toBe(200);
    expect(accountsListContract.output.parse(await response.json()).items).toMatchObject([
      { id: invitation.userId, laatstIngelogd: null },
    ]);
    const token = tokenFrom((await latestMailTo(email)).text);
    expect(
      (await new Browser(setup.app).post('/api/auth/reset-password', { token, newPassword: PASSWORD })).status,
    ).toBe(200);
    expect(await lastLogin(invitation.userId)).toBeNull();
  });

  test('AC-1/2: succesvol wachtwoord registreert een tijdstip; fout wachtwoord en sessie-opvragen doen dat niet', async () => {
    const target = await setup.account('user', 'Login Met Wachtwoord');
    expect(await lastLogin(target.userId)).toBeInstanceOf(Date);
    await resetLogin(target.userId);
    const failed = await new Browser(setup.app).post('/api/auth/sign-in/email', {
      email: target.email,
      password: 'fout-'.repeat(4),
    });
    expect(failed.status).toBe(401);
    expect(await lastLogin(target.userId)).toEqual(HISTORICAL);
    expect((await target.browser.get('/api/auth/get-session')).status).toBe(200);
    expect((await target.browser.get('/api/me')).status).toBe(200);
    expect(await lastLogin(target.userId)).toEqual(HISTORICAL);
    const session = (await setup.sessionsOf(target.userId)).at(-1);
    if (session === undefined) throw new Error('Testsessie ontbreekt');
    await setup.ageSession(session.token, SESSION_REFRESH_SECONDS + 60);
    await setup.authDb.query('update session set "expiresAt" = now() + make_interval(secs => $2) where token = $1', [
      session.token,
      SESSION_IDLE_SECONDS - SESSION_REFRESH_SECONDS - 60,
    ]);
    const beforeRefresh = Date.now();
    expect((await target.browser.get('/api/auth/get-session')).status).toBe(200);
    const refreshed = await setup.authDb.query<{ updatedAt: Date }>(
      'select "updatedAt" from session where token = $1',
      [session.token],
    );
    expect(refreshed.rows[0]?.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeRefresh);
    expect(await lastLogin(target.userId)).toEqual(HISTORICAL);

    const before = Date.now();
    const signedIn = await new Browser(setup.app).post('/api/auth/sign-in/email', {
      email: target.email,
      password: PASSWORD,
    });
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).not.toHaveProperty('user.lastLoginAt');
    const recorded = await lastLogin(target.userId);
    expect(recorded?.getTime()).toBeGreaterThanOrEqual(before);
    expect(recorded?.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('AC-2: bij MFA tellen wachtwoord en mislukte code niet; de geslaagde code wel', async () => {
    const target = await setup.account('user', 'Login Met MFA');
    const uri = await setup.enableTotp(target.browser);
    await resetLogin(target.userId);
    const browser = new Browser(setup.app);
    const password = await browser.post('/api/auth/sign-in/email', { email: target.email, password: PASSWORD });
    expect(await password.json()).toMatchObject({ twoFactorRedirect: true });
    expect(await lastLogin(target.userId)).toEqual(HISTORICAL);
    const wrong = totp(uri) === '000000' ? '111111' : '000000';
    expect((await browser.post('/api/auth/two-factor/verify-totp', { code: wrong })).status).toBe(401);
    expect(await lastLogin(target.userId)).toEqual(HISTORICAL);

    const before = Date.now();
    expect((await browser.post('/api/auth/two-factor/verify-totp', { code: totp(uri) })).status).toBe(200);
    expect((await lastLogin(target.userId))?.getTime()).toBeGreaterThanOrEqual(before);
  });

  test('AC-2: een nieuwe beheerder registreert pas een login na voltooide MFA-inschrijving', async () => {
    const admin = await setup.account('admin', 'Login MFA Nog Instellen');

    expect(await lastLogin(admin.userId)).toBeNull();
    expect((await admin.browser.get('/api/auth/get-session')).status).toBe(200);
    expect(await lastLogin(admin.userId)).toBeNull();
    const before = Date.now();
    await setup.enableTotp(admin.browser);
    expect((await lastLogin(admin.userId))?.getTime()).toBeGreaterThanOrEqual(before);
  });

  test('AC-2/4/5: een oude MFA-challenge wordt na blokkeren en herstel geweigerd', async () => {
    const admin = await setup.account('admin', 'Login Challenge Beheerder');
    await setup.enableTotp(admin.browser);
    const target = await setup.account('user', 'Login Verouderde Challenge');
    const uri = await setup.enableTotp(target.browser);
    await resetLogin(target.userId);
    const browser = new Browser(setup.app);
    const started = await browser.post('/api/auth/sign-in/email', { email: target.email, password: PASSWORD });
    expect(await started.json()).toMatchObject({ twoFactorRedirect: true });
    expect((await setup.call(admin.browser, `POST /api/accounts/${target.userId}/block`, {})).status).toBe(200);
    expect((await setup.call(admin.browser, `POST /api/accounts/${target.userId}/unblock`, {})).status).toBe(200);

    const oldChallenge = await browser.post('/api/auth/two-factor/verify-totp', { code: totp(uri) });
    expect(oldChallenge.status).toBeGreaterThanOrEqual(400);
    expect(oldChallenge.status).toBeLessThan(500);
    expect(await (await browser.get('/api/auth/get-session')).json()).toBeNull();
    expect(await lastLogin(target.userId)).toEqual(HISTORICAL);

    const fresh = new Browser(setup.app);
    const password = await fresh.post('/api/auth/sign-in/email', { email: target.email, password: PASSWORD });
    expect(await password.json()).toMatchObject({ twoFactorRedirect: true });
    expect((await fresh.post('/api/auth/two-factor/verify-totp', { code: totp(uri) })).status).toBe(200);
    expect((await fresh.get('/api/me')).status).toBe(200);
    expect((await lastLogin(target.userId))?.getTime()).toBeGreaterThan(HISTORICAL.getTime());
  });

  test.each([
    ['deactivate', 'activate'],
    ['block', 'unblock'],
  ])('AC-4/10: een gepauzeerde login kan %s en %s niet passeren', async (disable, restore) => {
    const admin = await setup.account('admin', 'Login Pauze Beheerder');
    await setup.enableTotp(admin.browser);
    const target = await setup.account('user', 'Login Pauze Doel');
    await resetLogin(target.userId);
    const hooks = setup.auth.options.databaseHooks.session.create;
    const original = hooks.before;
    const reached = Promise.withResolvers<undefined>();
    const resume = Promise.withResolvers<undefined>();
    const browser = new Browser(setup.app);
    hooks.before = async (session, context) => {
      const result = await original(session, context);
      if (session.userId === target.userId) {
        reached.resolve(undefined);
        await resume.promise;
      }
      return result;
    };
    const login = browser.post('/api/auth/sign-in/email', { email: target.email, password: PASSWORD });
    try {
      await Promise.race([
        reached.promise,
        login.then(() => {
          throw new Error('De login bereikte de ingestelde sessiepauze niet');
        }),
      ]);
      expect((await setup.call(admin.browser, `POST /api/accounts/${target.userId}/${disable}`, {})).status).toBe(200);
      expect((await setup.call(admin.browser, `POST /api/accounts/${target.userId}/${restore}`, {})).status).toBe(200);
      resume.resolve(undefined);
      const result = await login;

      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.status).toBeLessThan(500);
      expect(await lastLogin(target.userId)).toEqual(HISTORICAL);
      expect(await (await browser.get('/api/auth/get-session')).json()).toBeNull();
      expect((await browser.get('/api/me')).status).toBe(401);
    } finally {
      resume.resolve(undefined);
      hooks.before = original;
      await login;
    }
    expect((await (await setup.signIn(target.email)).get('/api/me')).status).toBe(200);
  });

  test('AC-2/3: wachtwoordwijziging en uitloggen bewaren de laatste login', async () => {
    const target = await setup.account('user', 'Login Behouden');
    await resetLogin(target.userId);
    const changed = await target.browser.post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      revokeOtherSessions: true,
    });
    expect(changed.status).toBe(200);
    expect(await lastLogin(target.userId)).toEqual(HISTORICAL);
    expect((await target.browser.post('/api/auth/sign-out')).status).toBe(200);
    expect(await lastLogin(target.userId)).toEqual(HISTORICAL);
  });

  test('AC-10: de server neemt bij een login nooit een ouder tijdstip over', async () => {
    const target = await setup.account('user', 'Login Monotoon');
    const future = new Date(Date.now() + 60_000);
    await setup.authDb.query('update "user" set last_login_at = $2 where id = $1', [target.userId, future]);
    await Promise.all([setup.signIn(target.email), setup.signIn(target.email)]);

    expect(await lastLogin(target.userId)).toEqual(future);
  });

  test('AC-10: profielinvoer kan geen login- of statusvelden wijzigen', async () => {
    const target = await setup.account('user', 'Login Niet Zelfbewerkbaar');
    const original = await lastLogin(target.userId);
    const response = await setup.call(target.browser, 'PATCH /api/me', {
      naam: 'Andere Naam',
      lastLoginAt: HISTORICAL.toISOString(),
      deactivatedAt: null,
      sessionVersion: 99,
    });

    expect(response.status).toBe(400);
    expect(await lastLogin(target.userId)).toEqual(original);
    expect((await target.browser.get('/api/accounts')).status).toBe(403);
  });
});
