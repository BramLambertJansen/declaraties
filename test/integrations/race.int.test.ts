import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, expect, test } from 'vitest';
import { required } from '../auth/harness.ts';

// Spec koppelingsregister/AC-9 (R-TEST-03): twee gelijktijdige `app.set_integration_enabled(x, true)` zonder rij geven één
// rij en één auditregel. Een derde verbinding houdt de advisory lock van de functie vast tot beide aanroepen erop wachten;
// zo lopen ze echt gelijk op. Als app_migrator zonder actor (de scripttak, OV-7); elke run een eigen naam. De pool heeft
// vier verbindingen: de lock, twee wachtende aanroepen en de poll van waitForBothLocks.

const APPLICATION = 'koppeling-race';
const pool = new pg.Pool({
  connectionString: required('MIGRATOR_DATABASE_URL'),
  max: 4,
  application_name: APPLICATION,
});
afterAll(async () => {
  await pool.end();
});

async function waitForBothLocks(): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await pool.query<{ count: number }>(
      "select count(*)::int as count from pg_stat_activity where application_name = $1 and wait_event_type = 'Lock'",
      [APPLICATION],
    );
    if (rows[0]?.count === 2) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('de twee gelijktijdige aanroepen wachten niet op de advisory lock');
}

test('koppelingsregister/AC-9: twee gelijktijdige set_integration_enabled(x, true) zonder rij: één rij, één auditregel', async () => {
  const name = `race-${randomUUID().slice(0, 8)}`;
  const lock = await pool.connect();
  const pending: Promise<unknown>[] = [];
  try {
    await lock.query('begin');
    await lock.query("select pg_advisory_xact_lock(hashtext('app.integration_switches:' || $1))", [name]);
    for (let index = 0; index < 2; index += 1)
      pending.push(pool.query('select app.set_integration_enabled($1, true)', [name]));
    const outcome = Promise.allSettled(pending);
    await waitForBothLocks();
    await lock.query('commit');
    expect((await outcome).map((result) => result.status)).toStrictEqual(['fulfilled', 'fulfilled']);
  } finally {
    await lock.query('rollback');
    lock.release();
    await Promise.allSettled(pending);
  }

  const switches = await pool.query('select name, enabled from app.integration_switches where name = $1', [name]);
  const audit = await pool.query<{ action: string }>(
    "select action from app.audit_log where target_type = 'integration' and target_id = $1",
    [name],
  );
  expect(switches.rows).toStrictEqual([{ name, enabled: true }]);
  expect(audit.rows).toStrictEqual([{ action: 'core.integration.enable' }]);
}, 15_000);
