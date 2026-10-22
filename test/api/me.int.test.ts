import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, describe, expect, test } from 'vitest';
import { inviteUser } from '../../src/core/api/auth/index.ts';
import { AppError } from '../../src/core/api/errors.ts';
import { Browser, createTestApp, latestMailTo, required, tokenFrom, totp, uniqueEmail } from '../auth/harness.ts';
import { UserId } from '../../src/core/shared/ids.ts';

// GET /api/me door de hele pipeline (spec accountbeheer; framework §6): sessie uit Better Auth, rol uit user_roles,
// can() met de MFA-eis, output volgens het contract. Tegen de echte database, via `pnpm test:db`.
const PASSWORD = 'ab-'.repeat(6);
const { auth, app, pool, withUser } = createTestApp();
const migrator = new pg.Pool({ connectionString: required('MIGRATOR_DATABASE_URL'), max: 1 });
const authDb = new pg.Pool({ connectionString: required('AUTH_DATABASE_URL'), max: 1 });
afterAll(async () => {
  await Promise.all([pool.end(), migrator.end(), authDb.end()]);
});

async function signedIn(
  role: 'user' | 'admin' | null,
  name = 'Iemand',
): Promise<{ browser: Browser; userId: UserId; email: string }> {
  const email = uniqueEmail(role ?? 'zonder-rol');
  const { userId } = await inviteUser(auth, { name, email });
  if (role !== null) await migrator.query('select app.assign_role($1, $2)', [userId, role]);
  const token = tokenFrom((await latestMailTo(email)).text);
  const browser = new Browser(app);
  await browser.post('/api/auth/reset-password', { token, newPassword: PASSWORD });
  await browser.post('/api/auth/sign-in/email', { email, password: PASSWORD });
  return { browser, userId: UserId.parse(userId), email };
}

async function body(response: Response): Promise<unknown> {
  return response.json();
}

describe('GET /api/me', () => {
  test('een user krijgt id, naam, e-mail en rol', async () => {
    const { browser, userId, email } = await signedIn('user', 'Gewone Gebruiker');
    const response = await browser.get('/api/me');

    expect(response.status).toBe(200);
    expect(await body(response)).toStrictEqual({ id: userId, naam: 'Gewone Gebruiker', email, rol: 'user' });
  });

  test('niet ingelogd: 401 UNAUTHENTICATED', async () => {
    const response = await new Browser(app).get('/api/me');

    expect([response.status, await body(response)]).toMatchObject([401, { code: 'UNAUTHENTICATED' }]);
  });

  test('ingelogd zonder rol: 403 FORBIDDEN', async () => {
    const { browser } = await signedIn(null);
    const response = await browser.get('/api/me');

    expect([response.status, await body(response)]).toMatchObject([403, { code: 'FORBIDDEN' }]);
  });

  test('een admin zonder MFA: 403 MFA_REQUIRED; na TOTP: 200 met rol admin (spec accounts/AC-4)', async () => {
    const { browser } = await signedIn('admin');
    const blocked = await browser.get('/api/me');
    expect([blocked.status, await body(blocked)]).toMatchObject([403, { code: 'MFA_REQUIRED' }]);

    const enable = await browser.post('/api/auth/two-factor/enable', { password: PASSWORD });
    const uri: unknown = await enable.json();
    const totpURI =
      typeof uri === 'object' && uri !== null && 'totpURI' in uri && typeof uri.totpURI === 'string' ? uri.totpURI : '';
    await browser.post('/api/auth/two-factor/verify-totp', { code: totp(totpURI) });

    const allowed = await browser.get('/api/me');
    expect(allowed.status).toBe(200);
    expect(await body(allowed)).toMatchObject({ rol: 'admin' });
  });

  test('een sessie ouder dan 7 dagen: 401 en de sessie is ingetrokken (ADR 0041)', async () => {
    const { browser, userId } = await signedIn('user');
    await authDb.query(`update session set "createdAt" = now() - interval '8 days' where "userId" = $1`, [userId]);

    const response = await browser.get('/api/me');
    expect(response.status).toBe(401);
    expect((await authDb.query('select 1 from session where "userId" = $1', [userId])).rowCount).toBe(0);
  });
});

describe('foutvertaling in withUser', () => {
  test('LAST_ADMIN uit de trigger wordt AppError LAST_ADMIN', async () => {
    const { userId } = await signedIn('admin');
    const others = await withUser({ userId, sessionStrength: 'mfa' }, async (tx) => {
      const { rows } = await tx.execute<{ user_id: string }>(
        sql`select user_id from public.user_roles where role = 'admin' and user_id <> ${userId}`,
      );
      return rows.map((row) => row.user_id);
    });
    for (const other of others) await migrator.query("select app.assign_role($1, 'user')", [other]);

    const attempt = withUser({ userId, sessionStrength: 'mfa' }, async (tx) => {
      await tx.execute(sql`select app.assign_role(${userId}, 'user')`);
    });
    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({ code: 'LAST_ADMIN' });
  });

  test('een rol die geen admin met MFA is, kan geen rol toekennen: FORBIDDEN (42501)', async () => {
    const { userId } = await signedIn('user');
    const attempt = withUser({ userId, sessionStrength: 'password' }, async (tx) => {
      await tx.execute(sql`select app.assign_role(${userId}, 'admin')`);
    });

    await expect(attempt).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
