import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, expect, test } from 'vitest';
import { createWithUser } from '../../src/core/api/db/testing.ts';
import { UserId } from '../../src/core/shared/ids.ts';
import { required } from '../auth/harness.ts';
import { createAccountTestApp } from './account-harness.ts';

const t = createAccountTestApp();
const pool = new pg.Pool({ connectionString: required('DATABASE_URL'), max: 3, application_name: 'review-audit-race' });
const withUser = createWithUser(pool);
afterAll(() => Promise.all([t.close(), pool.end()]));

async function waitForBothLocks() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { rows } = await pool.query<{ count: number }>(
      "select count(*)::int as count from pg_stat_activity where application_name = 'review-audit-race' and wait_event_type = 'Lock'",
    );
    if (rows[0]?.count === 2) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('de twee concurrerende requests wachten niet op de testlock');
}

test.each([true, false])(
  'twee gelijktijdige statuswijzigingen (%s) op hetzelfde account schrijven samen één auditregel',
  async (blocked) => {
    const admin = await t.account('admin');
    const victim = await t.account('user');
    const actor = { userId: UserId.parse(admin.userId), sessionStrength: 'mfa' } as const;
    if (!blocked)
      await withUser(actor, async (tx) => tx.execute(sql`select app.set_account_blocked(${victim.userId}, true)`));
    const lock = await t.migrator.connect();
    const pending: Promise<unknown>[] = [];
    try {
      await lock.query('begin');
      if (blocked) await lock.query("select pg_advisory_xact_lock(hashtext('public.user_roles:last_admin'))");
      else await lock.query('select id from better_auth."user" where id = $1 for update', [victim.userId]);
      for (let index = 0; index < 2; index += 1)
        pending.push(
          withUser(actor, async (tx) => tx.execute(sql`select app.set_account_blocked(${victim.userId}, ${blocked})`)),
        );
      const outcome = Promise.allSettled(pending);
      await waitForBothLocks();
      await lock.query('commit');
      expect((await outcome).map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    } finally {
      await lock.query('rollback');
      lock.release();
      await Promise.allSettled(pending);
    }
    const action = blocked ? 'core.account.block' : 'core.account.unblock';
    const { rows } = await t.migrator.query<{ count: number }>(
      'select count(*)::int as count from app.audit_log where target_id = $1 and action = $2',
      [victim.userId, action],
    );
    expect(rows[0]?.count).toBe(1);
  },
  15000,
);
