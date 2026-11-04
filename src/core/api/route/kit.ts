import type { z } from 'zod';
import type { CanActor, Decision, Permissions } from '../../shared/can.ts';
import type { AuditActions, AuditFn } from '../../shared/audit.ts';
import type { Contract, Method } from '../../shared/contract.ts';
import type { RouteContext } from './context.ts';
import { partnerDef, type PartnerDef, type PartnerHandlerContext, type PartnerStep } from './partner.ts';

// defineRoute en definePartnerRoute (framework §1, §6; ADR 0040): de enige manieren om een route te maken. createApp
// accepteert alleen wat hier vandaan komt (ROUTE), parseert de input, haalt de actor uit de sessie, draait alles in één
// withUser-transactie (met partnerstap: twee, spec partnerstap) en controleert de permissie en de output.
export const ROUTE: unique symbol = Symbol('defineRoute');

export type { AuditFn };
export type { RouteActor, RouteContext } from './context.ts';
export type { PartnerStep } from './partner.ts';

export interface RouteDef<C extends Contract = Contract, Services = unknown> {
  readonly [ROUTE]: true;
  readonly contract: C;
  readonly check: (actor: CanActor) => Decision;
  // De auditacties van de app waarmee de route gemaakt is; createApp bouwt er ctx.audit mee.
  readonly audit: AuditActions;
  readonly handler: (
    ctx: RouteContext<z.output<C['input']>, Services>,
  ) => z.input<C['output']> | Promise<z.input<C['output']>>;
  // Alleen bij definePartnerRoute (spec partnerstap): createApp kiest dan het pad van src/core/api/http/partner-route.ts.
  readonly partner?: PartnerDef<z.output<C['input']>, z.input<C['output']>, Services>;
}

// De handler van een partnerroute loopt via route.partner; createApp roept deze nooit aan.
function partnerOnly(): never {
  throw new Error('definePartnerRoute: de handler loopt alleen via de partnerstap (createApp)');
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
    // Spec partnerstap: Loaded volgt uit load (zonder load undefined), Result uit call; de handler krijgt ctx.partner.
    definePartnerRoute: <
      const M extends Method,
      const P extends string,
      I extends z.ZodObject,
      O extends z.ZodType,
      Result,
      Loaded = undefined,
    >(
      contract: Contract<M, P, I, O, Permission>,
      partner: PartnerStep<z.output<I>, Services, Loaded, Result>,
      handler: (ctx: PartnerHandlerContext<z.output<I>, Services, Result, Audit>) => z.input<O> | Promise<z.input<O>>,
    ): RouteDef<Contract<M, P, I, O, Permission>, Services> => ({
      [ROUTE]: true,
      contract,
      check: (actor) => config.permissions.check(actor, contract.permission),
      audit: config.audit,
      handler: partnerOnly,
      partner: partnerDef(partner, handler),
    }),
  };
}
