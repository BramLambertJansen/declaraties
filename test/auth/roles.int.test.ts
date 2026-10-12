import { spawnSync } from 'node:child_process';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, describe, expect, test } from 'vitest';
import { createPool, createWithUser } from '../../src/core/api/db/testing.ts';
import { latestMailTo, required, uniqueEmail } from './harness.ts';
import { UserId } from '../../src/core/shared/ids.ts';

// Laatste-admin-regel (spec accounts/AC-9): twee admins met MFA degraderen elkaar tegelijk; precies één slaagt.
const migrator = new pg.Pool({ connectionString: required('MIGRATOR_DATABASE_URL'), max: 2 });
const auth = new pg.Pool({ connectionString: required('AUTH_DATABASE_URL'), max: 2 });
const pool = createPool(required('DATABASE_URL'));
const withUser = createWithUser(pool);
afterAll(async () => {
  await Promise.all([migrator.end(), auth.end(), pool.end()]);
});

async function admin(id: string): Promise<void> {
  await auth.query('insert into "user" (id, name, email, "emailVerified") values ($1, $1, $2, true)', [
    id,
    `${id}@race.test`,
  ]);
  // Telbare admin (ADR 0026, besluit 4): zonder credential-account telt een admin niet mee voor de laatste-admin-regel.
  await auth.query(
    `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     values ($1, $2, 'credential', $2, 'hash', now(), now())`,
    [`${id}-credential`, id],
  );
  await migrator.query("select app.assign_role($1, 'admin')", [id]);
}

describe('laatste admin', () => {
  test('twee admins degraderen elkaar tegelijk: precies één slaagt en er blijft precies één admin', async () => {
    const [a, b] = [UserId.parse(`race-a-${String(Date.now())}`), UserId.parse(`race-b-${String(Date.now())}`)];
    await admin(a);
    await admin(b);
    // Voorwaarde: a en b zijn de enige admins. Andere int-tests committen ook admins (dev-login: de seed-admin), dus
    // die zet de test eerst terug naar user in plaats van op een verse database te rekenen; een admin met MFA ziet alle rollen.
    const others = await withUser({ userId: a, sessionStrength: 'mfa' }, async (tx) => {
      const { rows } = await tx.execute<{ user_id: string }>(
        sql`select user_id from public.user_roles where role = 'admin' and user_id not in (${a}, ${b})`,
      );
      return rows.map((row) => row.user_id);
    });
    await Promise.all(others.map((id) => migrator.query("select app.assign_role($1, 'user')", [id])));
    const admins = await withUser({ userId: a, sessionStrength: 'mfa' }, async (tx) => {
      const { rows } = await tx.execute<{ count: number }>(
        sql`select count(*)::integer as count from public.user_roles where role = 'admin'`,
      );
      return rows[0]?.count;
    });
    expect(admins).toBe(2);

    const demote = (actor: UserId, target: UserId) =>
      withUser({ userId: actor, sessionStrength: 'mfa' }, async (tx) => {
        await tx.execute(sql`select pg_sleep(0.05)`);
        await tx.execute(sql`select app.assign_role(${target}, 'user')`);
      });
    const results = await Promise.allSettled([demote(a, b), demote(b, a)]);

    const winner = results[0].status === 'fulfilled' ? a : b;
    const remaining = await withUser({ userId: winner, sessionStrength: 'mfa' }, async (tx) => {
      const { rows } = await tx.execute<{ user_id: string }>(
        sql`select user_id from public.user_roles where role = 'admin'`,
      );
      return rows.map((row) => row.user_id);
    });

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    // Wie als tweede komt, is al gedegradeerd (FORBIDDEN) of botst binnen de lock op de regel (LAST_ADMIN).
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    const message: unknown = rejected?.reason instanceof Error ? rejected.reason.message : rejected?.reason;
    expect(['LAST_ADMIN', 'FORBIDDEN']).toContain(message);
    expect(remaining).toStrictEqual([winner]);
  });
});

describe('seed weigert buiten lokaal', () => {
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, ['scripts/seed.mjs'], { env: { ...process.env, ...env }, encoding: 'utf8' });

  test('APP_ENV=test wordt geweigerd', () => {
    const result = run({ APP_ENV: 'test' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("seed weigert: APP_ENV is 'test'");
  });

  test('een niet-lokale database wordt geweigerd, ook met APP_ENV=local', () => {
    const result = run({ APP_ENV: 'local' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("seed weigert: database op 'test-db' is niet lokaal");
  });
});

describe('admin:create', () => {
  test('een nieuw adres wordt admin en krijgt een uitnodiging', async () => {
    const email = uniqueEmail('beheer');
    const result = spawnSync(
      process.execPath,
      ['scripts/admin-create.mjs', '--email', email, '--name', 'Nood Beheerder'],
      {
        env: process.env,
        encoding: 'utf8',
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`✓ ${email}: nieuw admin-account`);

    const mail = await latestMailTo(email);
    expect(mail.text).toContain('Hallo Nood Beheerder,');
    const { rows } = await auth.query<{ id: string }>('select id from "user" where email = $1', [email]);
    const role = await withUser({ userId: UserId.parse(rows[0]?.id), sessionStrength: 'password' }, async (tx) => {
      const own = await tx.execute<{ role: string }>(sql`select role from public.user_roles`);
      return own.rows[0]?.role;
    });
    expect(role).toBe('admin');
  });
});
