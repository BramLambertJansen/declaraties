import { afterAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { inviteContract } from '../../src/shared/contracts/accounts.ts';
import { uniqueEmail, type Browser } from '../auth/harness.ts';
import { createAccountTestApp, json } from './account-harness.ts';

// Auditregels van de accountroutes (spec audit-log, deel C, AC-22 t/m AC-27): invite, reinvite, block en unblock schrijven
// hun regel in de transactie van de route, met de request_id van de response; een geweigerde actie laat niets achter.
// Echte database, Better Auth en Mailpit (`pnpm test:db`). De spec noemt src/api/routes/accounts.int.test.ts; de harness
// van de accountroutes staat in test/api, dus dit bestand staat naast zijn zusters.
// Het lezen van app.audit_log gebeurt als app_definer (policy audit_log_definer_select) via de migrator-verbinding.
const t = createAccountTestApp();
afterAll(async () => {
  await t.close();
});

const auditRow = z
  .object({
    action: z.string(),
    actor_id: z.string().nullable(),
    target_type: z.string().nullable(),
    target_id: z.string().nullable(),
    details: z.record(z.string(), z.unknown()),
    request_id: z.string().nullable(),
  })
  .strict();

async function rowsFor(requestId: string) {
  const client = await t.migrator.connect();
  try {
    await client.query('begin');
    await client.query('set local role app_definer');
    const { rows } = await client.query(
      'select action, actor_id, target_type, target_id, details, request_id from app.audit_log where request_id = $1 order by action',
      [requestId],
    );
    return rows.map((row) => auditRow.parse(row));
  } finally {
    await client.query('rollback').catch(() => undefined);
    client.release();
  }
}

function requestIdOf(response: Response): string {
  const id = response.headers.get('x-request-id');
  if (id === null) throw new Error('geen X-Request-Id in de response');
  return id;
}

async function mfaAdmin(name = 'Beheerder') {
  const admin = await t.account('admin', name);
  await t.enableTotp(admin.browser);
  return admin;
}

const INVITE = 'POST /api/accounts/invite';
const REINVITE = (id: string) => `POST /api/accounts/${id}/reinvite`;
const BLOCK = (id: string) => `POST /api/accounts/${id}/block`;
const UNBLOCK = (id: string) => `POST /api/accounts/${id}/unblock`;

async function invite(admin: Browser, email = uniqueEmail('audit-invite')) {
  const response = await t.call(admin, INVITE, { naam: 'Uitgenodigde', email, rol: 'user' });
  expect(response.status).toBe(200);
  return { id: inviteContract.output.parse(await json(response)).id, email, requestId: requestIdOf(response) };
}

describe('uitnodigen (AC-22, AC-23)', () => {
  test('schrijft core.account.invite en core.role.assign met het id uit de response, de actor en de request_id', async () => {
    const admin = await mfaAdmin();
    const invited = await invite(admin.browser);

    expect(await rowsFor(invited.requestId)).toStrictEqual([
      {
        action: 'core.account.invite',
        actor_id: admin.userId,
        target_type: 'account',
        target_id: invited.id,
        details: {},
        request_id: invited.requestId,
      },
      {
        action: 'core.role.assign',
        actor_id: admin.userId,
        target_type: 'account',
        target_id: invited.id,
        details: { role: 'user' },
        request_id: invited.requestId,
      },
    ]);
  });

  test('een bestaand e-mailadres (ALREADY_EXISTS) schrijft geen regel', async () => {
    const admin = await mfaAdmin();
    const first = await invite(admin.browser);
    const again = await t.call(admin.browser, INVITE, { naam: 'Dubbel', email: first.email, rol: 'user' });

    expect([again.status, await json(again)]).toMatchObject([409, { code: 'ALREADY_EXISTS' }]);
    expect(await rowsFor(requestIdOf(again))).toStrictEqual([]);
  });
});

describe('opnieuw uitnodigen (AC-24)', () => {
  test('schrijft één core.account.reinvite met het doelaccount en de actor', async () => {
    const admin = await mfaAdmin();
    const invited = await invite(admin.browser);
    const response = await t.call(admin.browser, REINVITE(invited.id), {});

    expect([response.status, await json(response)]).toStrictEqual([200, null]);
    expect(await rowsFor(requestIdOf(response))).toStrictEqual([
      {
        action: 'core.account.reinvite',
        actor_id: admin.userId,
        target_type: 'account',
        target_id: invited.id,
        details: {},
        request_id: requestIdOf(response),
      },
    ]);
  });

  test('een onbekend ID (NOT_FOUND) schrijft geen regel', async () => {
    const admin = await mfaAdmin();
    const response = await t.call(admin.browser, REINVITE('bestaat-niet'), {});

    expect([response.status, await json(response)]).toMatchObject([404, { code: 'NOT_FOUND' }]);
    expect(await rowsFor(requestIdOf(response))).toStrictEqual([]);
  });

  test('een actief account (ALREADY_ACTIVE) schrijft geen regel', async () => {
    const admin = await mfaAdmin();
    const active = await t.account('user', 'Al Actief');
    const response = await t.call(admin.browser, REINVITE(active.userId), {});

    expect([response.status, await json(response)]).toMatchObject([409, { code: 'ALREADY_ACTIVE' }]);
    expect(await rowsFor(requestIdOf(response))).toStrictEqual([]);
  });
});

describe('blokkeren en deblokkeren (AC-25)', () => {
  const regel = (action: string, who: { actor: string; target: string; requestId: string }) => ({
    action,
    actor_id: who.actor,
    target_type: 'account',
    target_id: who.target,
    details: {},
    request_id: who.requestId,
  });

  test('één regel per echte wijziging, met de request_id van de response', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Te Blokkeren');
    const calls = [
      { route: BLOCK(user.userId), expected: ['core.account.block'] },
      { route: BLOCK(user.userId), expected: [] },
      { route: UNBLOCK(user.userId), expected: ['core.account.unblock'] },
      { route: UNBLOCK(user.userId), expected: [] },
    ];

    for (const { route, expected } of calls) {
      const response = await t.call(admin.browser, route, {});
      expect(response.status).toBe(200);
      expect(await rowsFor(requestIdOf(response))).toStrictEqual(
        expected.map((action) =>
          regel(action, { actor: admin.userId, target: user.userId, requestId: requestIdOf(response) }),
        ),
      );
    }
  });

  test('deblokkeren van een account dat niet geblokkeerd was schrijft niets', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Nooit Geblokkeerd');
    const response = await t.call(admin.browser, UNBLOCK(user.userId), {});

    expect(response.status).toBe(200);
    expect(await rowsFor(requestIdOf(response))).toStrictEqual([]);
  });

  test('jezelf blokkeren (OWN_ACCOUNT) schrijft geen regel', async () => {
    const admin = await mfaAdmin();
    const response = await t.call(admin.browser, BLOCK(admin.userId), {});

    expect([response.status, await json(response)]).toMatchObject([409, { code: 'OWN_ACCOUNT' }]);
    expect(await rowsFor(requestIdOf(response))).toStrictEqual([]);
  });

  test('twee admins blokkeren elkaar tegelijk: alleen de geslaagde blokkade heeft een regel, de ander LAST_ADMIN zonder regel', async () => {
    const [a, b] = [await mfaAdmin('Race A'), await mfaAdmin('Race B')];
    const { rows } = await t.migrator.query<{ user_id: string }>(
      "select user_id from public.user_roles where role = 'admin' and user_id not in ($1, $2)",
      [a.userId, b.userId],
    );
    for (const row of rows) await t.migrator.query("select app.assign_role($1, 'user')", [row.user_id]);

    const responses = await Promise.all([
      t.call(a.browser, BLOCK(b.userId), {}),
      t.call(b.browser, BLOCK(a.userId), {}),
    ]);

    const outcomes = await Promise.all(
      responses.map(async (response) => ({ status: response.status, rows: await rowsFor(requestIdOf(response)) })),
    );
    expect(outcomes.filter((outcome) => outcome.status === 200).map((outcome) => outcome.rows.length)).toStrictEqual([
      1,
    ]);
    expect(outcomes.filter((outcome) => outcome.status !== 200).map((outcome) => outcome.rows)).toStrictEqual([[]]);
  });
});

