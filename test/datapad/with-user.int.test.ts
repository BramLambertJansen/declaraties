import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, describe, expect, test } from 'vitest';
import { createPool, createWithUser } from '../../src/core/api/db/testing.ts';
import { UserId } from '../../src/core/shared/ids.ts';

// Fase 0, datapad (ADR 0042): withUser() lekt geen gebruiker of rol tussen requests, direct én via PgBouncer
// (transaction mode). Draait alleen via `pnpm test:db` in de runner (ADR 0044).
const PARALLEL = 60;

function url(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} ontbreekt: draai via pnpm test:db`);
  return value;
}

type Seen = {
  id: string | null;
  strength: string;
  role: string;
  readOnly: string;
};

const targets = [
  { name: 'direct', url: url('DATABASE_URL') },
  { name: 'via PgBouncer (transaction mode)', url: url('POOLER_DATABASE_URL') },
];

describe.each(targets)('withUser $name', ({ url: connectionString }) => {
  // Kleiner dan PARALLEL, zodat verbindingen tussen gebruikers worden hergebruikt.
  const pool = createPool(connectionString);
  const withUser = createWithUser(pool);
  const raw = new pg.Pool({ connectionString, max: 2 });
  afterAll(async () => {
    await Promise.all([pool.end(), raw.end()]);
  });

  async function rawState() {
    const { rows } = await raw.query<{ clean: boolean; id: string | null }>(
      "select current_user = session_user as clean, nullif(current_setting('app.user_id', true), '') as id",
    );
    return rows[0];
  }

  test(`${String(PARALLEL)} gelijktijdige requests zien elk alleen hun eigen actor`, async () => {
    const seen = await Promise.all(
      Array.from({ length: PARALLEL }, (_, i) =>
        withUser(
          { userId: UserId.parse(`user-${String(i)}`), sessionStrength: i % 2 === 0 ? 'mfa' : 'password' },
          async (tx) => {
            await tx.execute(sql`select pg_sleep(random() * 0.02)`);
            const { rows } = await tx.execute<Seen>(
              sql`select app.current_user_id() as id, app.session_strength() as strength, current_user as role, current_setting('transaction_read_only') as "readOnly"`,
            );
            return rows[0];
          },
        ),
      ),
    );

    const leaks = seen.filter(
      (row, i) => row?.id !== `user-${String(i)}` || row.strength !== (i % 2 === 0 ? 'mfa' : 'password'),
    );
    expect(leaks).toStrictEqual([]);
    expect(new Set(seen.map((row) => row?.role))).toStrictEqual(new Set(['app_authenticated']));
  });

  test('na de requests is elke verbinding weer schoon (current_user = session_user, geen user_id)', async () => {
    const states = await Promise.all(Array.from({ length: 10 }, () => rawState()));

    expect(states).toStrictEqual(Array.from({ length: 10 }, () => ({ clean: true, id: null })));
  });

  test('een fout in de handler draait terug en laat geen actor achter', async () => {
    await expect(
      withUser({ userId: UserId.parse('user-fout'), sessionStrength: 'mfa' }, async (tx) => {
        await tx.execute(sql`select 1`);
        throw new Error('handler faalt');
      }),
    ).rejects.toThrow('handler faalt');

    expect(await rawState()).toStrictEqual({ clean: true, id: null });
  });

  test('readOnly geeft een read-only transactie', async () => {
    const readOnly = await withUser(
      { userId: UserId.parse('user-get'), sessionStrength: 'password' },
      async (tx) =>
        (await tx.execute<Seen>(sql`select current_setting('transaction_read_only') as "readOnly"`)).rows[0]?.readOnly,
      { readOnly: true },
    );

    expect(readOnly).toBe('on');
  });

  test('api_user zonder withUser() mag niets in schema app', async () => {
    await expect(raw.query('select app.current_user_id()')).rejects.toMatchObject({ code: '42501' });
  });
});

describe('meting (geen grens; de uitkomst gaat naar ADR 0042)', () => {
  test.each(targets)('twee verbindingen per request, $name', async ({ name, url: connectionString }) => {
    const session = createPool(url('AUTH_DATABASE_URL'));
    const pool = createPool(connectionString);
    const withUser = createWithUser(pool);
    const runs = 200;
    const durations: number[] = [];
    try {
      for (let i = 0; i < runs; i += 1) {
        const start = performance.now();
        await session.query('select 1');
        await withUser({ userId: UserId.parse('meting'), sessionStrength: 'password' }, (tx) =>
          tx.execute(sql`select app.current_user_id()`),
        );
        durations.push(performance.now() - start);
      }
    } finally {
      await Promise.all([session.end(), pool.end()]);
    }
    durations.sort((a, b) => a - b);
    const at = (q: number) => (durations[Math.floor(q * (runs - 1))] ?? Number.NaN).toFixed(2);
    console.info(`[meting] ${name}: n=${String(runs)} p50=${at(0.5)} ms p95=${at(0.95)} ms max=${at(1)} ms`);

    expect(durations).toHaveLength(runs);
  });
});
