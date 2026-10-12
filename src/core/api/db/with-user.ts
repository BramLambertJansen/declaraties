import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import { AppError, translateDatabaseError } from '../errors.ts';

import type { Actor, ActorRole, RateLimit, WithUser } from './types.ts';

export type { Actor, ActorRole, RateLimit, SessionStrength, Tx, WithUser, WithUserOptions } from './types.ts';

const STRENGTHS: ReadonlySet<string> = new Set(['password', 'mfa']);

// De types dekken dit al; de controle blijft omdat een actor uiteindelijk uit een sessie in de database komt.
export function checkActor(actor: { readonly userId: string; readonly sessionStrength: string }): void {
  if (actor.userId === '') throw new Error('withUser: lege userId');
  if (!STRENGTHS.has(actor.sessionStrength)) {
    throw new Error(`withUser: ongeldige sessiesterkte '${actor.sessionStrength}' (alleen password of mfa)`);
  }
}

// Zonder requestId kan een auditregel niet aan de request-log gekoppeld worden (ADR 0021): weigeren vóór een verbinding.
export function checkRequestId(requestId: string): void {
  if (requestId === '') throw new Error('withUser: lege requestId');
}

class LeakedConnectionError extends Error {
  constructor() {
    super('withUser: verbinding begon niet als session_user; weggegooid');
  }
}

// De actor-stap binnen een open transactie; ook gebruikt door de testkit (testing.ts), daar binnen een savepoint.
export async function enterActor(client: PoolClient, actor: Actor, requestId: string): Promise<ActorRole> {
  // Een verbinding met een andere rol dan waarmee hij inlogde, lekt van een vorige gebruiker: weigeren en weggooien.
  const { rows } = await client.query<{ clean: boolean }>('select current_user = session_user as clean');
  if (rows[0]?.clean !== true) throw new LeakedConnectionError();
  await client.query('set local role app_authenticated');
  // is_local = true: de waarden verdwijnen bij commit of rollback, ook achter een pooler in transaction mode.
  // app.request_id: de server-gegenereerde requestId voor de auditregels (ADR 0021); app.request_id() leest hem.
  await client.query(
    "select set_config('app.user_id', $1, true), set_config('app.session_strength', $2, true), set_config('app.request_id', $3, true)",
    [actor.userId, actor.sessionStrength, requestId],
  );
  // De rol hoort bij elke request (framework §6); de policy user_roles_select_own laat alleen de eigen rij zien.
  const { rows: roles } = await client.query<{ role: string }>(
    'select role from public.user_roles where user_id = $1',
    [actor.userId],
  );
  const role = roles[0]?.role;
  return { role: role === 'user' || role === 'admin' ? role : null };
}

// De telling zelf (spec rate-limit), binnen een open transactie of savepoint ná enterActor: 0 = toegestaan, anders het
// aantal seconden tot het venster afloopt.
export async function consumeRateLimit(client: PoolClient, limit: RateLimit): Promise<number> {
  const { rows } = await client.query<{ retry_after: number }>(
    'select app.consume_rate_limit($1, $2, $3) as retry_after',
    [limit.bucket, limit.windowSeconds, limit.max],
  );
  return rows[0]?.retry_after ?? 0;
}

export function rateLimited(retryAfter: number): AppError {
  return new AppError('RATE_LIMITED', { retryAfter });
}

async function transaction<T>(client: PoolClient, begin: string, run: () => Promise<T>): Promise<T> {
  await client.query(begin);
  const result = await run();
  await client.query('commit');
  return result;
}

// Eén transactie per request met rol app_authenticated, app.user_id en app.session_strength (framework §6); met
// rateLimit eerst een eigen korte transactie voor de telling, op dezelfde verbinding (spec rate-limit, OV-2).
// Databasefouten worden vertaald naar AppError (src/core/api/errors.ts); faalt de telling, dan faalt de request (fail closed).
export function createWithUser(pool: Pool): WithUser {
  return async (actor, work, options) => {
    const { rateLimit, requestId } = options;
    checkActor(actor);
    checkRequestId(requestId);
    const client = await pool.connect();
    let destroy = false;
    try {
      if (rateLimit !== undefined) {
        const retryAfter = await transaction(client, 'begin', async () => {
          await enterActor(client, actor, requestId);
          return consumeRateLimit(client, rateLimit);
        });
        if (retryAfter > 0) throw rateLimited(retryAfter);
      }
      return await transaction(client, options.readOnly === true ? 'begin read only' : 'begin', async () =>
        work(drizzle({ client }), await enterActor(client, actor, requestId)),
      );
    } catch (error) {
      destroy = error instanceof LeakedConnectionError;
      await client.query('rollback').catch(() => {
        destroy = true;
      });
      throw translateDatabaseError(error);
    } finally {
      client.release(destroy);
    }
  };
}
