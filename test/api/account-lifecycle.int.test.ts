import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { inviteUser } from '../../src/core/api/auth/index.ts';
import { UserId } from '../../src/core/shared/ids.ts';
import { accountsListContract } from '../../src/shared/contracts/accounts.ts';
import { Browser, uniqueEmail } from '../auth/harness.ts';
import { createAccountTestApp, json, PASSWORD } from './account-harness.ts';

const setup = createAccountTestApp();
afterAll(async () => {
  await setup.close();
});

const deactivate = (id: string) => `POST /api/accounts/${id}/deactivate`;
const activate = (id: string) => `POST /api/accounts/${id}/activate`;
const block = (id: string) => `POST /api/accounts/${id}/block`;
const unblock = (id: string) => `POST /api/accounts/${id}/unblock`;

async function mfaAdmin(name = 'Lifecycle Beheerder') {
  const admin = await setup.account('admin', name);
  await setup.enableTotp(admin.browser);
  return admin;
}

async function onlyAdmins(first: string, second: string): Promise<void> {
  const others = await setup.migrator.query<{ user_id: string }>(
    "select user_id from public.user_roles where role = 'admin' and user_id not in ($1, $2)",
    [first, second],
  );
  for (const other of others.rows) await setup.migrator.query("select app.assign_role($1, 'user')", [other.user_id]);
}

async function accountFromList(browser: Browser, email: string, status?: string) {
  const suffix = status === undefined ? '' : `&status=${status}`;
  const response = await browser.get(`/api/accounts?q=${encodeURIComponent(email)}${suffix}`);
  expect(response.status).toBe(200);
  return accountsListContract.output.parse(await json(response)).items.find((account) => account.email === email);
}

async function auditFor(actor: string, target: string) {
  const result = await setup.withUser({ userId: UserId.parse(actor), sessionStrength: 'mfa' }, async (tx) =>
    tx.execute(sql`select action, actor_id, request_id from app.audit_log
      where target_id = ${target} and action in ('core.account.deactivate', 'core.account.activate') order by at, id`),
  );
  return result.rows.map((row) =>
    z.object({ action: z.string(), actor_id: z.string(), request_id: z.string() }).parse(row),
  );
}

describe.each([
  ['deactivate', deactivate],
  ['activate', activate],
])('account-lifecycle/AC-7: %s', (_, route) => {
  test('anoniem, gewone gebruiker en beheerder zonder MFA krijgen geen toegang', async () => {
    const target = await setup.account('user', 'Lifecycle Doel');
    const user = await setup.account('user', 'Lifecycle Gewoon');
    await setup.enableTotp(user.browser);
    const admin = await setup.account('admin', 'Lifecycle Zonder MFA');
    const attempts = await Promise.all([
      setup.call(new Browser(setup.app), route(target.userId), {}),
      setup.call(user.browser, route(target.userId), {}),
      setup.call(admin.browser, route(target.userId), {}),
    ]);

    expect(attempts.map((response) => response.status)).toStrictEqual([401, 403, 403]);
    expect(await Promise.all(attempts.map(json))).toMatchObject([
      { code: 'UNAUTHENTICATED' },
      { code: 'FORBIDDEN' },
      { code: 'MFA_REQUIRED' },
    ]);
    expect((await target.browser.get('/api/me')).status).toBe(200);
  });

  test('een onbekend account en extra invoervelden worden geweigerd', async () => {
    const admin = await mfaAdmin();
    const missing = await setup.call(admin.browser, route('ontbrekend-lifecycle-account'), {});
    const invalid = await setup.call(admin.browser, route(admin.userId), { unexpected: true });

    expect([missing.status, await json(missing)]).toMatchObject([404, { code: 'NOT_FOUND' }]);
    expect([invalid.status, await json(invalid)]).toMatchObject([400, { code: 'VALIDATION' }]);
  });
});

