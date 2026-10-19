import pg from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { RATE_LIMIT_WINDOW_SECONDS, SESSION_ABSOLUTE_SECONDS } from '../../src/core/shared/limits.ts';
import { required } from '../auth/harness.ts';

// De termijnen in app.retention zijn gelijk aan de constanten in src/core/shared/limits.ts (spec achtergrondtaken, jobs/AC-9):
// één bron in TypeScript, de database bewijst de gelijkheid. De rij voor better_auth."rateLimit" volgt met deel D
// (AC-35, AC-41). Leest als app_definer, de enige rol met select op app.retention, in een transactie die terugdraait
// (`pnpm test:db`, ADR 0009).
const pool = new pg.Pool({ connectionString: required('MIGRATOR_DATABASE_URL'), max: 1 });
let client: pg.PoolClient;
beforeEach(async () => {
  client = await pool.connect();
  await client.query('begin');
});
afterEach(async () => {
  try {
    await client.query('rollback');
  } finally {
    client.release();
  }
});
afterAll(async () => {
  await pool.end();
});

const exists = z.object({ ok: z.boolean() });
const row = z.object({ seconds: z.number().nullable(), time_column: z.string().nullable() });

// De rij van een tabel in app.retention, of undefined als de tabel app.retention of de rij ontbreekt.
async function retentionRow(table: string): Promise<z.infer<typeof row> | undefined> {
  const found = await client.query("select to_regclass('app.retention') is not null as ok");
  if (!exists.parse(found.rows[0]).ok) return undefined;
  await client.query('set local role app_definer');
  const result = await client.query(
    'select extract(epoch from keep)::float8 as seconds, time_column from app.retention where table_name = $1::text::regclass',
    [table],
  );
  await client.query('reset role');
  return result.rows[0] === undefined ? undefined : row.parse(result.rows[0]);
}

describe('app.retention is gelijk aan limits.ts (jobs/AC-9)', () => {
  test('app.rate_limits: keep is RATE_LIMIT_WINDOW_SECONDS', async () => {
    expect(await retentionRow('app.rate_limits')).toMatchObject({ seconds: RATE_LIMIT_WINDOW_SECONDS });
  });

  test('better_auth.session: keep is SESSION_ABSOLUTE_SECONDS', async () => {
    expect(await retentionRow('better_auth.session')).toMatchObject({ seconds: SESSION_ABSOLUTE_SECONDS });
  });

  test("better_auth.verification: keep is interval '0' met time_column expiresAt", async () => {
    expect(await retentionRow('better_auth.verification')).toStrictEqual({ seconds: 0, time_column: 'expiresAt' });
  });
});
