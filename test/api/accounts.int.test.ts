import pg from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import { buildApp } from '../../src/api/app.ts';
import { createServices } from '../../src/api/services.ts';
import { accountsListContract, inviteContract } from '../../src/shared/contracts/accounts.ts';
import { inviteUser } from '../../src/core/api/auth/index.ts';
import { beginTestDb, createPool, type TestDb, type TestUser } from '../../src/core/api/db/testing.ts';
import { APP_ORIGIN, Browser, createTestApp, latestMailTo, required, tokenFrom, uniqueEmail } from '../auth/harness.ts';

// Accountbeheer (spec accountbeheer, AC-5/6/7): lijst, uitnodigen en opnieuw uitnodigen tegen de echte database en
// Better Auth. De admin bestaat alleen in de testtransactie (testkit), zodat andere tests geen extra admin zien.
// realApp: de app met echte sessies, voor de stappen van de uitgenodigde zelf (wachtwoord instellen).
const { auth, pool: apiPool, app: realApp } = createTestApp();
const services = createServices(auth);
const pool = createPool(required('MIGRATOR_DATABASE_URL'));
const migrator = new pg.Pool({ connectionString: required('MIGRATOR_DATABASE_URL'), max: 1 });
afterAll(async () => {
  await Promise.all([pool.end(), apiPool.end(), migrator.end()]);
});

let db: TestDb;
beforeEach(async () => {
  db = await beginTestDb(pool);
});
afterEach(async () => {
  await db.rollback();
});

function call(user: TestUser, path: string, body?: unknown): Promise<Response> {
  const app = buildApp({ appOrigin: APP_ORIGIN, auth: user.auth, withUser: db.withUser, services });
  const init: RequestInit =
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
          body: JSON.stringify(body),
        };
  return app.fetch(new Request(`${APP_ORIGIN}/api${path}`, init));
}

async function json(response: Response): Promise<unknown> {
  return response.json();
}

// Antwoorden parsen met dezelfde contracten als de client: geen casts.
const page = (value: unknown) => accountsListContract.output.parse(value);
const invited = (value: unknown) => inviteContract.output.parse(value);

describe('elke accountroute: verboden rollen (spec accounts/AC-7) en admin zonder MFA', () => {
  const routes: [string, string, unknown][] = [
    ['GET /api/accounts', '/accounts', undefined],
    ['POST /api/accounts/invite', '/accounts/invite', { naam: 'X', email: 'x@example.test', rol: 'user' }],
    ['POST /api/accounts/:id/reinvite', '/accounts/onbekend/reinvite', {}],
  ];

  test.each(routes)('%s: user → 403 FORBIDDEN, admin zonder MFA → 403 MFA_REQUIRED', async (_, path, body) => {
    const user = await db.asUser('user');
    const admin = await db.asUser('admin', { sessionStrength: 'password' });

    const forUser = await call(user, path, body);
    const forAdmin = await call(admin, path, body);
    expect([forUser.status, await json(forUser)]).toMatchObject([403, { code: 'FORBIDDEN' }]);
    expect([forAdmin.status, await json(forAdmin)]).toMatchObject([403, { code: 'MFA_REQUIRED' }]);
  });
});

describe('GET /api/accounts', () => {
  test('een admin met MFA ziet alle accounts, nieuwste eerst, per pagina met een cursor', async () => {
    const admin = await db.asUser('admin', { name: 'Test Admin' });
    const mine = new Set([admin.actor.userId]);
    for (let i = 0; i < 30; i += 1)
      mine.add((await db.asUser('user', { name: `Gebruiker ${String(i)}` })).actor.userId);

    const seen: { id: string; aangemaakt: string }[] = [];
    let cursor: string | null = null;
    do {
      const response = await call(
        admin,
        cursor === null ? '/accounts' : `/accounts?cursor=${encodeURIComponent(cursor)}`,
      );
      expect(response.status).toBe(200);
      const result = page(await json(response));
      expect(result.items.length).toBeLessThanOrEqual(25);
      seen.push(...result.items);
      cursor = result.nextCursor;
    } while (cursor !== null);

    expect(new Set(seen.map((item) => item.id)).size).toBe(seen.length);
    expect([...mine].filter((id) => !seen.some((item) => item.id === id))).toStrictEqual([]);
    const order = seen.map((item) => item.aangemaakt);
    expect(order).toStrictEqual([...order].sort((a, b) => Date.parse(b) - Date.parse(a)));
  });

  test('rol en status: uitgenodigd zonder wachtwoord, ISO-tijd', async () => {
    const admin = await db.asUser('admin', { name: 'Test Admin' });
    const result = page(await json(await call(admin, '/accounts')));
    const own = result.items.find((item) => item.id === admin.actor.userId);

    expect(own).toMatchObject({ naam: 'Test Admin', rol: 'admin', status: 'uitgenodigd' });
    expect(Number.isNaN(Date.parse(own?.aangemaakt ?? ''))).toBe(false);
  });

  test('een gemanipuleerde cursor: 400 VALIDATION, geen SQL-fout', async () => {
    const admin = await db.asUser('admin');

    for (const cursor of ['kapot', 'WyJ4Il0', 'eyJhIjoxfQ']) {
      const response = await call(admin, `/accounts?cursor=${cursor}`);
      expect([response.status, await json(response)]).toMatchObject([400, { code: 'VALIDATION' }]);
    }
  });
});

