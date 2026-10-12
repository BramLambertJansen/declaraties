import type { z } from 'zod';
import type { CanActor, Decision, Permissions, Role, SessionStrength } from '../../shared/can.ts';
import type { AuditActions, AuditFn } from '../../shared/audit.ts';
import type { Contract, Method } from '../../shared/contract.ts';
import type { UserId } from '../../shared/ids.ts';
import type { Tx } from '../db/types.ts';

// defineRoute (framework §1, §6; ADR 0008): de enige manier om een route te maken. createApp accepteert alleen wat hier
// vandaan komt (ROUTE), parseert de input, haalt de actor uit de sessie, draait alles in één withUser-transactie en
// controleert de permissie en de output.
export const ROUTE: unique symbol = Symbol('defineRoute');

export interface RouteActor {
  readonly userId: UserId;
  // De sessie van dit verzoek (niet het token): voor routes die sessies tonen of beëindigen.
  readonly sessionId: string;
  readonly role: Role;
  readonly sessionStrength: SessionStrength;
  readonly name: string;
  readonly email: string;
}

export type { AuditFn };

// services: wat de app in createApp meegeeft (bijv. uitnodigen via Better Auth); getypt via createRouteKit<…, Services>.
export interface RouteContext<Input, Services = unknown, Audit extends AuditActions = AuditActions> {
  readonly input: Input;
  readonly actor: RouteActor;
  readonly tx: Tx;
  readonly services: Services;
  readonly audit: AuditFn<Audit>;
  // De headers van het verzoek, voor een aanroep van Better Auth namens deze gebruiker (auth.api.* leest de sessie eruit).
  readonly headers: Headers;
}

export interface RouteDef<C extends Contract = Contract, Services = unknown> {
  readonly [ROUTE]: true;
  readonly contract: C;
  readonly check: (actor: CanActor) => Decision;
  // De auditacties van de app waarmee de route gemaakt is; createApp bouwt er ctx.audit mee.
  readonly audit: AuditActions;
  readonly handler: (
    ctx: RouteContext<z.output<C['input']>, Services>,
  ) => z.input<C['output']> | Promise<z.input<C['output']>>;
}

export function isRouteDef(value: unknown): value is RouteDef {
  return typeof value === 'object' && value !== null && ROUTE in value;
}

export function createRouteKit<
  Permission extends string,
  Services = unknown,
  Audit extends AuditActions = AuditActions,
>(config: { permissions: Permissions<Permission>; audit: Audit }) {
  return {
    defineRoute: <const M extends Method, const P extends string, I extends z.ZodObject, O extends z.ZodType>(
      contract: Contract<M, P, I, O, Permission>,
      handler: (ctx: RouteContext<z.output<I>, Services, Audit>) => z.input<O> | Promise<z.input<O>>,
    ): RouteDef<Contract<M, P, I, O, Permission>, Services> => ({
      [ROUTE]: true,
      contract,
      check: (actor) => config.permissions.check(actor, contract.permission),
      audit: config.audit,
      handler,
    }),
  };
}
