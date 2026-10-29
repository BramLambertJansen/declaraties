import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, expect, test } from 'vitest';
import { createPool, createWithUser } from '../../src/core/api/db/testing.ts';
import type { TransactionOutcome } from '../../src/core/api/db/types.ts';
import { createRouteEffects } from '../../src/core/api/http/route-effects.ts';
import { UserId } from '../../src/core/shared/ids.ts';
import { required } from '../auth/harness.ts';

// Echte Postgres; alleen de unit-suite injecteert een verloren COMMIT-bevestiging in de driver.
const pool = createPool(required('DATABASE_URL'));
const withUser = createWithUser(pool);
const actor = { userId: UserId.parse('outcome-integration'), sessionStrength: 'password' } as const;
afterAll(() => pool.end());

test('echte COMMIT en ROLLBACK rapporteren verschillende uitkomsten', async () => {
  const outcomes: TransactionOutcome[] = [];
  const options = {
    onTransactionOutcome: (outcome: TransactionOutcome) => {
      outcomes.push(outcome);
    },
  };
  await withUser(actor, async (tx) => tx.execute(sql`select 1`), options);
  await expect(
    withUser(
      actor,
      async (tx) => {
        await tx.execute(sql`select 1`);
        throw new Error('confirmed rollback');
      },
      options,
    ),
  ).rejects.toThrow('confirmed rollback');
  expect(outcomes).toEqual(['committed', 'rolledBack']);
});

test('een echte verbroken verbinding levert geen rollbackbewijs of destructieve cleanup', async () => {
  const entered = Promise.withResolvers<number>();
  const resume = Promise.withResolvers<undefined>();
  const effects = createRouteEffects({ requestId: 'disconnect-outcome' });
  const outcomes: TransactionOutcome[] = [];
  let cleanups = 0;
  effects.afterRollback(() => {
    cleanups += 1;
    return Promise.resolve();
  });
  const request = effects.run(() =>
    withUser(
      actor,
      async (tx) => {
        const { rows } = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        const pid = rows[0]?.pid;
        if (pid === undefined) throw new Error('backend pid ontbreekt');
        entered.resolve(pid);
        await resume.promise;
      },
      {
        onTransactionOutcome: (outcome) => {
          outcomes.push(outcome);
          effects.onTransactionOutcome(outcome);
        },
      },
    ),
  );
  const rejected = request.then(
    () => null,
    (error: unknown) => error,
  );
  const killer = new pg.Client({ connectionString: required('DATABASE_URL') });
  await killer.connect();
  try {
    await killer.query('select pg_terminate_backend($1)', [await entered.promise]);
    expect(await rejected).toBeInstanceOf(Error);
    expect(outcomes).toEqual(['unknown']);
    expect(cleanups).toBe(0);
    resume.resolve(undefined);
    await withUser(actor, async (tx) => tx.execute(sql`select 1`));
  } finally {
    resume.resolve(undefined);
    await killer.end();
  }
});
