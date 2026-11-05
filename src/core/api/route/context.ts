import type { Role, SessionStrength } from '../../shared/can.ts';
import type { AuditActions, AuditFn } from '../../shared/audit.ts';
import type { UserId } from '../../shared/ids.ts';
import type { Tx } from '../db/types.ts';

// Wat een handler en de partnerstap van de kit krijgen. Een eigen bestand zodat kit.ts (RouteDef) en partner.ts
// (PartnerStep) het allebei gebruiken zonder elkaar in een kring te importeren; kit.ts exporteert het opnieuw.

export interface RouteActor {
  readonly userId: UserId;
  // De sessie van dit verzoek (niet het token): voor routes die sessies tonen of beëindigen.
  readonly sessionId: string;
  readonly role: Role;
  readonly sessionStrength: SessionStrength;
  readonly name: string;
  readonly email: string;
}

// services: wat de app in createApp meegeeft (bijv. uitnodigen via Better Auth); getypt via createRouteKit<…, Services>.
export interface RouteContext<Input, Services = unknown, Audit extends AuditActions = AuditActions> {
  readonly input: Input;
  readonly actor: RouteActor;
  readonly tx: Tx;
  readonly services: Services;
  readonly audit: AuditFn<Audit>;
  // De headers van het verzoek, voor een aanroep van Better Auth namens deze gebruiker (auth.api.* leest de sessie eruit).
  readonly headers: Headers;
  // Externe gevolgen pas na commit; compensatie pas na rollback en vrijgeven van de verbinding.
  readonly afterCommit: (effect: () => Promise<unknown>) => void;
  readonly afterRollback: (effect: () => Promise<unknown>) => void;
}