describe('account-lifecycle: onafhankelijk beheer', () => {
  test('AC-4/5: deactiveren weigert login en bestaande auth-sessie; activeren vraagt een nieuwe login', async () => {
    const admin = await mfaAdmin();
    const target = await setup.account('user', 'Lifecycle Herstel');
    const cookies = [...target.browser.cookies];
    expect((await setup.call(admin.browser, deactivate(target.userId), {})).status).toBe(200);

    const session = await target.browser.get('/api/auth/get-session');
    expect(await json(session)).toBeNull();
    const failedLogin = await new Browser(setup.app).post('/api/auth/sign-in/email', {
      email: target.email,
      password: PASSWORD,
    });
    expect(failedLogin.status).toBeGreaterThanOrEqual(400);
    expect(failedLogin.status).toBeLessThan(500);
    expect((await setup.call(admin.browser, activate(target.userId), {})).status).toBe(200);

    for (const [name, value] of cookies) target.browser.cookies.set(name, value);
    expect((await target.browser.get('/api/me')).status).toBe(401);
    const signedIn = await setup.signIn(target.email);
    expect((await signedIn.get('/api/me')).status).toBe(200);
  });

  test('AC-5: een oude cookie wordt ook zonder tussentijdse aanvraag niet opnieuw geldig', async () => {
    const admin = await mfaAdmin();
    const target = await setup.account('user', 'Lifecycle Oude Cookie');
    await setup.call(admin.browser, deactivate(target.userId), {});
    await setup.call(admin.browser, activate(target.userId), {});

    const response = await target.browser.get('/api/auth/get-session');
    expect(await json(response)).toBeNull();
    expect((await target.browser.get('/api/me')).status).toBe(401);
  });

  test('AC-4/5: gevoelige auth-routes weigeren een bestaande cookie tijdens en na de deactivatie', async () => {
    const admin = await mfaAdmin();
    const target = await setup.account('user', 'Lifecycle Auth Bewaking');
    const cookies = [...target.browser.cookies];
    const changePassword = {
      currentPassword: PASSWORD,
      newPassword: 'anders-'.repeat(3),
      revokeOtherSessions: true,
    };
    await setup.call(admin.browser, deactivate(target.userId), {});

    expect((await target.browser.post('/api/auth/change-password', changePassword)).status).toBe(401);
    await setup.call(admin.browser, activate(target.userId), {});
    for (const [name, value] of cookies) target.browser.cookies.set(name, value);
    expect((await target.browser.post('/api/auth/change-password', changePassword)).status).toBe(401);
    expect((await (await setup.signIn(target.email)).get('/api/me')).status).toBe(200);
  });

  test('AC-3/6: alle combinaties blijven zichtbaar en beide filters vinden de gezamenlijke toestand', async () => {
    const admin = await mfaAdmin();
    const target = await setup.account('user', 'Lifecycle Combinaties');
    const original = await accountFromList(admin.browser, target.email);
    expect(original).toMatchObject({ status: 'actief', gedeactiveerd: false, geblokkeerd: false });
    expect(original?.laatstIngelogd).toEqual(expect.any(String));

    await setup.call(admin.browser, deactivate(target.userId), {});
    expect(await accountFromList(admin.browser, target.email)).toMatchObject({
      status: 'gedeactiveerd',
      gedeactiveerd: true,
      geblokkeerd: false,
    });
    await setup.call(admin.browser, block(target.userId), {});
    for (const filter of ['gedeactiveerd', 'geblokkeerd']) {
      expect(await accountFromList(admin.browser, target.email, filter)).toMatchObject({
        gedeactiveerd: true,
        geblokkeerd: true,
        laatstIngelogd: original?.laatstIngelogd,
      });
    }
    await setup.call(admin.browser, activate(target.userId), {});
    expect(await accountFromList(admin.browser, target.email)).toMatchObject({
      gedeactiveerd: false,
      geblokkeerd: true,
    });
    await expect(setup.signIn(target.email)).rejects.toThrow();
    await setup.call(admin.browser, deactivate(target.userId), {});
    await setup.call(admin.browser, unblock(target.userId), {});
    expect(await accountFromList(admin.browser, target.email)).toMatchObject({
      gedeactiveerd: true,
      geblokkeerd: false,
    });
    await expect(setup.signIn(target.email)).rejects.toThrow();
    await setup.call(admin.browser, activate(target.userId), {});
    expect((await (await setup.signIn(target.email)).get('/api/me')).status).toBe(200);
  });

  test('AC-7: eigen deactivatie en een uitgenodigd account worden geweigerd', async () => {
    const admin = await mfaAdmin();
    const invitation = await inviteUser(setup.auth, { name: 'Lifecycle Uitnodiging', email: uniqueEmail('lifecycle') });
    const own = await setup.call(admin.browser, deactivate(admin.userId), {});
    expect([own.status, await json(own)]).toMatchObject([409, { code: 'OWN_ACCOUNT' }]);
    for (const route of [deactivate, activate]) {
      const invited = await setup.call(admin.browser, route(invitation.userId), {});
      expect([invited.status, await json(invited)]).toMatchObject([409, { code: 'ACCOUNT_INVITED' }]);
    }
    expect((await admin.browser.get('/api/me')).status).toBe(200);
  });

  test('AC-9: herhaalde acties behouden tijdstip en sessieversie en schrijven één auditregel per overgang', async () => {
    const admin = await mfaAdmin();
    const target = await setup.account('user', 'Lifecycle Idempotent');
    const first = await setup.call(admin.browser, deactivate(target.userId), {});
    const before = await setup.authDb.query('select deactivated_at, session_version from "user" where id = $1', [
      target.userId,
    ]);
    const again = await setup.call(admin.browser, deactivate(target.userId), {});
    const after = await setup.authDb.query('select deactivated_at, session_version from "user" where id = $1', [
      target.userId,
    ]);
    const restore = await setup.call(admin.browser, activate(target.userId), {});
    const restoreAgain = await setup.call(admin.browser, activate(target.userId), {});

    expect([first.status, again.status, restore.status, restoreAgain.status]).toStrictEqual([200, 200, 200, 200]);
    expect(after.rows).toStrictEqual(before.rows);
    expect(await auditFor(admin.userId, target.userId)).toStrictEqual([
      { action: 'core.account.deactivate', actor_id: admin.userId, request_id: first.headers.get('x-request-id') },
      { action: 'core.account.activate', actor_id: admin.userId, request_id: restore.headers.get('x-request-id') },
    ]);
  });
});

