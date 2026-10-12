import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { beginTestDb, createPool, type TestDb, type TestUser } from '../../src/core/api/db/testing.ts';
import { AppError } from '../../src/core/api/errors.ts';
import { createApp } from '../../src/core/api/http/create-app.ts';
import { createRouteKit } from '../../src/core/api/route/kit.ts';
import { defineAuditActions } from '../../src/core/shared/audit.ts';
import { definePermissions } from '../../src/core/shared/can.ts';
import { createContracts } from '../../src/core/shared/contract.ts';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';
import { required } from '../auth/harness.ts';

// Een app registreert een eigen auditactie zonder src/core te wijzigen (spec audit-log AC-30, zoals voor foutcodes in
// .claude/rules/core.md), en een route die daarna faalt of foute details meegeeft laat niets achter (AC-29, AC-31).
// Echte database via de testkit (`pnpm test:db`, ADR 0009); alles draait terug.
// Staat in test/ en niet naast de core-code: de lintregel rails/process-env staat process.env in src/ niet toe.
const pool = createPool(required('MIGRATOR_DATABASE_URL'));
afterAll(async () => {
  await pool.end();
});

let db: TestDb;
beforeEach(async () => {
  db = await beginTestDb(pool);
});
afterEach(async () => {
  await db.rollback();
});

const permissions = definePermissions({ 'notes:write': { roles: ['user', 'admin'] } });
const { defineContract } = createContracts(permissions);
const audit = defineAuditActions({
  'note.archive': { target: 'note', details: z.object({ reason: z.string() }) },
});
const { defineRoute } = createRouteKit({ permissions, audit });

type Loose = (action: string, targetId: string, details: object) => Promise<void>;
const input = z.object({ id: z.string() }).strict();
const output = z.null();
const contractFor = (path: `/${string}`) =>
  defineContract({ method: 'POST', path, input, output, permission: 'notes:write' });

const archive = defineRoute(contractFor('/notes/archive'), async ({ input: { id }, audit: record }) => {
  await record('note.archive', id, { reason: 'dubbel' });
  return null;
});
const failAfter = defineRoute(contractFor('/notes/fail-after'), async ({ input: { id }, audit: record }) => {
  await record('note.archive', id, { reason: 'dubbel' });
  throw new AppError('INTERNAL_ERROR');
});
// Een effect van de route (rol toekennen) gevolgd door een auditregel met een extra sleutel: alles draait terug.
const badDetails = defineRoute(contractFor('/notes/bad-details'), async ({ input: { id }, tx, audit: record }) => {
  await tx.execute(sql`select app.assign_role(${id}, 'admin')`);
  const loose = unsafeCast<Loose>(record, 'test: details buiten het schema van de registratie');
  await loose('note.archive', id, { reason: 'dubbel', extra: 'x' });
  return null;
});
// Geldig volgens zod, maar het doel-ID valt buiten het patroon van de CHECK: 23514, niet vertaald, dus INTERNAL_ERROR.
const badTarget = defineRoute(contractFor('/notes/bad-target'), async ({ audit: record }) => {
  await record('note.archive', 'a@b', { reason: 'dubbel' });
  return null;
});

const routes = [archive, failAfter, badDetails, badTarget];

function post(
  user: TestUser,
  path: string,
  call: { readonly id: string; readonly headers?: Record<string, string> },
): Promise<Response> {
  const app = createApp({ appOrigin: 'http://localhost:5173', auth: user.auth, withUser: db.withUser, routes });
  return app.fetch(
    new Request(`http://localhost/api${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...call.headers },
      body: JSON.stringify({ id: call.id }),
    }),
  );
}

const row = z
  .object({
    actor_id: z.string().nullable(),
    action: z.string(),
    target_type: z.string().nullable(),
    target_id: z.string().nullable(),
    request_id: z.string().nullable(),
    details: z.record(z.string(), z.unknown()),
  })
  .strict();

// De regels van één request, gelezen als admin met MFA (policy audit_log_select_admin).
async function rowsOf(requestId: string | null) {
  const reader = await db.asUser('admin');
  return db.withUser(reader.actor, async (tx) => {
    const { rows } = await tx.execute(
      sql`select actor_id, action, target_type, target_id, request_id, details from app.audit_log where request_id = ${requestId} order by id`,
    );
    return rows.map((value) => row.parse(value));
  });
}

describe('een app registreert een eigen auditactie (AC-30)', () => {
  test('ctx.audit schrijft een regel met de actor van de sessie en de request_id van de response', async () => {
    const user = await db.asUser('user');
    const response = await post(user, '/notes/archive', { id: 'n-42' });
    const requestId = response.headers.get('x-request-id');

    expect(response.status).toBe(200);
    expect(requestId).not.toBeNull();
    expect(await rowsOf(requestId)).toStrictEqual([
      {
        actor_id: user.actor.userId,
        action: 'note.archive',
        target_type: 'note',
        target_id: 'n-42',
        request_id: requestId,
        details: { reason: 'dubbel' },
      },
    ]);
  });

  test('een X-Request-Id van de client komt niet in de regel', async () => {
    const user = await db.asUser('user');
    const response = await post(user, '/notes/archive', {
      id: 'n-43',
      headers: { 'X-Request-Id': 'vervalst-door-client' },
    });

    expect(await rowsOf('vervalst-door-client')).toStrictEqual([]);
    expect(await rowsOf(response.headers.get('x-request-id'))).toHaveLength(1);
  });
});

describe('een route die faalt laat geen regel achter (AC-29, AC-31)', () => {
  test('ctx.audit en daarna een fout: 500 INTERNAL_ERROR en geen regel', async () => {
    const user = await db.asUser('user');
    const response = await post(user, '/notes/fail-after', { id: 'n-44' });

    expect([response.status, await response.json()]).toMatchObject([500, { code: 'INTERNAL_ERROR' }]);
    expect(await rowsOf(response.headers.get('x-request-id'))).toStrictEqual([]);
  });

  test('details met een extra sleutel: 500 INTERNAL_ERROR, geen regel en het effect van de route draait terug', async () => {
    const admin = await db.asUser('admin');
    const target = await db.asUser('user');
    const response = await post(admin, '/notes/bad-details', { id: target.actor.userId });

    expect([response.status, await response.json()]).toMatchObject([500, { code: 'INTERNAL_ERROR' }]);
    expect(await rowsOf(response.headers.get('x-request-id'))).toStrictEqual([]);
    const roles = await db.withUser(admin.actor, async (tx) => {
      const { rows } = await tx.execute(sql`select role from public.user_roles where user_id = ${target.actor.userId}`);
      return rows.map((value) => z.object({ role: z.string() }).parse(value).role);
    });
    expect(roles).toStrictEqual(['user']);
  });

  test('een doel-ID dat de database weigert (23514): 500 INTERNAL_ERROR en geen regel', async () => {
    const user = await db.asUser('user');
    const response = await post(user, '/notes/bad-target', { id: 'x' });

    expect([response.status, await response.json()]).toMatchObject([500, { code: 'INTERNAL_ERROR' }]);
    expect(await rowsOf(response.headers.get('x-request-id'))).toStrictEqual([]);
  });
});
