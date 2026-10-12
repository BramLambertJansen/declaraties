import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { beginTestDb, createPool, createWithUser, type TestDb } from '../../src/core/api/db/testing.ts';
import { createApp } from '../../src/core/api/http/create-app.ts';
import { createRouteKit } from '../../src/core/api/route/kit.ts';
import { defineAuditActions } from '../../src/core/shared/audit.ts';
import { definePermissions } from '../../src/core/shared/can.ts';
import { createContracts } from '../../src/core/shared/contract.ts';
import { UserId } from '../../src/core/shared/ids.ts';
import { required } from '../auth/harness.ts';

// requestId in de database (spec audit-log, deel A, AC-1 t/m AC-3): withUser() zet app.request_id met is_local = true,
// zodat de waarde bij de commit verdwijnt, ook achter een pooler in transaction mode. Alleen via `pnpm test:db` (ADR 0009).
const actor = (name: string) => ({ userId: UserId.parse(name), sessionStrength: 'password' }) as const;
const idOf = z.object({ id: z.string().nullable() });
const READ_ID = "select nullif(current_setting('app.request_id', true), '') as id";

const targets = [
  { name: 'direct', url: required('DATABASE_URL') },
  { name: 'via PgBouncer (transaction mode)', url: required('POOLER_DATABASE_URL') },
];

describe.each(targets)('app.request_id in withUser, $name', ({ url }) => {
  // Eén verbinding: de tweede aanroep hergebruikt dezelfde sessie, dus een lek zou zichtbaar zijn.
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const withUser = createWithUser(pool);
  afterAll(async () => {
    await pool.end();
  });

  const seenIn = (name: string, requestId: string) =>
    withUser(actor(name), async (tx) => idOf.parse((await tx.execute(sql.raw(READ_ID))).rows[0]).id, { requestId });

  test('AC-1: het werk ziet de requestId die withUser kreeg', async () => {
    expect(await seenIn('user-rid', 'R-eerste')).toBe('R-eerste');
  });

  test('AC-3: twee opeenvolgende aanroepen op dezelfde verbinding zien elk hun eigen requestId', async () => {
    expect(await seenIn('user-a', 'R1')).toBe('R1');
    expect(await seenIn('user-b', 'R2')).toBe('R2');
  });

  test('AC-3: na de commit is de requestId weg op de verbinding (is_local)', async () => {
    await seenIn('user-c', 'R-lek');

    expect(idOf.parse((await pool.query(READ_ID)).rows[0]).id).toBeNull();
  });

  test('AC-3: na een fout in het werk is de requestId ook weg', async () => {
    await expect(
      withUser(
        actor('user-d'),
        async (tx) => {
          await tx.execute(sql`select 1`);
          throw new Error('werk faalt');
        },
        { requestId: 'R-fout' },
      ),
    ).rejects.toThrow('werk faalt');

    expect(idOf.parse((await pool.query(READ_ID)).rows[0]).id).toBeNull();
  });

  test('AC-1: ook de rate-limit-transactie en de routetransactie zien de requestId', async () => {
    const seen = await withUser(
      actor('user-e'),
      async (tx) => idOf.parse((await tx.execute(sql.raw(READ_ID))).rows[0]).id,
      { requestId: 'R-limiet', rateLimit: { bucket: 'lezen', windowSeconds: 60, max: 100 } },
    );

    expect(seen).toBe('R-limiet');
  });
});

describe('gelijktijdige requests (direct)', () => {
  test('40 parallelle aanroepen zien elk hun eigen requestId', async () => {
    const pool = createPool(required('DATABASE_URL'));
    const withUser = createWithUser(pool);
    try {
      const seen = await Promise.all(
        Array.from({ length: 40 }, (_, i) =>
          withUser(
            actor(`user-${String(i)}`),
            async (tx) => {
              await tx.execute(sql`select pg_sleep(random() * 0.02)`);
              return idOf.parse((await tx.execute(sql.raw(READ_ID))).rows[0]).id;
            },
            { requestId: `R-${String(i)}` },
          ),
        ),
      );

      expect(seen).toStrictEqual(Array.from({ length: 40 }, (_, i) => `R-${String(i)}`));
    } finally {
      await pool.end();
    }
  });
});

describe('createApp: de requestId is die van de server (AC-2)', () => {
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

  const permissions = definePermissions({ 'notes:read': { roles: ['user', 'admin'] } });
  const { defineContract } = createContracts(permissions);
  const { defineRoute } = createRouteKit({ permissions, audit: defineAuditActions({}) });
  const whoAmI = defineRoute(
    defineContract({
      method: 'POST',
      path: '/request-id',
      input: z.object({}).strict(),
      output: z.object({ id: z.string().nullable() }).strict(),
      permission: 'notes:read',
    }),
    async ({ tx }) => idOf.parse((await tx.execute(sql.raw(READ_ID))).rows[0]),
  );

  test('met een vervalste X-Request-Id: app.request_id is de X-Request-Id van de response', async () => {
    const user = await db.asUser('user');
    const app = createApp({
      appOrigin: 'http://localhost:5173',
      auth: user.auth,
      withUser: db.withUser,
      routes: [whoAmI],
    });
    const response = await app.fetch(
      new Request('http://localhost/api/request-id', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'sec-fetch-site': 'same-origin',
          'X-Request-Id': 'vervalst-door-client',
        },
        body: '{}',
      }),
    );
    const { id } = idOf.parse(await response.json());

    expect(response.status).toBe(200);
    expect(id).not.toBe('vervalst-door-client');
    expect(id).not.toBeNull();
    expect(id).toBe(response.headers.get('x-request-id'));
  });
});
