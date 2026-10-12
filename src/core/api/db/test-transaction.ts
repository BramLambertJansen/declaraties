import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import type { AuthGateway, SessionInfo } from '../auth/auth.ts';
import { translateDatabaseError } from '../errors.ts';
import type { Actor, SessionStrength, WithUser } from './types.ts';
import { checkActor, consumeRateLimit, enterActor, rateLimited } from './with-user.ts';
import { UserId } from '../../shared/ids.ts';

// Testkit (framework §4, ADR 0012): één transactie per test die aan het eind terugdraait, een savepoint per withUser-aanroep.
// Alleen via testing.ts, dus alleen vanuit testbestanden (dependency-cruiser: testing-alleen-in-tests).

export interface TestUser {
  readonly actor: Actor;
  readonly name: string;
  readonly email: string;
  // Een AuthGateway die altijd de sessie van deze gebruiker geeft: voor createApp met de echte database en RLS.
  readonly auth: AuthGateway;
}

export interface AsUserOptions {
  // Standaard: mfa voor admin (de gewone admin-sessie), anders password.
  readonly sessionStrength?: SessionStrength;
  readonly name?: string;
}

export interface TestDb {
  // Zelfde contract als withUser; `readOnly` telt hier niet (een savepoint kan niet read-only worden), `rateLimit` wel.
  readonly withUser: WithUser;
  // Een nieuwe gebruiker met deze rol (null: zonder rij in user_roles), alleen zichtbaar binnen deze test.
  readonly asUser: (role: 'user' | 'admin' | null, options?: AsUserOptions) => Promise<TestUser>;
  readonly rollback: () => Promise<void>;
}

// Na een release blijven SET LOCAL en set_config(…, true) tot het eind van de buitenste transactie: terugzetten.
async function leaveActor(client: PoolClient): Promise<void> {
  await client.query('reset role');
  await client.query("select set_config('app.user_id', '', true), set_config('app.session_strength', '', true)");
}

function testWithUser(client: PoolClient): WithUser {
  let savepoints = 0;
  // Zoals withUser: een savepoint per stap; de telling (rateLimit) in een eigen savepoint vóór die van het werk, zodat
  // een werk dat terugrolt toch meetelt (spec rate-limit).
  const inSavepoint = async <T>(run: () => Promise<T>): Promise<T> => {
    savepoints += 1;
    const savepoint = `with_user_${String(savepoints)}`;
    await client.query(`savepoint ${savepoint}`);
    try {
      const result = await run();
      await client.query(`release savepoint ${savepoint}`);
      return result;
    } catch (error) {
      await client.query(`rollback to savepoint ${savepoint}`);
      throw translateDatabaseError(error);
    } finally {
      await leaveActor(client);
    }
  };
  return async (actor, work, options = {}) => {
    checkActor(actor);
    const { rateLimit } = options;
    if (rateLimit !== undefined) {
      const retryAfter = await inSavepoint(async () => {
        await enterActor(client, actor);
        return consumeRateLimit(client, rateLimit);
      });
      if (retryAfter > 0) throw rateLimited(retryAfter);
    }
    return inSavepoint(async () => work(drizzle({ client }), await enterActor(client, actor)));
  };
}

function gatewayFor(session: SessionInfo): AuthGateway {
  return {
    handler: () => Promise.resolve(new Response(null, { status: 404 })),
    getSession: () => Promise.resolve({ session, setCookie: [] }),
  };
}

// De pool verbindt als app_migrator (MIGRATOR_DATABASE_URL, alleen in test/): die mag binnen de testtransactie een
// gebruiker in better_auth aanmaken en zonder actor een rol toekennen, en via SET ROLE app_authenticated worden
// (db/init/02-test-tools.sql). Dit is de enige plek buiten Better Auth die rijen in better_auth schrijft; alles draait terug.
export async function beginTestDb(pool: Pool): Promise<TestDb> {
  const client = await pool.connect();
  await client.query('begin');
  const asUser: TestDb['asUser'] = async (role, options = {}) => {
    const id = UserId.parse(`test-${randomUUID()}`);
    const name = options.name ?? 'Test Gebruiker';
    const email = `${id}@test.local`;
    await client.query('insert into better_auth."user" (id, name, email, "emailVerified") values ($1, $2, $3, true)', [
      id,
      name,
      email,
    ]);
    if (role !== null) await client.query('select app.assign_role($1, $2)', [id, role]);
    const sessionStrength = options.sessionStrength ?? (role === 'admin' ? 'mfa' : 'password');
    const actor = { userId: id, sessionStrength };
    return { actor, name, email, auth: gatewayFor({ ...actor, sessionId: `sessie-${id}`, name, email }) };
  };
  return {
    withUser: testWithUser(client),
    asUser,
    rollback: async () => {
      try {
        await client.query('rollback');
      } finally {
        client.release();
      }
    },
  };
}
