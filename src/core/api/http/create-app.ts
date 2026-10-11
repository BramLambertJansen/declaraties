import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { coreErrorCodes, type ErrorRegistry } from '../../shared/errors.ts';
import {
  invalidRateLimits,
  MAX_BODY_BYTES,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_SECONDS,
  type RateLimits,
} from '../../shared/limits.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { AuthGateway } from '../auth/auth.ts';
import type { WithUser } from '../db/types.ts';
import { AppError, statusFor } from '../errors.ts';
import { z } from 'zod';
import { ROLES, type Role } from '../../shared/can.ts';
import { rateLimitCategory, type Contract } from '../../shared/contract.ts';
import { requestLog, timeDatabase, type RequestLog } from '../obs/request-log.ts';
import { isRouteDef, type RouteDef } from '../route/kit.ts';
import { csrf } from './csrf.ts';
import type { Readiness } from './readiness.ts';

// Dev-login (spec accountbeheer, framework §3: limitatieve uitzondering, ADR 0014): logt echt in als het seed-account van de
// rol en geeft de set-cookie-regels terug. Alleen meegeven bij APP_ENV=local; zonder bestaat /api/dev/login-as niet (404).
export type DevLogin = (role: Role, headers: Headers) => Promise<readonly string[]>;

interface BaseConfig<Services> {
  // Exact de origin van de SPA (ADR 0007); zonder waarde weigert de CSRF-controle elke Origin-header.
  readonly appOrigin?: string;
  // Better Auth op /api/auth/* (framework §3: de enige routes buiten defineRoute) en de sessie per request.
  readonly auth?: AuthGateway;
  readonly withUser?: WithUser;
  // Alleen routes uit defineRoute (ADR 0008); iets anders weigert createApp bij opstart.
  readonly routes?: readonly RouteDef<Contract, Services>[];
  readonly devLogin?: DevLogin;
  // Foutcodes die naar buiten mogen; een onbekende code wordt INTERNAL_ERROR.
  readonly errors?: ErrorRegistry<string>;
  // Eén regel per request (src/core/api/obs); server.ts geeft writeJsonLine mee, zonder waarde logt de app niets.
  readonly log?: RequestLog;
  // GET /api/ready (framework §3): zonder waarde bestaat de route niet; server.ts geeft createReadiness(pingDatabase) mee.
  readonly ready?: Readiness;
  // Maximum per categorie per venster (spec rate-limit): standaard de harde grens uit core; de app geeft die uit
  // src/shared/limits.ts mee, een integratietest een lagere. Boven de harde grens weigert createApp bij opstart.
  readonly rateLimits?: RateLimits;
}

// Wat handlers via ctx.services krijgen (bijv. uitnodigen via Better Auth): verplicht zodra de app een Services-type kiest
// (createRouteKit<Permission, Services>), weg te laten zonder.
export type AppConfig<Services = undefined> = BaseConfig<Services> &
  (undefined extends Services ? { readonly services?: Services } : { readonly services: Services });

export interface App {
  readonly fetch: (request: Request) => Promise<Response>;
}

// De ruwe input wordt gelezen vóór de telling (geen verbinding vast tijdens het lezen); parsen en valideren gebeurt pas
// binnen withUser, na de telling, zodat ook een ongeldig verzoek meetelt (spec rate-limit).
type RawInput =
  { readonly kind: 'query'; readonly value: Record<string, string> } | { readonly kind: 'body'; readonly text: string };

async function readRawInput(c: Context, method: string): Promise<RawInput> {
  if (method === 'GET' || method === 'DELETE') return { kind: 'query', value: c.req.query() };
  return { kind: 'body', text: await c.req.text() };
}

