import { afterAll, describe, expect, test } from 'vitest';
import { Browser, latestMailTo, uniqueEmail } from '../auth/harness.ts';
import { inviteUser } from '../../src/core/api/auth/index.ts';
import { MAX_NAME_LENGTH } from '../../src/shared/limits.ts';
import { createAccountTestApp, json, NEW_PASSWORD, PASSWORD } from './account-harness.ts';

// Spec eigen-account: naam en wachtwoord door de hele pipeline, tegen de echte database (`pnpm test:db`).
const t = createAccountTestApp();
afterAll(async () => {
  await t.close();
});

describe('PATCH /api/me (naam)', () => {
  test('AC-2: een user wijzigt zijn naam; /api/me toont de nieuwe naam', async () => {
    const { browser } = await t.account('user', 'Oude Naam');
    const response = await t.call(browser, 'PATCH /api/me', { naam: '  Nieuwe Naam  ' });

    expect([response.status, await json(response)]).toStrictEqual([200, null]);
    expect(await json(await browser.get('/api/me'))).toMatchObject({ naam: 'Nieuwe Naam' });
  });

  test('niet ingelogd: 401 UNAUTHENTICATED', async () => {
    const response = await t.call(new Browser(t.app), 'PATCH /api/me', { naam: 'Iemand' });

    expect([response.status, await json(response)]).toMatchObject([401, { code: 'UNAUTHENTICATED' }]);
  });

  test('admin zonder MFA: 403 MFA_REQUIRED en de naam blijft', async () => {
    const { browser, userId } = await t.account('admin', 'Beheerder Een');
    const response = await t.call(browser, 'PATCH /api/me', { naam: 'Andere Naam' });

    expect([response.status, await json(response)]).toMatchObject([403, { code: 'MFA_REQUIRED' }]);
    const { rows } = await t.authDb.query<{ name: string }>('select name from "user" where id = $1', [userId]);
    expect(rows[0]?.name).toBe('Beheerder Een');
  });

  test.each([
    ['leeg', { naam: '   ' }],
    ['te lang', { naam: 'a'.repeat(MAX_NAME_LENGTH + 1) }],
    ['onbekend veld (image)', { naam: 'Iemand', image: 'https://example.test/x.png' }],
    ['een ander account via de invoer', { naam: 'Iemand', id: 'ander' }],
  ])('ongeldige invoer (%s): 400 VALIDATION', async (_, body) => {
    const { browser } = await t.account('user');
    const response = await t.call(browser, 'PATCH /api/me', body);

    expect([response.status, await json(response)]).toMatchObject([400, { code: 'VALIDATION' }]);
  });

  test('POST /api/auth/update-user is dicht (404)', async () => {
    const { browser } = await t.account('user');
    const response = await browser.post('/api/auth/update-user', { name: 'Via Better Auth' });

    expect(response.status).toBe(404);
  });
});

