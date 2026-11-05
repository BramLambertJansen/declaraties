import type { AuditActions } from '../../shared/audit.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { Tx } from '../db/types.ts';
import type { SwitchReading } from '../integrations/index.ts';
import type { RouteActor, RouteContext } from './context.ts';

// De partnerstap (spec partnerstap, ADR 0077 punt 3 en 7): een route leest een partner op verzoek tussen twee
// withUser-transacties. createApp voert de stappen uit in src/core/api/http/partner-route.ts.

export interface PartnerLoadContext<Input> {
  readonly input: Input;
  readonly actor: RouteActor;
  readonly tx: Tx;
}

export interface PartnerCallContext<Input, Services, Loaded> {
  readonly input: Input;
  readonly actor: RouteActor;
  readonly loaded: Loaded;
  readonly reading: SwitchReading;
  // De requestId van het verzoek (X-Request-Id), voor de uitgaande client.
  readonly requestId: string;
  readonly services: Services;
}

export interface PartnerStep<Input, Services, Loaded, Result> {
  // Naam uit het koppelingsregister (spec koppelingsregister); createApp weigert een onbekende bij opstart.
  readonly integration: string;
  // Eerste withUser, read-only: alleen wat de aanroep nodig heeft, en de controle op bestaan en eigenaar van een resource
  // uit de input (NOT_FOUND vóór de aanroep). Optioneel; zonder is loaded undefined.
  readonly load?: (ctx: PartnerLoadContext<Input>) => Promise<Loaded>;
  // Zonder transactie en zonder verbinding; de aanroep zelf via een IntegrationClient met `reading`.
  readonly call: (ctx: PartnerCallContext<Input, Services, Loaded>) => Promise<Result>;
}

// De handler van een partnerroute: RouteContext plus de uitkomst van call.
export type PartnerHandlerContext<Input, Services, Result, Audit extends AuditActions = AuditActions> = RouteContext<
  Input,
  Services,
  Audit
> & { readonly partner: Result };

// RouteDef.partner: de stap zonder typen voor Loaded en Result, zodat createApp één routetype houdt.
export interface PartnerDef<Input, Output, Services> {
  readonly integration: string;
  readonly load: (ctx: PartnerLoadContext<Input>) => Promise<unknown>;
  readonly call: (ctx: PartnerCallContext<Input, Services, unknown>) => Promise<unknown>;
  readonly handler: (ctx: PartnerHandlerContext<Input, Services, unknown>) => Output | Promise<Output>;
}

// Wikkelt call en de handler; alleen hier komen loaded en partner terug in hun type (KAN-7).
export function partnerDef<Input, Output, Services, Loaded, Result, Audit extends AuditActions>(
  step: PartnerStep<Input, Services, Loaded, Result>,
  handler: (ctx: PartnerHandlerContext<Input, Services, Result, Audit>) => Output | Promise<Output>,
): PartnerDef<Input, Output, Services> {
  const { load } = step;
  return {
    integration: step.integration,
    load: load ?? (() => Promise.resolve(undefined)),
    call: (ctx) =>
      step.call({
        ...ctx,
        loaded: unsafeCast<Loaded>(
          ctx.loaded,
          'komt uit load van dezelfde definePartnerRoute; RouteDef bewaart hem zonder type',
        ),
      }),
    handler: (ctx) =>
      handler({
        ...ctx,
        partner: unsafeCast<Result>(
          ctx.partner,
          'komt uit call van dezelfde definePartnerRoute; RouteDef bewaart hem zonder type',
        ),
      }),
  };
}