function parseInput(raw: RawInput, params: Record<string, string>): unknown {
  if (raw.kind === 'query') return { ...raw.value, ...params };
  let body: unknown;
  try {
    body = raw.text === '' ? {} : JSON.parse(raw.text);
  } catch {
    throw new AppError('VALIDATION');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new AppError('VALIDATION');
  return { ...body, ...params };
}

function routeHandler<Services>(
  route: RouteDef<Contract, Services>,
  config: BaseConfig<Services> & { readonly services?: Services },
  rateLimits: RateLimits,
) {
  const { contract } = route;
  const category = rateLimitCategory(contract);
  const rateLimit = { bucket: category, windowSeconds: RATE_LIMIT_WINDOW_SECONDS, max: rateLimits[category] };
  return async (c: Context) => {
    const { auth, withUser } = config;
    if (auth === undefined || withUser === undefined) throw new Error('createApp: routes vragen auth en withUser');
    const { session, setCookie } = await auth.getSession(c.req.raw.headers);
    for (const cookie of setCookie) c.header('set-cookie', cookie, { append: true });
    if (session === null) throw new AppError('UNAUTHENTICATED');
    const facts = c.get('requestFacts');
    if (facts !== undefined) facts.userId = session.userId;
    const raw = await readRawInput(c, contract.method);
    const actor = { userId: session.userId, sessionStrength: session.sessionStrength };
    const output = await timeDatabase(facts, () =>
      withUser(
        actor,
        async (tx, { role }) => {
          // Eerst de input (VALIDATION vóór FORBIDDEN), dan de rol: geen rol in user_roles = geen toegang (framework §6).
          const parsed = contract.input.safeParse(parseInput(raw, c.req.param()));
          if (!parsed.success) throw new AppError('VALIDATION');
          if (role === null) throw new AppError('FORBIDDEN');
          const decision = route.check({ role, sessionStrength: session.sessionStrength });
          if (!decision.ok) throw new AppError(decision.code);
          const services = unsafeCast<Services>(
            config.services,
            'AppConfig eist services zodra Services geen undefined toelaat; anders is undefined een geldige waarde',
          );
          const result = await route.handler({ input: parsed.data, actor: { ...session, role }, tx, services });
          // Een output die niet bij het contract past, is een bug: INTERNAL_ERROR, nooit de data.
          return contract.output.parse(result);
        },
        { readOnly: contract.method === 'GET', rateLimit },
      ),
    );
    return c.json(output);
  };
}

// Vaste volgorde (framework §6): requestId, request-log (als log is meegegeven), secureHeaders, CSRF, bodyLimit, routes; één onError en notFound met alleen
// `{ code, requestId }`. Health (liveness) en ready (readiness) zijn de publieke uitzonderingen uit framework §3.
const devLoginInput = z.object({ rol: z.enum(ROLES) }).strict();

export function createApp(): App;
export function createApp<Services = undefined>(config: AppConfig<Services>): App;
export function createApp<Services>(config: BaseConfig<Services> & { readonly services?: Services } = {}): App {
  const routes = config.routes ?? [];
  const rateLimits = config.rateLimits ?? RATE_LIMIT_MAX;
  const invalid = invalidRateLimits(rateLimits);
  if (invalid.length > 0) {
    throw new Error(
      `createApp: rate limit ${invalid.join(', ')} moet een geheel getal zijn van 1 t/m de harde grens uit core`,
    );
  }
  for (const route of routes) {
    if (!isRouteDef(route)) throw new Error('createApp: alleen routes uit defineRoute (ADR 0008)');
  }
  const fail = (c: Context, code: string) => c.json({ code, requestId: c.get('requestId') }, statusFor(code));
  const core: readonly string[] = coreErrorCodes;
  const isPublic = (code: string) => config.errors?.is(code) ?? core.includes(code);

  // De ID maakt de server altijd zelf (nooit uit X-Request-Id van de client): hij koppelt de request-log aan foutmeldingen
  // en straks aan auditregels (ADR 0021), dus een client mag hem niet kiezen of een bestaande nadoen.
  const app = new Hono()
    .basePath('/api')
    .use(requestId({ headerName: '' }))
    .use(async (c, next) => {
      c.header('X-Request-Id', c.get('requestId'));
      await next();
    });
  if (config.log !== undefined) app.use(requestLog(config.log));
  app
    .use(secureHeaders())
    .use(csrf(config.appOrigin))
    .use(bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => fail(c, 'PAYLOAD_TOO_LARGE') }))
    .onError((error, c) => {
      if (error instanceof AppError && isPublic(error.code)) {
        if (error.retryAfter !== undefined) c.header('Retry-After', String(error.retryAfter));
        return fail(c, error.code);
      }
      console.error(`[${c.get('requestId')}]`, error);
      return fail(c, 'INTERNAL_ERROR');
    })
    .notFound((c) => fail(c, 'NOT_FOUND'))
    .get('/health', (c) => c.json({ ok: true }))
    .on(['GET', 'POST'], '/auth/*', (c) => (config.auth === undefined ? c.notFound() : config.auth.handler(c.req.raw)));

  const { ready } = config;
  if (ready !== undefined) {
    app.get('/ready', async (c) => ((await ready()) ? c.json({ ok: true }) : c.json({ ok: false }, 503)));
  }

  const { devLogin } = config;
  if (devLogin !== undefined) {
    app.post('/dev/login-as', async (c) => {
      const parsed = devLoginInput.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) throw new AppError('VALIDATION');
      for (const cookie of await devLogin(parsed.data.rol, c.req.raw.headers)) {
        c.header('set-cookie', cookie, { append: true });
      }
      return c.body(null, 204);
    });
  }
  for (const route of routes)
    app.on(route.contract.method, route.contract.path, routeHandler(route, config, rateLimits));
  return { fetch: async (request) => app.fetch(request) };
}
