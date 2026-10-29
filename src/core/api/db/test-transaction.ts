import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import type { AuthGateway, SessionInfo } from '../auth/auth.ts';
import { translateDatabaseError } from '../errors.ts';
import type { Actor, ActorRole, SessionStrength, TransactionOutcome, Tx, WithUserOptions } from './types.ts';
import { reportTransactionOutcome } from './transaction-observer.ts';
import { checkActor, checkRequestId, consumeRateLimit, createWithUser, enterActor, rateLimited } from './with-user.ts';
import { UserId } from '../../shared/ids.ts';

// Testkit (framework §4, ADR 0042): één transactie per test die aan het eind terugdraait, een savepoint per withUser-aanroep.
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

// Zoals WithUser, maar de testkit genereert de requestId (ADR 0051; OV-A2 van spec audit-log) zodat een test hem niet hoeft te geven.
export type TestWithUser = <T>(
  actor: Actor,
  work: (tx: Tx, actorRole: ActorRole) => Promise<T>,
  options?: Partial<WithUserOptions>,
) => Promise<T>;

export interface TestDb {
  // Zelfde contract als withUser; `readOnly` telt hier niet (een savepoint kan niet read-only worden), `rateLimit` wel.
  readonly withUser: TestWithUser;
  // Een nieuwe gebruiker met deze rol (null: zonder rij in user_roles), alleen zichtbaar binnen deze test.
  readonly asUser: (role: 'user' | 'admin' | null, options?: AsUserOptions) => Promise<TestUser>;
  readonly rollback: () => Promise<void>;
}

// Na een release blijven SET LOCAL en set_config(…, true) tot het eind van de buitenste transactie: terugzetten.
async function leaveActor(client: PoolClient): Promise<void> {
  await client.query('reset role');
  await client.query(
    "select set_config('app.user_id', '', true), set_config('app.session_strength', '', true), set_config('app.request_id', '', true)",
  );
}

function testWithUser(client: PoolClient): TestWithUser {
  let savepoints = 0;
  // Zoals withUser: een savepoint per stap; de telling (rateLimit) in een eigen savepoint vóór die van het werk, zodat
  // een werk dat terugrolt toch meetelt (spec rate-limit).
  const inSavepoint = async <T>(run: () => Promise<T>, observe?: (outcome: TransactionOutcome) => void): Promise<T> => {
    savepoints += 1;
    const savepoint = `with_user_${String(savepoints)}`;
    await client.query(`savepoint ${savepoint}`);
    let outcome: TransactionOutcome = 'unknown';
    try {
      const result = await run();
      await client.query(`release savepoint ${savepoint}`);
      outcome = 'committed';
      return result;
    } catch (error) {
      await client.query(`rollback to savepoint ${savepoint}`);
      outcome = 'rolledBack';
      throw translateDatabaseError(error);
    } finally {
      try {
        await leaveActor(client);
      } finally {
        observe?.(outcome);
      }
    }
  };
  return async (actor, work, options = {}) => {
    const { rateLimit, requestId = randomUUID() } = options;
    checkActor(actor);
    checkRequestId(requestId);
    if (rateLimit !== undefined) {
      const retryAfter = await inSavepoint(async () => {
        await enterActor(client, actor, requestId);
        return consumeRateLimit(client, rateLimit);
      });
      if (retryAfter > 0) throw rateLimited(retryAfter);
    }
    // In deze terugdraaiende testkit is dit de logische savepointuitkomst, geen duurzame databasecommit.
    return inSavepoint(
      async () => work(drizzle({ client }), await enterActor(client, actor, requestId)),
      (outcome) => {
        reportTransactionOutcome({ ...options, requestId }, outcome);
      },
    );
  };
}

// De echte withUser op een eigen pool (voor lek- en racetests), met een gegenereerde requestId zodat een test hem niet hoeft te geven.
export function createTestWithUser(pool: Pool): TestWithUser {
  const withUser = createWithUser(pool);
  return (actor, work, options) => withUser(actor, work, { ...options, requestId: options?.requestId ?? randomUUID() });
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
