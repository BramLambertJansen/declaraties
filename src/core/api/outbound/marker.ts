import { AsyncLocalStorage } from 'node:async_hooks';
import type { ActorRole, Actor, Tx, WithUser, WithUserOptions } from '../db/types.ts';

// De markering (spec uitgaande-client, ADR 0077 punt 3): binnen een withUser-transactie en in afterCommit weigert de client
// elke aanroep. createApp zet hem om de withUser-callback van elke route, route-effects om afterCommit; guardWithUser dekt
// een withUser buiten een route. src/core/api/db verandert hiervoor niet (kritiek pad, R-WERK-05).
const marker = new AsyncLocalStorage<true>();

// Voert work uit onder de markering; ook wat work asynchroon start, erft hem.
export function forbidOutbound<T>(work: () => T): T {
  return marker.run(true, work);
}

// Voert work uit zonder markering (afterRollback-cleanup), ook als hij vanuit een gemarkeerde context start.
export function allowOutbound<T>(work: () => T): T {
  return marker.exit(work);
}

export function outboundForbidden(): boolean {
  return marker.getStore() === true;
}

// Wikkelt de work-callback van withUser in de markering; server.ts past het één keer toe op de withUser buiten routes.
export function guardWithUser(withUser: WithUser): WithUser {
  return <T>(actor: Actor, work: (tx: Tx, actorRole: ActorRole) => Promise<T>, options: WithUserOptions) =>
    withUser(actor, async (tx, actorRole) => forbidOutbound(async () => work(tx, actorRole)), options);
}
