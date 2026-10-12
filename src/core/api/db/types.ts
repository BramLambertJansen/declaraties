import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { UserId } from '../../shared/ids.ts';

// Alleen types (geen pool, geen verbinding): route-code en createApp typen hiermee zonder index.ts te laden.

// Drizzle over de verbinding van één transactie (ADR 0012); de handler ziet nooit de pool. Het schema komt uit de
// introspectie (stuk 5c); tot dan queries via sql``.
export type Tx = NodePgDatabase;

export type SessionStrength = 'password' | 'mfa';

// userId is een branded UserId (framework §4, ADR 0012): dezelfde brand als de kolommen in het Drizzle-schema.
export interface Actor {
  readonly userId: UserId;
  readonly sessionStrength: SessionStrength;
}

// Rate limit (spec rate-limit): één telling per request in een eigen korte transactie vóór die van de route, zodat een
// read-only GET ook telt en een route die faalt en terugrolt toch meetelt. De sleutel is bucket + de actor, nooit gekozen
// door de aanroeper. Boven max: AppError RATE_LIMITED met retryAfter in seconden.
export interface RateLimit {
  readonly bucket: string;
  readonly windowSeconds: number;
  readonly max: number;
}

export interface WithUserOptions {
  // De server-gegenereerde requestId (ADR 0021): komt als `app.request_id` in de transactie, voor de auditregels.
  readonly requestId: string;
  // GET-routes: de transactie is read only (framework §6).
  readonly readOnly?: boolean;
  readonly rateLimit?: RateLimit;
}

// Wat withUser binnen de transactie al weet: de rol uit user_roles (framework §6: per request uit de database), of null.
export interface ActorRole {
  readonly role: 'user' | 'admin' | null;
}

export type WithUser = <T>(
  actor: Actor,
  work: (tx: Tx, actorRole: ActorRole) => Promise<T>,
  options: WithUserOptions,
) => Promise<T>;
