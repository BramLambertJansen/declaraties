import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, test } from 'vitest';
import { inviteUser } from '../../src/core/api/auth/index.ts';
import { UserId } from '../../src/core/shared/ids.ts';
import { accountsListContract } from '../../src/shared/contracts/accounts.ts';
import { Browser, required } from '../auth/harness.ts';
import { createAccountTestApp, json, PASSWORD } from './account-harness.ts';

// Account blokkeren en deblokkeren (spec accountbeheer-uitbreiding, ADR 0026): AC-11, AC-12, AC-14, AC-22, AC-23, de
// permissies per rol en de race van twee admins, tegen de echte database en Better Auth (`pnpm test:db`).
// De rest (AC-13 en AC-24 op database-niveau) staat in db/tests/account_blocking.sql.
const t = createAccountTestApp();
afterAll(async () => {
  await t.close();
});

const BLOCK = (id: string) => `POST /api/accounts/${id}/block`;
const UNBLOCK = (id: string) => `POST /api/accounts/${id}/unblock`;

// Een admin met een MFA-sessie (de TOTP-bevestiging maakt de sessie mfa).
async function mfaAdmin(name = 'Beheerder') {
  const admin = await t.account('admin', name);
  await t.enableTotp(admin.browser);
  return admin;
}

async function statusOf(admin: Browser, email: string): Promise<string | undefined> {
  const response = await t.call(admin, `GET /api/accounts?q=${encodeURIComponent(email)}`);
  expect(response.status).toBe(200);
  return accountsListContract.output.parse(await json(response)).items.find((item) => item.email === email)?.status;
}

// Een sessie die tijdens het blokkeren ontstaat (AC-22): rechtstreeks via internalAdapter, met de ondertekende cookie
// zoals Better Auth hem zet (waarde = token.handtekening, HMAC-SHA256 base64, URL-encoded).
async function ghostBrowser(userId: string, cookieName: string): Promise<Browser> {
  const { internalAdapter } = await t.auth.$context;
  const session = await internalAdapter.createSession(userId);
  const signature = createHmac('sha256', required('AUTH_SECRET')).update(session.token).digest('base64');
  const browser = new Browser(t.app);
  browser.cookies.set(cookieName, encodeURIComponent(`${session.token}.${signature}`));
  return browser;
}

function sessionCookieName(browser: Browser): string {
  const name = [...browser.cookies.keys()].find((key) => key.endsWith('session_token'));
  if (name === undefined) throw new Error('geen sessiecookie na inloggen');
  return name;
}

describe.each([
  ['block', BLOCK],
  ['unblock', UNBLOCK],
])('POST /api/accounts/:id/%s: rechten en invoer (spec accounts/AC-19, ADR 0026)', (_, route) => {
  test('niet ingelogd: 401 UNAUTHENTICATED', async () => {
    const response = await t.call(new Browser(t.app), route('x'), {});

    expect([response.status, await json(response)]).toMatchObject([401, { code: 'UNAUTHENTICATED' }]);
  });

  test('user: 403 FORBIDDEN, ook met TOTP; het doelaccount blijft ongemoeid', async () => {
    const victim = await t.account('user', 'Slachtoffer');
    const user = await t.account('user', 'Gewone Gebruiker');
    await t.enableTotp(user.browser);
    const response = await t.call(user.browser, route(victim.userId), {});

    expect([response.status, await json(response)]).toMatchObject([403, { code: 'FORBIDDEN' }]);
    expect((await victim.browser.get('/api/me')).status).toBe(200);
  });

  test('admin zonder MFA: 403 MFA_REQUIRED; het doelaccount blijft ongemoeid', async () => {
    const victim = await t.account('user', 'Slachtoffer');
    const admin = await t.account('admin', 'Zonder MFA');
    const response = await t.call(admin.browser, route(victim.userId), {});

    expect([response.status, await json(response)]).toMatchObject([403, { code: 'MFA_REQUIRED' }]);
    expect((await victim.browser.get('/api/me')).status).toBe(200);
  });

  test('onbekend account: 404 NOT_FOUND', async () => {
    const admin = await mfaAdmin();
    const response = await t.call(admin.browser, route('bestaat-niet'), {});

    expect([response.status, await json(response)]).toMatchObject([404, { code: 'NOT_FOUND' }]);
  });

  test.each([
    ['extra veld in de body', 'iets', { rol: 'admin' }],
    ['een id van meer dan 200 tekens', 'x'.repeat(201), {}],
  ])('%s: 400 VALIDATION', async (_case, id, body) => {
    const admin = await mfaAdmin();
    const response = await t.call(admin.browser, route(id), body);

    expect([response.status, await json(response)]).toMatchObject([400, { code: 'VALIDATION' }]);
  });
});

