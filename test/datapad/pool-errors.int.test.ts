import { once } from 'node:events';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, expect, test } from 'vitest';
import { createPool, createWithUser } from '../../src/core/api/db/testing.ts';
import { UserId } from '../../src/core/shared/ids.ts';

// Een idle verbinding die wegvalt (herstart of failover van de database), stopt het proces niet: pg-pool meldt het als
// 'error' op de pool, en zonder listener is dat een uncaught exception. Draait alleen via `pnpm test:db` (ADR 0044).
function url(): string {
  const value = process.env['DATABASE_URL'];
  if (value === undefined || value === '') throw new Error('DATABASE_URL ontbreekt: draai via pnpm test:db');
  return value;
}

const pool = createPool(url());
const withUser = createWithUser(pool);
const actor = { userId: UserId.parse('00000000-0000-4000-8000-000000000001'), sessionStrength: 'password' as const };

afterAll(async () => {
  await pool.end();
});

test('na het beëindigen van een idle verbinding werkt de volgende withUser()', async () => {
  await withUser(actor, async (tx) => tx.execute(sql`select 1`));
  expect(pool.idleCount).toBeGreaterThan(0);
  // Wacht deterministisch tot de pool de weggevallen verbinding gemeld heeft (en bewijst dat de melding de pool bereikt).
  const lost = once(pool, 'error');
  const admin = new pg.Client({ connectionString: url() });
  await admin.connect();
  try {
    // api_user mag backends van de eigen rol beëindigen; alleen die van deze pool (application_name 'api').
    const { rows } = await admin.query<{ killed: boolean }>(
      "select pg_terminate_backend(pid) as killed from pg_stat_activity where application_name = 'api' and usename = current_user and state = 'idle'",
    );
    expect(rows.some((row) => row.killed)).toBe(true);
  } finally {
    await admin.end();
  }
  await lost;
  await expect(withUser(actor, async (tx) => tx.execute(sql`select 1`))).resolves.toBeDefined();
});