describe('account-lifecycle/AC-8: gemengde laatste-admin-race', () => {
  test('deactiveren en blokkeren delen de lock en laten precies één bruikbare beheerder over', async () => {
    const first = await mfaAdmin('Lifecycle Race A');
    const second = await mfaAdmin('Lifecycle Race B');
    await onlyAdmins(first.userId, second.userId);
    const results = await Promise.allSettled([
      setup.withUser({ userId: UserId.parse(first.userId), sessionStrength: 'mfa' }, async (tx) => {
        await tx.execute(sql`select app.set_account_deactivated(${second.userId}, true)`);
      }),
      setup.withUser({ userId: UserId.parse(second.userId), sessionStrength: 'mfa' }, async (tx) => {
        await tx.execute(sql`select app.set_account_blocked(${first.userId}, true)`);
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: 'LAST_ADMIN' });
    const usable = await setup.authDb.query<{ id: string }>(
      'select id from "user" where id = any($1) and blocked_at is null and deactivated_at is null',
      [[first.userId, second.userId]],
    );
    expect(usable.rows).toHaveLength(1);
  });

  test.each(['deactivate', 'block'])(
    '%s en degraderen laten samen precies één bruikbare beheerder over',
    async (action) => {
      const first = await mfaAdmin('Lifecycle Degrade Race A');
      const second = await mfaAdmin('Lifecycle Degrade Race B');
      await onlyAdmins(first.userId, second.userId);
      const results = await Promise.allSettled([
        setup.withUser({ userId: UserId.parse(first.userId), sessionStrength: 'mfa' }, async (tx) => {
          const operation =
            action === 'deactivate'
              ? sql`select app.set_account_deactivated(${second.userId}, true)`
              : sql`select app.set_account_blocked(${second.userId}, true)`;
          await tx.execute(operation);
        }),
        setup.withUser({ userId: UserId.parse(second.userId), sessionStrength: 'mfa' }, async (tx) => {
          await tx.execute(sql`select app.assign_role(${first.userId}, 'user')`);
        }),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      expect(rejected?.reason).toMatchObject({ code: 'LAST_ADMIN' });
      const usable = await setup.migrator.query<{ id: string }>(
        `select u.id from better_auth."user" u join public.user_roles r on r.user_id = u.id
       where u.id = any($1) and r.role = 'admin' and u.blocked_at is null and u.deactivated_at is null`,
        [[first.userId, second.userId]],
      );
      expect(usable.rows).toHaveLength(1);
    },
  );
});