describe('blokkeren (AC-11)', () => {
  test('beide sessies geven daarna 401, de sessierijen zijn weg, de status is Geblokkeerd', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Te Blokkeren');
    const second = await t.signIn(user.email);
    expect(await t.sessionsOf(user.userId)).toHaveLength(2);

    const response = await t.call(admin.browser, BLOCK(user.userId), {});

    expect([response.status, await json(response)]).toStrictEqual([200, null]);
    // Direct na het blokkeren, vóór er een request van de user is: alleen services.sessions.revokeAll kan dit hebben gedaan.
    expect(await t.sessionsOf(user.userId)).toHaveLength(0);
    expect((await user.browser.get('/api/me')).status).toBe(401);
    expect((await second.get('/api/me')).status).toBe(401);
    expect(await statusOf(admin.browser, user.email)).toBe('geblokkeerd');
  });

  test('de lijst filtert op de status geblokkeerd', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Gefilterd');
    await t.call(admin.browser, BLOCK(user.userId), {});

    const response = await t.call(
      admin.browser,
      `GET /api/accounts?status=geblokkeerd&q=${encodeURIComponent(user.email)}`,
    );
    const items = accountsListContract.output.parse(await json(response)).items;
    expect(items.map((item) => item.id)).toStrictEqual([user.userId]);
  });

  test('blokkeren is idempotent: twee keer 200, nog steeds geblokkeerd en zonder sessies', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Dubbel');

    const first = await t.call(admin.browser, BLOCK(user.userId), {});
    const second = await t.call(admin.browser, BLOCK(user.userId), {});

    expect([first.status, second.status]).toStrictEqual([200, 200]);
    expect(await statusOf(admin.browser, user.email)).toBe('geblokkeerd');
  });

  test('een uitgenodigd account blokkeren: 409 ACCOUNT_INVITED, de status blijft Uitgenodigd', async () => {
    const admin = await mfaAdmin();
    const email = `uitgenodigd-${String(Date.now())}@template.test`;
    const { userId } = await inviteUser(t.auth, { name: 'Nog Niet Actief', email });
    await t.migrator.query('select app.assign_role($1, $2)', [userId, 'user']);

    const response = await t.call(admin.browser, BLOCK(userId), {});

    expect([response.status, await json(response)]).toMatchObject([409, { code: 'ACCOUNT_INVITED' }]);
    expect(await statusOf(admin.browser, email)).toBe('uitgenodigd');
  });
});

describe('eigen account (AC-14)', () => {
  test('een admin blokkeert zichzelf: 409 OWN_ACCOUNT; sessie en status blijven', async () => {
    const admin = await mfaAdmin();
    const response = await t.call(admin.browser, BLOCK(admin.userId), {});

    expect([response.status, await json(response)]).toMatchObject([409, { code: 'OWN_ACCOUNT' }]);
    expect((await admin.browser.get('/api/me')).status).toBe(200);
    expect(await statusOf(admin.browser, admin.email)).toBe('actief');
  });
});

describe('deblokkeren (AC-12)', () => {
  test('de user kan weer inloggen en de status is Actief', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Terug');
    await t.call(admin.browser, BLOCK(user.userId), {});
    await expect(t.signIn(user.email)).rejects.toThrow();

    const response = await t.call(admin.browser, UNBLOCK(user.userId), {});

    expect([response.status, await json(response)]).toStrictEqual([200, null]);
    const back = await t.signIn(user.email);
    expect((await back.get('/api/me')).status).toBe(200);
    expect(await statusOf(admin.browser, user.email)).toBe('actief');
  });

  test('deblokkeren van een actief account is geen fout (idempotent) en verandert niets', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Nooit Geblokkeerd');
    const response = await t.call(admin.browser, UNBLOCK(user.userId), {});

    expect([response.status, await json(response)]).toStrictEqual([200, null]);
    expect((await user.browser.get('/api/me')).status).toBe(200);
    expect(await statusOf(admin.browser, user.email)).toBe('actief');
  });
});