describe('POST /api/accounts/invite (spec accounts/AC-5)', () => {
  test('een admin nodigt uit: account met rol, status uitgenodigd, mail met naam en link', async () => {
    const admin = await db.asUser('admin');
    const email = uniqueEmail('uitgenodigd');
    const response = await call(admin, '/accounts/invite', { naam: 'Nieuwe Collega', email, rol: 'admin' });

    expect(response.status).toBe(200);
    const { id } = invited(await json(response));
    const listed = page(await json(await call(admin, '/accounts'))).items.find((item) => item.id === id);
    expect(listed).toMatchObject({ naam: 'Nieuwe Collega', rol: 'admin', status: 'uitgenodigd' });
    const mail = await latestMailTo(email);
    expect(mail.text).toContain('Hallo Nieuwe Collega,');
    expect(tokenFrom(mail.text)).not.toBe('');
  });

  test('een bestaand e-mailadres (ook in andere hoofdletters): 409 ALREADY_EXISTS', async () => {
    const admin = await db.asUser('admin');
    const email = uniqueEmail('dubbel');
    expect((await call(admin, '/accounts/invite', { naam: 'Eerste', email, rol: 'user' })).status).toBe(200);

    const again = await call(admin, '/accounts/invite', { naam: 'Tweede', email: email.toUpperCase(), rol: 'user' });
    expect([again.status, await json(again)]).toMatchObject([409, { code: 'ALREADY_EXISTS' }]);
  });

  test.each([
    ['ongeldig e-mailadres', { naam: 'X', email: 'geen-adres', rol: 'user' }],
    ['lege naam', { naam: '  ', email: 'leeg@example.test', rol: 'user' }],
    ['onbekende rol', { naam: 'X', email: 'rol@example.test', rol: 'baas' }],
    ['extra veld', { naam: 'X', email: 'extra@example.test', rol: 'user', wachtwoord: 'x' }],
  ])('%s: 400 VALIDATION', async (_, body) => {
    const admin = await db.asUser('admin');
    const response = await call(admin, '/accounts/invite', body);

    expect([response.status, await json(response)]).toMatchObject([400, { code: 'VALIDATION' }]);
  });
});

describe('POST /api/accounts/:id/reinvite (spec accounts/AC-6)', () => {
  test('een uitgenodigd account krijgt een nieuwe mail; de oude link werkt niet meer', async () => {
    const admin = await db.asUser('admin');
    const email = uniqueEmail('opnieuw');
    const { id } = invited(await json(await call(admin, '/accounts/invite', { naam: 'Opnieuw', email, rol: 'user' })));
    const oldToken = tokenFrom((await latestMailTo(email)).text);

    const response = await call(admin, `/accounts/${id}/reinvite`, {});
    expect([response.status, await json(response)]).toStrictEqual([200, null]);
    await expect.poll(async () => tokenFrom((await latestMailTo(email)).text)).not.toBe(oldToken);

    const browser = new Browser(realApp);
    const reset = await browser.post('/api/auth/reset-password', { token: oldToken, newPassword: 'ab-'.repeat(6) });
    expect(reset.status).toBe(400);
  });

  test('onbekend account: 404 NOT_FOUND; actief account: 409 ALREADY_ACTIVE', async () => {
    const admin = await db.asUser('admin');
    const email = uniqueEmail('actief');
    const { userId } = await inviteUser(auth, { name: 'Actief', email });
    await new Browser(realApp).post('/api/auth/reset-password', {
      token: tokenFrom((await latestMailTo(email)).text),
      newPassword: 'ab-'.repeat(6),
    });

    const unknown = await call(admin, '/accounts/bestaat-niet/reinvite', {});
    const active = await call(admin, `/accounts/${userId}/reinvite`, {});
    expect([unknown.status, await json(unknown)]).toMatchObject([404, { code: 'NOT_FOUND' }]);
    expect([active.status, await json(active)]).toMatchObject([409, { code: 'ALREADY_ACTIVE' }]);
  });
});
