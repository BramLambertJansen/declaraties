import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, expect, test } from 'vitest';
import { createPool, createWithUser } from '../../src/core/api/db/testing.ts';
import { UserId } from '../../src/core/shared/ids.ts';
import { required } from '../auth/harness.ts';

const pool = createPool(required('DATABASE_URL'));
const withUser = createWithUser(pool);
const actor = { userId: UserId.parse('disconnect-test'), sessionStrength: 'password' } as const;
afterAll(() => pool.end());

test('backend beëindigen tijdens een wachtende handler stopt alleen die request', async () => {
  const entered = Promise.withResolvers<number>();
  const resume = Promise.withResolvers<undefined>();
  const request = withUser(actor, async (tx) => {
    const { rows } = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    const pid = rows[0]?.pid;
    if (pid === undefined) throw new Error('backend pid ontbreekt');
    entered.resolve(pid);
    await resume.promise;
  });
  const outcome = request.then(
    () => null,
    (error: unknown) => error,
  );
  const killer = new pg.Client({ connectionString: required('DATABASE_URL') });
  await killer.connect();
  try {
    await killer.query('select pg_terminate_backend($1)', [await entered.promise]);
    expect(await outcome).toBeInstanceOf(Error);
    resume.resolve(undefined);
    await expect(withUser(actor, async (tx) => tx.execute(sql`select 1`))).resolves.toBeDefined();
  } finally {
    resume.resolve(undefined);
    await killer.end();
  }
});

test('idle_in_transaction_session_timeout tijdens een handler wordt een gecontroleerde fout', async () => {
  const resume = Promise.withResolvers<undefined>();
  const request = withUser(actor, async (tx) => {
    await tx.execute(sql`set local idle_in_transaction_session_timeout = '100ms'`);
    await resume.promise;
  });
  const outcome = request.then(
    () => null,
    (error: unknown) => error,
  );
  try {
    expect(await outcome).toBeInstanceOf(Error);
    await expect(withUser(actor, async (tx) => tx.execute(sql`select 1`))).resolves.toBeDefined();
  } finally {
    resume.resolve(undefined);
  }
});
