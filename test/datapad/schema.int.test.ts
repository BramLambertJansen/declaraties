import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import { userRoles } from '../../src/api/db/schema.ts';
import { beginTestDb, createPool, type TestDb } from '../../src/core/api/db/testing.ts';
import { required } from '../auth/harness.ts';

// Het gegenereerde Drizzle-schema (pnpm db:generate) past op de gemigreerde database, met branded IDs.
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

describe('src/api/db/schema.ts', () => {
  test('een getypte query op user_roles met de branded UserId van de actor', async () => {
    const user = await db.asUser('user');

    const rows = await db.withUser(user.actor, (tx) =>
      tx
        .select({ userId: userRoles.userId, role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, user.actor.userId)),
    );
    expect(rows).toStrictEqual([{ userId: user.actor.userId, role: 'user' }]);
  });
});
