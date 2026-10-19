import { afterAll, expect, test } from 'vitest';
import { createAccountTestApp } from './account-harness.ts';
import { uniqueEmail } from '../auth/harness.ts';

// De fouten worden met echte database-locks opgewekt; app, Better Auth en Mailpit zijn de echte teststack.
const t = createAccountTestApp();
afterAll(() => t.close());

async function admin() {
  const account = await t.account('admin');
  await t.enableTotp(account.browser);
  return account;
}

test('mislukte rol/audit-transactie ruimt de nieuwe auth-user pas na rollback op', async () => {
  const owner = await admin();
  const email = uniqueEmail('rollback-invitation');
  const lock = await t.migrator.connect();
  try {
    await lock.query('begin');
    await lock.query('lock table app.audit_log in access exclusive mode');
    const response = await t.call(owner.browser, 'POST /api/accounts/invite', { naam: 'Rollback', email, rol: 'user' });
    expect(response.status).toBe(500);
  } finally {
    await lock.query('rollback');
    lock.release();
  }
  const { rows } = await t.authDb.query('select id from "user" where email = $1', [email]);
  expect(rows).toHaveLength(0);
  const retry = await t.call(owner.browser, 'POST /api/accounts/invite', { naam: 'Retry', email, rol: 'user' });
  expect(retry.status).toBe(200);
}, 20000);

test('mislukte tokenopslag na commit houdt het account zichtbaar en opnieuw uitnodigbaar', async () => {
  const owner = await admin();
  const email = uniqueEmail('committed-invitation');
  const lock = await t.migrator.connect();
  try {
    await lock.query('begin');
    await lock.query('lock table better_auth.verification in access exclusive mode');
    const response = await t.call(owner.browser, 'POST /api/accounts/invite', {
      naam: 'Committed',
      email,
      rol: 'user',
    });
    expect(response.status).toBe(500);
  } finally {
    await lock.query('rollback');
    lock.release();
  }
  const stored = await t.migrator.query<{ id: string }>(
    'select u.id from better_auth."user" u join public.user_roles r on r.user_id = u.id where u.email = $1',
    [email],
  );
  expect(stored.rows).toHaveLength(1);
  const id = stored.rows[0]?.id ?? '';
  const list = await t.call(owner.browser, `GET /api/accounts?q=${encodeURIComponent(email)}`);
  expect(list.status).toBe(200);
  expect(await list.json()).toMatchObject({ items: [{ id, status: 'uitgenodigd' }] });
  expect((await t.call(owner.browser, `POST /api/accounts/${id}/reinvite`, {})).status).toBe(200);
}, 20000);

test('een fout bij het verwijderen van sessies draait de gecommitteerde blokkade niet terug', async () => {
  const owner = await admin();
  const victim = await t.account('user');
  const lock = await t.migrator.connect();
  try {
    await lock.query('begin');
    await lock.query('select id from better_auth.session where "userId" = $1 for update', [victim.userId]);
    expect((await t.call(owner.browser, `POST /api/accounts/${victim.userId}/block`, {})).status).toBe(500);
    const { rows } = await lock.query<{ blocked: boolean }>(
      'select blocked_at is not null as blocked from better_auth."user" where id = $1',
      [victim.userId],
    );
    expect(rows[0]?.blocked).toBe(true);
  } finally {
    await lock.query('rollback');
    lock.release();
  }
  expect((await victim.browser.get('/api/me')).status).toBe(401);
}, 20000);

test('een door de idle-termijn verlopen sessie staat niet meer bij actieve apparaten', async () => {
  const account = await t.account('user');
  const oldSessions = await t.sessionsOf(account.userId);
  const current = await t.signIn(account.email);
  await t.authDb.query('update session set "expiresAt" = now() - interval \'1 second\' where token = $1', [
    oldSessions[0]?.token,
  ]);
  const response = await t.call(current, 'GET /api/me/sessions');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ items: [{ huidig: true }] });
  const stored = await t.sessionsOf(account.userId);
  expect(stored).toHaveLength(2);
});