describe('POST /api/auth/change-password', () => {
  test('AC-3: andere sessie weg, zelf ingelogd, geen token in het antwoord, alleen het nieuwe wachtwoord werkt', async () => {
    const { browser, email } = await t.account('user');
    const other = await t.signIn(email);

    const response = await browser.post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      revokeOtherSessions: true,
    });
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ user: { email } });
    expect(body).not.toHaveProperty('token');
    expect((await browser.get('/api/me')).status).toBe(200);
    expect((await other.get('/api/me')).status).toBe(401);
    await expect(t.signIn(email, PASSWORD)).rejects.toThrow();
    await expect(t.signIn(email, NEW_PASSWORD)).resolves.toBeInstanceOf(Browser);
  });

  test('AC-4: admin met MFA: nieuwe sessie mfa met dezelfde createdAt; /api/accounts zonder nieuwe code', async () => {
    const { browser, userId } = await t.account('admin');
    await t.enableTotp(browser);
    const before = (await t.sessionsOf(userId)).find((session) => session.session_strength === 'mfa');
    expect(before).toBeDefined();

    const response = await browser.post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      revokeOtherSessions: true,
    });
    expect(response.status).toBe(200);

    const after = await t.sessionsOf(userId);
    expect(after).toHaveLength(1);
    expect(after[0]?.token).not.toBe(before?.token);
    expect(after[0]?.session_strength).toBe('mfa');
    expect(after[0]?.createdAt.toISOString()).toBe(before?.createdAt.toISOString());
    expect((await browser.get('/api/accounts')).status).toBe(200);
  });

  test('AC-5: fout huidig wachtwoord: INVALID_PASSWORD (WRONG_PASSWORD in de app) en niets gewijzigd', async () => {
    const { browser, email } = await t.account('user');
    const other = await t.signIn(email);
    const response = await browser.post('/api/auth/change-password', {
      currentPassword: NEW_PASSWORD,
      newPassword: 'ef-'.repeat(6),
      revokeOtherSessions: true,
    });

    expect([response.status, await json(response)]).toMatchObject([400, { code: 'INVALID_PASSWORD' }]);
    expect((await other.get('/api/me')).status).toBe(200);
    await expect(t.signIn(email, PASSWORD)).resolves.toBeInstanceOf(Browser);
  });

  test.each([
    ['zonder revokeOtherSessions', {}],
    ['met revokeOtherSessions false', { revokeOtherSessions: false }],
  ])('AC-12: %s: 400 VALIDATION; wachtwoord en andere sessies ongewijzigd', async (_, extra) => {
    const { browser, email } = await t.account('user');
    const other = await t.signIn(email);
    const response = await browser.post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      ...extra,
    });

    expect([response.status, await json(response)]).toMatchObject([400, { code: 'VALIDATION' }]);
    expect((await other.get('/api/me')).status).toBe(200);
    await expect(t.signIn(email, PASSWORD)).resolves.toBeInstanceOf(Browser);
  });

  test('AC-14: gebruiker met TOTP en een password-sessie: 403 MFA_REQUIRED en niets gewijzigd', async () => {
    const { browser, email, userId } = await t.account('user');
    await t.enableTotp(browser);
    await t.authDb.query(`update session set session_strength = 'password' where "userId" = $1`, [userId]);
    const sessions = await t.sessionsOf(userId);

    const response = await browser.post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      revokeOtherSessions: true,
    });

    expect([response.status, await json(response)]).toMatchObject([403, { code: 'MFA_REQUIRED' }]);
    expect(await t.sessionsOf(userId)).toStrictEqual(sessions);
    const signIn = await new Browser(t.app).post('/api/auth/sign-in/email', { email, password: PASSWORD });
    expect(await json(signIn)).toMatchObject({ twoFactorRedirect: true });
  });

  test('te kort nieuw wachtwoord: 400 PASSWORD_TOO_SHORT (VALIDATION in de app)', async () => {
    const { browser } = await t.account('user');
    const response = await browser.post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'kort',
      revokeOtherSessions: true,
    });

    expect([response.status, await json(response)]).toMatchObject([400, { code: 'PASSWORD_TOO_SHORT' }]);
  });

  test('niet ingelogd: 401', async () => {
    const response = await new Browser(t.app).post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      revokeOtherSessions: true,
    });

    expect(response.status).toBe(401);
  });

  test('te veel pogingen met een fout wachtwoord: 429 (3 per 10 s per IP en pad)', async () => {
    const { browser } = await t.account('user');
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await browser.post('/api/auth/change-password', {
        currentPassword: NEW_PASSWORD,
        newPassword: 'ef-'.repeat(6),
        revokeOtherSessions: true,
      });
      statuses.push(response.status);
    }

    expect(statuses).toStrictEqual([400, 400, 400, 429]);
  });
});

describe('dichte paden (AC-13)', () => {
  test.each(['/update-session', '/list-sessions', '/revoke-session', '/revoke-sessions', '/revoke-other-sessions'])(
    'POST /api/auth%s met een sessie: 404',
    async (path) => {
      const { browser } = await t.account('user');
      const response = await browser.post(`/api/auth${path}`, {});

      expect(response.status).toBe(404);
    },
  );

  test('GET /api/auth/verify-email: 404', async () => {
    const response = await new Browser(t.app).get('/api/auth/verify-email?token=x');

    expect(response.status).toBe(404);
  });

  test('anoniem: send-verification-email voor een uitgenodigd account geeft 404 en geen mail', async () => {
    const email = uniqueEmail('uitgenodigd');
    await inviteUser(t.auth, { name: 'Uitgenodigd', email });
    const invitation = await latestMailTo(email);

    const response = await new Browser(t.app).post('/api/auth/send-verification-email', { email });

    expect(response.status).toBe(404);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect((await latestMailTo(email)).subject).toBe(invitation.subject);
  });
});
