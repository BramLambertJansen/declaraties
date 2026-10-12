import pg from 'pg';
import { afterAll, beforeEach, afterEach, describe, expect, test } from 'vitest';
import { MAX_AUDIT_DETAILS_BYTES, MAX_AUDIT_TARGET_ID_LENGTH } from '../../src/core/shared/limits.ts';
import { required } from '../auth/harness.ts';

// De grenzen in src/core/shared/limits.ts zijn gelijk aan de CHECK-waarden van app.audit_log (spec audit-log, "Raakt ook"
// en .claude/rules/database.md): één bron in TypeScript, de database bewijst de grens. Draait als app_definer in een
// transactie die terugdraait (`pnpm test:db`, ADR 0009).
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

// Een jsonb-object van precies `bytes` bytes in tekstvorm: 140 sleutels van 14 bytes, plus één opvulwaarde van 9 + m bytes
// (alleen korte waarden zonder spaties of @).
const BASE_KEYS = 140;
const BASE_BYTES = 14 * BASE_KEYS;
function detailsOfSize(bytes: number): string {
  const details: Record<string, string> = {};
  for (let i = 1; i <= BASE_KEYS; i += 1) details[`k${String(i).padStart(4, '0')}`] = 'v';
  details['p'] = 'x'.repeat(bytes - BASE_BYTES - 9);
  return JSON.stringify(details);
}

// Voert één insert als app_definer uit in een savepoint; geeft 'ok' of de sqlstate.
async function insertAsDefinerState(column: 'details' | 'target_id', value: string): Promise<string> {
  await client.query('savepoint poging');
  try {
    await client.query('set local role app_definer');
    await client.query(`insert into app.audit_log (action, ${column}) values ('a.b', $1)`, [value]);
    return 'ok';
  } catch (error) {
    return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'onbekend';
  } finally {
    await client.query('rollback to savepoint poging');
  }
}

describe('limits.ts en de CHECKs van app.audit_log', () => {
  test('de CHECK op details noemt MAX_AUDIT_DETAILS_BYTES, die op target_id MAX_AUDIT_TARGET_ID_LENGTH', async () => {
    const { rows } = await client.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'app.audit_log'::regclass and contype = 'c'",
    );
    const defs = rows.map((row) => row.def);

    expect(
      defs.filter((def) => def.includes('octet_length') && def.includes(`<= ${String(MAX_AUDIT_DETAILS_BYTES)}`)),
    ).toHaveLength(1);
    expect(defs.filter((def) => def.includes(`{1,${String(MAX_AUDIT_TARGET_ID_LENGTH)}}`))).toHaveLength(1);
  });

  test('details van precies MAX_AUDIT_DETAILS_BYTES slaagt, één byte meer faalt met 23514', async () => {
    const sizeOf = async (bytes: number) =>
      (await client.query<{ n: number }>('select octet_length($1::jsonb::text) as n', [detailsOfSize(bytes)])).rows[0]
        ?.n;
    expect(await sizeOf(MAX_AUDIT_DETAILS_BYTES)).toBe(MAX_AUDIT_DETAILS_BYTES);
    expect(await sizeOf(MAX_AUDIT_DETAILS_BYTES + 1)).toBe(MAX_AUDIT_DETAILS_BYTES + 1);

    expect(await insertAsDefinerState('details', detailsOfSize(MAX_AUDIT_DETAILS_BYTES))).toBe('ok');
    expect(await insertAsDefinerState('details', detailsOfSize(MAX_AUDIT_DETAILS_BYTES + 1))).toBe('23514');
  });

  test('target_id van precies MAX_AUDIT_TARGET_ID_LENGTH tekens slaagt, één teken meer faalt met 23514', async () => {
    expect(await insertAsDefinerState('target_id', 'a'.repeat(MAX_AUDIT_TARGET_ID_LENGTH))).toBe('ok');
    expect(await insertAsDefinerState('target_id', 'a'.repeat(MAX_AUDIT_TARGET_ID_LENGTH + 1))).toBe('23514');
  });
});