describe('een X-Request-Id van de client (AC-26)', () => {
  test('komt in geen enkele auditregel van invite, reinvite, block en unblock', async () => {
    const admin = await mfaAdmin();
    const user = await t.account('user', 'Vervalst');
    const forged = (name: string) => ({ 'X-Request-Id': `vervalst-${name}-${crypto.randomUUID()}` });
    const withForged = async (route: string, body: unknown, name: string) => {
      const headers = forged(name);
      const response = await t.callWith(admin.browser, route, { body, headers });
      return { response, forgedId: headers['X-Request-Id'] };
    };
    const calls = [
      await withForged(INVITE, { naam: 'Vervalst', email: uniqueEmail('audit-forged'), rol: 'user' }, 'invite'),
      await withForged(BLOCK(user.userId), {}, 'block'),
      await withForged(UNBLOCK(user.userId), {}, 'unblock'),
    ];
    const invited = await invite(admin.browser);
    calls.push(await withForged(REINVITE(invited.id), {}, 'reinvite'));

    for (const { response, forgedId } of calls) {
      expect(response.status).toBe(200);
      expect(requestIdOf(response)).not.toBe(forgedId);
      expect(await rowsFor(forgedId)).toStrictEqual([]);
      expect((await rowsFor(requestIdOf(response))).length).toBeGreaterThan(0);
    }
  });
});

describe('verboden rollen (AC-27): geen regel', () => {
  const routes = [
    ['invite', () => INVITE, { naam: 'X', email: 'x@example.test', rol: 'user' }],
    ['reinvite', (id: string) => REINVITE(id), {}],
    ['block', (id: string) => BLOCK(id), {}],
    ['unblock', (id: string) => UNBLOCK(id), {}],
  ] as const;

  test.each(routes)(
    '%s: user krijgt FORBIDDEN, admin zonder MFA MFA_REQUIRED, beide zonder regel',
    async (_, route, body) => {
      const victim = await t.account('user', 'Slachtoffer');
      const user = await t.account('user', 'Gewone Gebruiker');
      const admin = await t.account('admin', 'Zonder MFA');
      const forUser = await t.call(user.browser, route(victim.userId), body);
      const forAdmin = await t.call(admin.browser, route(victim.userId), body);

      expect([forUser.status, await json(forUser)]).toMatchObject([403, { code: 'FORBIDDEN' }]);
      expect([forAdmin.status, await json(forAdmin)]).toMatchObject([403, { code: 'MFA_REQUIRED' }]);
      expect(await rowsFor(requestIdOf(forUser))).toStrictEqual([]);
      expect(await rowsFor(requestIdOf(forAdmin))).toStrictEqual([]);
    },
  );
});
