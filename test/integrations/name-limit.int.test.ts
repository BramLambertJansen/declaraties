import pg from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import { INTEGRATION_NAME_MAX_LENGTH } from '../../src/core/shared/limits.ts';
import { required } from '../auth/harness.ts';

// Spec koppelingsregister, "Raakt ook": INTEGRATION_NAME_MAX_LENGTH in src/core/shared/limits.ts is gelijk aan de CHECK op
// app.integration_switches.name en aan de naamcontrole van de functies (vorm van test/datapad/audit-limits.int.test.ts).
// Als app_migrator in een transactie die terugdraait (`pnpm test:db`).
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

// Voert één statement uit in een savepoint; geeft 'ok' of de sqlstate.
async function stateOf(statement: string, values: unknown[], role?: string): Promise<string> {
  await client.query('savepoint poging');
  try {
    if (role !== undefined) await client.query(`set local role ${role}`);
    await client.query(statement, values);
    return 'ok';
  } catch (error) {
    return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'onbekend';
  } finally {
    await client.query('rollback to savepoint poging');
  }
}

const atLimit = 'a'.repeat(INTEGRATION_NAME_MAX_LENGTH);
const overLimit = 'a'.repeat(INTEGRATION_NAME_MAX_LENGTH + 1);

describe('limits.ts en de CHECK van app.integration_switches', () => {
  test('de CHECK op name noemt INTEGRATION_NAME_MAX_LENGTH', async () => {
    const { rows } = await client.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'app.integration_switches'::regclass and contype = 'c'",
    );

    expect(rows.map((row) => row.def).filter((def) => def.includes(String(INTEGRATION_NAME_MAX_LENGTH)))).toHaveLength(
      1,
    );
  });

  test('een naam van precies INTEGRATION_NAME_MAX_LENGTH tekens past in de tabel, één teken meer faalt met 23514', async () => {
    const insert = 'insert into app.integration_switches (name, enabled) values ($1, true)';

    expect(await stateOf(insert, [atLimit], 'app_definer')).toBe('ok');
    expect(await stateOf(insert, [overLimit], 'app_definer')).toBe('23514');
  });

  test('app.set_integration_enabled: precies de grens mag, één teken meer is 22023', async () => {
    const call = 'select app.set_integration_enabled($1, true)';

    expect(await stateOf(call, [atLimit])).toBe('ok');
    expect(await stateOf(call, [overLimit])).toBe('22023');
  });
});
