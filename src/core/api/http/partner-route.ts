import type { Context } from 'hono';
import { rateLimitCategory, type Contract } from '../../shared/contract.ts';
import type { AuthGateway, SessionInfo } from '../auth/auth.ts';
import { createAuditFn } from '../db/audit.ts';
import type { ActorRole, RateLimit, WithUser } from '../db/types.ts';
import { AppError } from '../errors.ts';
import { readSwitch, type Integrations } from '../integrations/index.ts';
import { timeDatabase } from '../obs/request-log.ts';
import { guardWithUser } from '../outbound/index.ts';
import type { RouteActor, RouteDef } from '../route/kit.ts';
import { createRouteEffects } from './route-effects.ts';

// Het pad van een route met partnerstap (spec partnerstap, ADR 0077 punt 3 en 7). createApp doet stap 1 (sessie, ruwe
// input) en geeft hier door:
// 2. eerste withUser, read-only, met de rate limit: input, rol, permissie en MFA, dan load en readSwitch;
// 3. call buiten elke transactie en buiten de markering (geen verbinding vast tijdens de aanroep);
// 4. de sessie opnieuw (deactiveren of blokkeren laat de rol staan; withUser leest alleen user_roles);
// 5. tweede withUser zonder rate limit: rol en permissie opnieuw, de handler met ctx.partner, de outputcontrole.
// Fouten: een AppError (ook UPSTREAM_* uit de client) gaat ongewijzigd naar buiten; al het andere wordt in onError
// INTERNAL_ERROR. De kit vertaalt niets zelf en voegt geen eigen time-out toe.

type Route<Services> = RouteDef<Contract, Services>;
type Step<Services> = NonNullable<Route<Services>['partner']>;
// De geparste input zoals de handler hem verwacht (z.output van het contract).
type ParsedInput<Services> = Parameters<Step<Services>['handler']>[0]['input'];

export interface PartnerRequest<Services> {
  readonly auth: AuthGateway;
  readonly withUser: WithUser;
  readonly session: SessionInfo;
  // Ruwe input plus padparameters, nog niet geparsed: parsen gebeurt in de eerste transactie, na de telling.
  readonly rawInput: () => unknown;
  readonly services: Services;
  readonly rateLimit: RateLimit;
}

interface Run<Services> {
  readonly c: Context;
  readonly route: Route<Services>;
  readonly step: Step<Services>;
  readonly request: PartnerRequest<Services>;
}

// Rol en permissie (incl. MFA) zoals in de gewone route: geen rol in user_roles = geen toegang (framework §6).
function authorize<Services>(route: Route<Services>, session: SessionInfo, role: ActorRole['role']): RouteActor {
  if (role === null) throw new AppError('FORBIDDEN');
  const decision = route.check({ role, sessionStrength: session.sessionStrength });
  if (!decision.ok) throw new AppError(decision.code);
  return { ...session, role };
}

// Stap 2: read-only, één telling per verzoek; de verbinding gaat terug naar de pool vóór de aanroep.
function loadStep<Services>({ c, route, step, request }: Run<Services>) {
  const { session } = request;
  return timeDatabase(c.get('requestFacts'), () =>
    guardWithUser(request.withUser)(
      { userId: session.userId, sessionStrength: session.sessionStrength },
      async (tx, { role }) => {
        // Eerst de input (VALIDATION vóór FORBIDDEN), dan rol en permissie, dan load, dan de schakelaar.
        const parsed = route.contract.input.safeParse(request.rawInput());
        if (!parsed.success) throw new AppError('VALIDATION');
        const actor = authorize(route, session, role);
        const loaded = await step.load({ input: parsed.data, actor, tx });
        const reading = await readSwitch(tx, step.integration);
        return { input: parsed.data, actor, loaded, reading };
      },
      { readOnly: true, rateLimit: request.rateLimit, requestId: c.get('requestId') },
    ),
  );
}

// Stap 4: de sessie opnieuw; geen sessie of een andere gebruiker is UNAUTHENTICATED, zonder tweede transactie.
async function refreshSession<Services>({ c, request }: Run<Services>): Promise<SessionInfo> {
  const { session, setCookie } = await request.auth.getSession(c.req.raw.headers);
  for (const cookie of setCookie) c.header('set-cookie', cookie, { append: true });
  if (session === null || session.userId !== request.session.userId) throw new AppError('UNAUTHENTICATED');
  return session;
}

// Stap 5: zonder rate limit, read-only alleen bij GET; afterCommit en afterRollback zoals bij een gewone route.
function handlerStep<Services>(
  run: Run<Services>,
  session: SessionInfo,
  before: { input: ParsedInput<Services>; partner: unknown },
) {
  const { c, route, step, request } = run;
  const { contract } = route;
  const requestId = c.get('requestId');
  const effects = createRouteEffects({ requestId, route: `${contract.method} /api${contract.path}` });
  return effects.run(() =>
    timeDatabase(c.get('requestFacts'), () =>
      guardWithUser(request.withUser)(
        { userId: session.userId, sessionStrength: session.sessionStrength },
        async (tx, { role }) => {
          const actor = authorize(route, session, role);
          const result = await step.handler({
            input: before.input,
            actor,
            tx,
            services: request.services,
            audit: createAuditFn(tx, route.audit),
            headers: c.req.raw.headers,
            afterCommit: effects.afterCommit,
            afterRollback: effects.afterRollback,
            partner: before.partner,
          });
          // Een output die niet bij het contract past, is een bug: INTERNAL_ERROR, nooit de data.
          return contract.output.parse(result);
        },
        { readOnly: contract.method === 'GET', requestId, onTransactionOutcome: effects.onTransactionOutcome },
      ),
    ),
  );
}

export async function runPartnerRoute<Services>(
  c: Context,
  route: Route<Services>,
  request: PartnerRequest<Services>,
): Promise<unknown> {
  const step = route.partner;
  if (step === undefined) throw new Error('runPartnerRoute: alleen voor routes uit definePartnerRoute');
  const run: Run<Services> = { c, route, step, request };
  const { input, actor, loaded, reading } = await loadStep(run);
  // Stap 3: buiten elke transactie en buiten de markering; requestId = X-Request-Id.
  const partner = await step.call({
    input,
    actor,
    loaded,
    reading,
    requestId: c.get('requestId'),
    services: request.services,
  });
  const session = await refreshSession(run);
  return handlerStep(run, session, { input, partner });
}

// Opstart (createApp): een partnerroute vraagt rateLimit 'duur' en een koppeling uit het register.
export function assertPartnerRoute<Services>(route: Route<Services>, integrations: Integrations | undefined): void {
  const { partner, contract } = route;
  if (partner === undefined) return;
  const where = `createApp: ${contract.method} ${contract.path}`;
  if (rateLimitCategory(contract) !== 'duur') {
    throw new Error(`${where}: route met partnerstap vraagt rateLimit: 'duur' (ADR 0077, spec partnerstap)`);
  }
  if (integrations === undefined) {
    throw new Error(`${where}: route met partnerstap vraagt integrations (het koppelingsregister)`);
  }
  if (!integrations.has(partner.integration)) {
    throw new Error(
      `${where}: koppeling '${partner.integration}' staat niet in het register (spec koppelingsregister)`,
    );
  }
}