describe('inloggen met een geblokkeerd account (AC-23)', () => {
  test('met het juiste wachtwoord: 4xx met code ACCOUNT_BLOCKED (geen 500), geen sessie, geen cookie', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Geblokkeerd');
    await t.call(admin.browser, BLOCK(user.userId), {});

    const browser = new Browser(t.app);
    const response = await browser.post('/api/auth/sign-in/email', { email: user.email, password: PASSWORD });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(await json(response)).toMatchObject({ code: 'ACCOUNT_BLOCKED' });
    expect(browser.cookies.size).toBe(0);
    expect(await t.sessionsOf(user.userId)).toHaveLength(0);
  });

  test('ook een gebruiker met TOTP krijgt na het wachtwoord geen sessie (sign-in maakt eerst een sessie)', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Met TOTP');
    await t.enableTotp(user.browser);
    await t.call(admin.browser, BLOCK(user.userId), {});

    const response = await new Browser(t.app).post('/api/auth/sign-in/email', {
      email: user.email,
      password: PASSWORD,
    });

    expect(await json(response)).toMatchObject({ code: 'ACCOUNT_BLOCKED' });
    expect(await t.sessionsOf(user.userId)).toHaveLength(0);
  });

  test('met een fout wachtwoord: de gewone inlogfout, geen ACCOUNT_BLOCKED (geen orakel voor het wachtwoord)', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Geen Orakel');
    await t.call(admin.browser, BLOCK(user.userId), {});

    const response = await new Browser(t.app).post('/api/auth/sign-in/email', {
      email: user.email,
      password: 'fout-'.repeat(3),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await json(response)).not.toMatchObject({ code: 'ACCOUNT_BLOCKED' });
  });
});

describe('een sessie die na het blokkeren ontstaat (AC-22)', () => {
  test('de volgende request geeft 401 en de sessierij is weg', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Spooksessie');
    const cookieName = sessionCookieName(user.browser);
    await t.call(admin.browser, BLOCK(user.userId), {});
    const ghost = await ghostBrowser(user.userId, cookieName);
    expect(await t.sessionsOf(user.userId)).toHaveLength(1);

    const response = await ghost.get('/api/me');

    expect([response.status, await json(response)]).toMatchObject([401, { code: 'UNAUTHENTICATED' }]);
    expect(await t.sessionsOf(user.userId)).toHaveLength(0);
  });

  test('controle van de opzet: dezelfde route voor een niet-geblokkeerde user geeft 200', async () => {
    const user = await t.account('user', 'Geen Blokkade');
    const ghost = await ghostBrowser(user.userId, sessionCookieName(user.browser));

    expect((await ghost.get('/api/me')).status).toBe(200);
  });
});

describe('twee admins blokkeren elkaar tegelijk (randgeval laatste-admin-regel)', () => {
  // Zoals test/auth/roles.int.test.ts: andere int-tests committen ook admins, dus eerst terugzetten tot alleen a en b.
  async function onlyAdmins(a: string, b: string): Promise<void> {
    const { rows } = await t.migrator.query<{ user_id: string }>(
      "select user_id from public.user_roles where role = 'admin' and user_id not in ($1, $2)",
      [a, b],
    );
    for (const row of rows) await t.migrator.query("select app.assign_role($1, 'user')", [row.user_id]);
  }

  async function blockedOf(ids: string[]): Promise<string[]> {
    const { rows } = await t.migrator.query<{ id: string }>(
      'select id from better_auth."user" where id = any($1) and blocked_at is not null',
      [ids],
    );
    return rows.map((row) => row.id);
  }

  test('in de database: precies één slaagt, de ander krijgt LAST_ADMIN en er blijft één niet-geblokkeerde admin', async () => {
    const [a, b] = [await mfaAdmin('Race A'), await mfaAdmin('Race B')];
    await onlyAdmins(a.userId, b.userId);
    const block = (actor: string, target: string) =>
      t.withUser({ userId: UserId.parse(actor), sessionStrength: 'mfa' }, async (tx) => {
        await tx.execute(sql`select pg_sleep(0.05)`);
        await tx.execute(sql`select app.set_account_blocked(${target}, true)`);
      });

    const results = await Promise.allSettled([block(a.userId, b.userId), block(b.userId, a.userId)]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: 'LAST_ADMIN' });
    expect(await blockedOf([a.userId, b.userId])).toHaveLength(1);
  });

  test('via de API: precies één 200; de ander faalt met 409 LAST_ADMIN (of 401 als zijn sessie al weg was)', async () => {
    const [a, b] = [await mfaAdmin('Race C'), await mfaAdmin('Race D')];
    await onlyAdmins(a.userId, b.userId);

    const responses = await Promise.all([
      t.call(a.browser, BLOCK(b.userId), {}),
      t.call(b.browser, BLOCK(a.userId), {}),
    ]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    const loser = responses.find((response) => response.status !== 200);
    expect([409, 401]).toContain(loser?.status);
    if (loser?.status === 409) expect(await json(loser)).toMatchObject({ code: 'LAST_ADMIN' });
    expect(await blockedOf([a.userId, b.userId])).toHaveLength(1);
  });
});
