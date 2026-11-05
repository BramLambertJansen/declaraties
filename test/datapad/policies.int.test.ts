import pg from 'pg';
import { afterAll, expect, test } from 'vitest';
import { pgTapBronnen, policiesZonderTest } from '../../scripts/kit/check-policies.mjs';
import { required } from '../auth/harness.ts';

// check-policies tegen de gemigreerde database: elke policy in public en app heeft een pgTAP-assert op naam.
const pool = new pg.Pool({ connectionString: required('MIGRATOR_DATABASE_URL'), max: 1 });
afterAll(async () => {
  await pool.end();
});

test('elke RLS-policy heeft een pgTAP-test die haar bij naam noemt', async () => {
  const { rows } = await pool.query<{ policyname: string }>(
    "select policyname from pg_policies where schemaname in ('public', 'app') order by policyname",
  );
  const policies = rows.map((row) => row.policyname);

  expect(policies.length).toBeGreaterThan(0);
  expect(policiesZonderTest(policies, pgTapBronnen())).toStrictEqual([]);
});
