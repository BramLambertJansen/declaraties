import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import { beginTestDb, createPool, type TestDb } from '../../src/core/api/db/testing.ts';
import { AppError } from '../../src/core/api/errors.ts';
import { buildApp } from '../../src/api/app.ts';
import type { AppServices } from '../../src/api/services.ts';
import { APP_ORIGIN, required } from '../auth/harness.ts';

// Testkit (framework §4, ADR 0012): één transactie per test, savepoint per withUser-aanroep, alles draait terug.
const pool = createPool(required('MIGRATOR_DATABASE_URL'));
afterAll(async () => {
  await pool.end();
});

let db: TestDb;
beforeEach(async () => {
  db = await beginTestDb(pool);
});
afterEach(async () => {
  await db.rollback();
});

const ownRole = (tx: Parameters<Parameters<TestDb['withUser']>[1]>[0]) =>
  tx.execute<{ role: string }>(sql`select role from public.user_roles`).then(({ rows }) => rows.map((row) => row.role));

describe('beginTestDb', () => {
  test('asUser maakt een gebruiker met rol; withUser ziet via RLS alleen de eigen rij', async () => {
    const user = await db.asUser('user');
    await db.asUser('user');

    const seen = await db.withUser(user.actor, async (tx, actorRole) => ({ actorRole, rows: await ownRole(tx) }));
    expect(seen).toStrictEqual({ actorRole: { role: 'user' }, rows: ['user'] });
  });

  test('asUser(null): een gebruiker zonder rol', async () => {
    const nobody = await db.asUser(null);

    expect(await db.withUser(nobody.actor, (_tx, actorRole) => Promise.resolve(actorRole))).toStrictEqual({
      role: null,
    });
  });

  test('een fout draait alleen de eigen savepoint terug; de test gaat door met een schone actor', async () => {
    const admin = await db.asUser('admin');
    const user = await db.asUser('user');

    // Een user kan zichzelf geen admin maken: FORBIDDEN, vertaald zoals in withUser.
    const denied = db.withUser(user.actor, (tx) =>
      tx.execute(sql`select app.assign_role(${user.actor.userId}, 'admin')`),
    );
    await expect(denied).rejects.toBeInstanceOf(AppError);
    await expect(denied).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Daarna werkt de transactie nog, en de schrijfactie van de admin is zichtbaar voor de volgende aanroep.
    await db.withUser(admin.actor, (tx) => tx.execute(sql`select app.assign_role(${user.actor.userId}, 'admin')`));
    expect(await db.withUser(user.actor, ownRole)).toStrictEqual(['admin']);
  });

  test('na elke aanroep zijn rol en actor teruggezet', async () => {
    const user = await db.asUser('user');
    await db.withUser(user.actor, ownRole);

    // Een tweede aanroep zou op de lekcontrole (current_user = session_user) falen als de rol was blijven staan.
    const settings = await db.withUser(user.actor, async (tx) => {
      const { rows } = await tx.execute<{ id: string | null }>(sql`select app.current_user_id() as id`);
      return rows[0]?.id;
    });
    expect(settings).toBe(user.actor.userId);
  });

  test('niets blijft staan na rollback', async () => {
    const user = await db.asUser('user');
    await db.rollback();
    db = await beginTestDb(pool);
    const other = await db.asUser('admin');

    const ids = await db.withUser(other.actor, async (tx) => {
      const { rows } = await tx.execute<{ user_id: string }>(sql`select user_id from public.user_roles`);
      return rows.map((row) => row.user_id);
    });
    expect(ids).not.toContain(user.actor.userId);
  });
});

// GET /api/me gebruikt geen services; buildApp eist ze wel (sinds de accountroutes).
const notUsed = () => Promise.reject(new Error('niet gebruikt in deze test'));
const unusedServices: AppServices = {
  invitations: { invite: notUsed, reinvite: notUsed },
  profile: { rename: notUsed, confirmEmail: notUsed },
  sessions: { list: notUsed, revoke: notUsed, revokeOthers: notUsed },
};

describe('testkit met createApp: de hele pipeline tegen de echte database, zonder Better Auth-sessie', () => {
  const me = (user: Awaited<ReturnType<TestDb['asUser']>>) =>
    buildApp({ appOrigin: APP_ORIGIN, auth: user.auth, withUser: db.withUser, services: unusedServices }).fetch(
      new Request(`${APP_ORIGIN}/api/me`),
    );

  test('admin met MFA: 200 met rol admin', async () => {
    const admin = await db.asUser('admin', { name: 'Test Admin' });
    const response = await me(admin);

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      id: admin.actor.userId,
      naam: 'Test Admin',
      email: admin.email,
      rol: 'admin',
    });
  });

  test('admin zonder MFA: 403 MFA_REQUIRED', async () => {
    const admin = await db.asUser('admin', { sessionStrength: 'password' });
    const response = await me(admin);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MFA_REQUIRED' });
  });
});
