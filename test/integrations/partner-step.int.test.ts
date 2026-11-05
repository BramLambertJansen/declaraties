import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { authGateway, inviteUser, type AuthGateway } from '../../src/core/api/auth/index.ts';
import { createAuditFn } from '../../src/core/api/db/audit.ts';
import type { Tx, WithUser } from '../../src/core/api/db/types.ts';
import { AppError } from '../../src/core/api/errors.ts';
import { createApp } from '../../src/core/api/http/create-app.ts';
import {
  registerIntegrations,
  type IntegrationClient,
  type SwitchReading,
} from '../../src/core/api/integrations/index.ts';
import type { OutboundLogEntry } from '../../src/core/api/outbound/index.ts';
import { startFakePartner, type FakePartner, type FakeResponse } from '../../src/core/api/outbound/testing.ts';
import { createRouteKit } from '../../src/core/api/route/kit.ts';
import { defineAuditActions } from '../../src/core/shared/audit.ts';
import { definePermissions, type Role, type SessionStrength } from '../../src/core/shared/can.ts';
import { createContracts } from '../../src/core/shared/contract.ts';
import { UserId } from '../../src/core/shared/ids.ts';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS, type RateLimits } from '../../src/core/shared/limits.ts';
import { createAccountTestApp, PASSWORD } from '../api/account-harness.ts';
import { APP_ORIGIN, Browser, latestMailTo, required, tokenFrom, uniqueEmail } from '../auth/harness.ts';

// Spec partnerstap (AC-1 t/m AC-4, AC-6 t/m AC-12, AC-14): een route met partnerstap (definePartnerRoute) door de echte
// createApp, echte sessies (Better Auth via de productie-authGateway, een cookie per browser, MFA via TOTP), de echte
// withUser op een eigen pool (createWithUser via createTestApp, niet beginTestDb: die houdt zelf een verbinding vast en
// negeert readOnly) en de echte database (`pnpm test:db`). Alleen de partner is nagebootst (R-UIT-07); "0 aanroepen" =
// de teller van de nep-partner blijft 0. De tellers van AC-12 zijn spionnen die doorgeven aan de echte gateway en withUser.
// Gebruikers, rollen en de stand van de koppeling worden gecommit; elke run een eigen koppelingsnaam.

const setup = createAccountTestApp();
const { pool, migrator, authDb } = setup;
const realWithUser = setup.withUser;
const realGateway = authGateway(setup.auth);

const ON = `partner-${randomUUID().slice(0, 8)}`;
const OFF = `${ON}-uit`;
const TRAITS = {
  auth: 'none',
  direction: ['read'],
  cadence: ['on-demand'],
  sensitivity: 'normal',
  cost: 'free',
  source: 'partner',
} as const;
const integrations = registerIntegrations([
  { name: ON, hosts: ['127.0.0.1'], traits: TRAITS },
  { name: OFF, hosts: ['127.0.0.1'], traits: TRAITS },
]);

// Een echte gebruiker met een echte sessie (cookie in de browser): uitgenodigd, wachtwoord ingesteld, ingelogd.
interface SignedIn {
  readonly id: UserId;
  readonly browser: Browser;
}
const created: UserId[] = [];

// Zonder rol: zoals setup.account, maar zonder app.assign_role.
async function withoutRole(): Promise<{ userId: string; browser: Browser }> {
  const email = uniqueEmail('partnerstap-geen-rol');
  const { userId } = await inviteUser(setup.auth, { name: 'Partnerstap Zonder Rol', email });
  const token = tokenFrom((await latestMailTo(email)).text);
  await new Browser(setup.app).post('/api/auth/reset-password', { token, newPassword: PASSWORD });
  return { userId, browser: await setup.signIn(email) };
}

// Een sessie van deze sterkte; 'mfa' schrijft TOTP in en bevestigt hem, zodat de sessie een MFA-sessie wordt.
async function signedIn(role: Role | null, strength: SessionStrength): Promise<SignedIn> {
  const { userId, browser } = role === null ? await withoutRole() : await setup.account(role, 'Partnerstap Test');
  const id = UserId.parse(userId);
  created.push(id);
  if (strength === 'mfa') await setup.enableTotp(browser);
  return { id, browser };
}

// Een tweede admin: leest de auditregels en deactiveert of blokkeert, via withUser met een MFA-actor (vorm
// account-lifecycle).
let observer: SignedIn;
beforeAll(async () => {
  await migrator.query('select app.set_integration_enabled($1, true)', [ON]);
  await migrator.query('select app.set_integration_enabled($1, false)', [OFF]);
  observer = await signedIn('admin', 'password');
});
afterAll(async () => {
  // Schakelaarrijen en auditregels blijven staan (geen DELETE-policy, audit_log_delete_expired_only); de unieke naam per
  // run voorkomt botsingen, zoals in race.int.test.ts. De koppeling gaat uit, gebruikers en rollen gaan weg.
  await Promise.allSettled([
    migrator.query('select app.set_integration_enabled($1, false)', [ON]),
    ...created.toReversed().map((id) => authDb.query('delete from "user" where id = $1', [id])),
  ]);
  await setup.close();
});

// Wat de routes van deze test doen en achterlaten; elke test zet het opnieuw.
interface State {
  loadMode: 'role' | 'not-found' | 'audit';
  callMode: 'partner' | 'error';
  timeoutMs: number | null;
  rateLimits: RateLimits;
  loads: number;
  handlers: number;
  withUserCalls: number;
  sessionCalls: number;
  callRequestIds: string[];
  reading: SwitchReading | null;
  lines: OutboundLogEntry[];
}
const state: State = {
  loadMode: 'role',
  callMode: 'partner',
  timeoutMs: null,
  rateLimits: RATE_LIMIT_MAX,
  loads: 0,
  handlers: 0,
  withUserCalls: 0,
  sessionCalls: 0,
  callRequestIds: [],
  reading: null,
  lines: [],
};

let partner: FakePartner;
const OK: FakeResponse = { status: 200, json: { id: 'p-1' } };
async function replacePartner(answer: FakeResponse): Promise<void> {
  await partner.close();
  partner = await startFakePartner({ 'GET /roles/admin': answer });
}

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  Object.assign(state, {
    loadMode: 'role',
    callMode: 'partner',
    timeoutMs: null,
    rateLimits: RATE_LIMIT_MAX,
    loads: 0,
    handlers: 0,
    withUserCalls: 0,
    sessionCalls: 0,
    callRequestIds: [],
    reading: null,
    lines: [],
  });
  partner = await startFakePartner({ 'GET /roles/admin': OK });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await partner.close();
});

// Services van de testapp: een client per koppeling, op de nep-partner van deze test, met één poging.
interface Services {
  readonly client: (name: string) => IntegrationClient;
}
const services: Services = {
  client: (name) =>
    integrations.client(name, {
      baseUrl: partner.url,
      appEnv: 'test',
      maxAttempts: 1,
      log: (entry) => {
        state.lines.push(entry);
      },
      ...(state.timeoutMs === null ? {} : { timeoutMs: state.timeoutMs }),
    }),
};

const permissions = definePermissions({ 'partner:read': { roles: ['admin'] } });
type Permission = (typeof permissions.names)[number];
const audit = defineAuditActions({ 'partner.read': { target: 'partner', details: z.object({ id: z.string() }) } });
const { defineContract } = createContracts(permissions);
const { defineRoute, definePartnerRoute } = createRouteKit<Permission, Services, typeof audit>({ permissions, audit });

const input = z.object({}).strict();
const output = z.object({ id: z.string() }).strict();
const item = z.object({ id: z.string() }).strict();
const contractFor = (path: `/${string}`) =>
  defineContract({ method: 'POST', path, input, output, permission: 'partner:read', rateLimit: 'duur' });

// De stap van elke partnerroute hier: load leest met de tx de eigen rij in public.user_roles en geeft de rol als ID
// (AC-8), of gooit NOT_FOUND (AC-3), of schrijft een auditregel in de eerste transactie (AC-10).
const loadRole = async ({ tx }: { tx: Tx }): Promise<string> => {
  state.loads += 1;
  if (state.loadMode === 'not-found') throw new AppError('NOT_FOUND');
  if (state.loadMode === 'audit') await createAuditFn(tx, audit)('partner.read', 'load', { id: 'load' });
  const { rows } = await tx.execute<{ role: string }>(
    sql`select role from public.user_roles where user_id = (select app.current_user_id())`,
  );
  return rows[0]?.role ?? 'geen';
};

function stepFor(integration: string) {
  return {
    integration,
    load: loadRole,
    call: async (ctx: { loaded: string; reading: SwitchReading; requestId: string; services: Services }) => {
      state.callRequestIds.push(ctx.requestId);
      state.reading = ctx.reading;
      if (state.callMode === 'error') throw new Error('partnerstap-test: gewone fout in call');
      const result = await ctx.services.client(ctx.reading.name).call(ctx.reading, {
        requestId: ctx.requestId,
        method: 'GET',
        path: '/roles/:role',
        params: { role: ctx.loaded },
        schema: item,
      });
      if (!result.ok) throw new Error('partnerstap-test: onverwacht antwoord');
      return result.data;
    },
  };
}

const readingOf = (): SwitchReading => {
  if (state.reading === null) throw new Error('test: call heeft niet gelezen');
  return state.reading;
};

const onRoute = definePartnerRoute(contractFor('/partnerstap/aan'), stepFor(ON), async (ctx) => {
  state.handlers += 1;
  await ctx.audit('partner.read', 'handler', { id: ctx.partner.id });
  return { id: ctx.partner.id };
});
const offRoute = definePartnerRoute(contractFor('/partnerstap/uit'), stepFor(OFF), (ctx) => {
  state.handlers += 1;
  return { id: ctx.partner.id };
});
// AC-8: de handler roept zelf de client aan, onder de markering van de tweede transactie.
const handlerCallsRoute = definePartnerRoute(
  contractFor('/partnerstap/handler-roept-aan'),
  stepFor(ON),
  async (ctx) => {
    state.handlers += 1;
    await ctx.audit('partner.read', 'handler', { id: ctx.partner.id });
    await ctx.services
      .client(ON)
      .call(readingOf(), { requestId: 'r-handler', method: 'GET', path: '/roles/admin', schema: item });
    return { id: ctx.partner.id };
  },
);
// AC-12: een gewone route zonder stap.
const plainRoute = defineRoute(contractFor('/partnerstap/gewoon'), () => {
  state.handlers += 1;
  return { id: 'gewoon' };
});
const routes = [onRoute, offRoute, handlerCallsRoute, plainRoute];

// Spionnen (AC-12): tellen elke aanroep en geven door aan de echte gateway en de echte withUser.
const countedGateway: AuthGateway = {
  handler: realGateway.handler,
  getSession: async (headers) => {
    state.sessionCalls += 1;
    return realGateway.getSession(headers);
  },
};
const countedWithUser: WithUser = async (actor, work, options) => {
  state.withUserCalls += 1;
  return realWithUser(actor, work, options);
};

interface Send {
  readonly user: SignedIn;
  readonly body?: unknown;
}
// Een POST met de cookies, het IP en de CSRF-headers van de browser van de gebruiker, zoals de SPA (Browser.send).
function send(path: string, { user, body = {} }: Send): Promise<Response> {
  const app = createApp<Services>({
    appOrigin: APP_ORIGIN,
    auth: countedGateway,
    withUser: countedWithUser,
    routes,
    integrations,
    services,
    rateLimits: state.rateLimits,
  });
  const headers = new Headers({
    'content-type': 'application/json',
    'sec-fetch-site': 'same-origin',
    origin: APP_ORIGIN,
  });
  headers.set(required('CLIENT_IP_HEADER'), user.browser.ip);
  headers.set('cookie', [...user.browser.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
  return app.fetch(new Request(`${APP_ORIGIN}/api${path}`, { method: 'POST', headers, body: JSON.stringify(body) }));
}

const errorBody = (response: Response, code: string) => ({ code, requestId: response.headers.get('x-request-id') });

async function outcome(response: Response): Promise<[number, unknown]> {
  return [response.status, await response.json()];
}

const calls = (): number => partner.requests.length;

// Wacht tot de nep-partner het verzoek ontvangt (AC-4, AC-11, AC-14).
async function untilPartnerReceived(): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (partner.requests.length >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('de nep-partner kreeg geen verzoek');
}

// De auditregels van één verzoek, gelezen door de tweede admin met MFA (audit_log_select_admin).
async function auditRows(requestId: string | null): Promise<{ action: string; target_id: string }[]> {
  return realWithUser({ userId: observer.id, sessionStrength: 'mfa' }, async (tx) => {
    const { rows } = await tx.execute<{ action: string; target_id: string }>(
      sql`select action, target_id from app.audit_log where request_id = ${requestId ?? ''} order by id`,
    );
    return rows;
  });
}

describe('partnerstap: rol, permissie en MFA vóór de aanroep', () => {
  test.each([
    ['rol user', 'user'],
    ['zonder rol', null],
  ] as const)(
    'partnerstap/AC-1: %s krijgt 403 FORBIDDEN, 0 aanroepen; load en handler draaien niet',
    async (_, role) => {
      const user = await signedIn(role, 'password');

      const response = await send('/partnerstap/aan', { user });

      expect(await outcome(response)).toStrictEqual([403, errorBody(response, 'FORBIDDEN')]);
      expect([calls(), state.loads, state.handlers]).toStrictEqual([0, 0, 0]);
    },
  );

  test('partnerstap/AC-2: een admin zonder MFA krijgt 403 MFA_REQUIRED en 0 aanroepen; met MFA 200 na precies 1 aanroep', async () => {
    const admin = await signedIn('admin', 'password');

    const withoutMfa = await send('/partnerstap/aan', { user: admin });
    expect(await outcome(withoutMfa)).toStrictEqual([403, errorBody(withoutMfa, 'MFA_REQUIRED')]);
    expect(calls()).toBe(0);

    await setup.enableTotp(admin.browser);
    const withMfa = await send('/partnerstap/aan', { user: admin });
    expect(await outcome(withMfa)).toStrictEqual([200, { id: 'p-1' }]);
    expect(calls()).toBe(1);
  });
});

describe('partnerstap/AC-3: samen optredende situaties, elk met 0 aanroepen', () => {
  test('partnerstap/AC-3: geen permissie + koppeling uit + partner zou time-outen: FORBIDDEN', async () => {
    await replacePartner({ status: 200, json: { id: 'p-1' }, delayMs: 2000 });
    state.timeoutMs = 300;
    const user = await signedIn('user', 'password');

    const response = await send('/partnerstap/uit', { user });

    expect(await outcome(response)).toStrictEqual([403, errorBody(response, 'FORBIDDEN')]);
    expect(calls()).toBe(0);
  });

  test('partnerstap/AC-3: admin zonder MFA + partner geeft 503: MFA_REQUIRED', async () => {
    await replacePartner({ status: 503 });
    const admin = await signedIn('admin', 'password');

    const response = await send('/partnerstap/aan', { user: admin });

    expect(await outcome(response)).toStrictEqual([403, errorBody(response, 'MFA_REQUIRED')]);
    expect(calls()).toBe(0);
  });

  test('partnerstap/AC-3: ongeldige input + geen permissie: VALIDATION', async () => {
    const user = await signedIn('user', 'password');

    const response = await send('/partnerstap/aan', { user, body: { onbekend: 1 } });

    expect(await outcome(response)).toStrictEqual([400, errorBody(response, 'VALIDATION')]);
    expect(calls()).toBe(0);
  });

  test('partnerstap/AC-3: load geeft NOT_FOUND + koppeling uit: NOT_FOUND', async () => {
    state.loadMode = 'not-found';
    const admin = await signedIn('admin', 'mfa');

    const response = await send('/partnerstap/uit', { user: admin });

    expect(await outcome(response)).toStrictEqual([404, errorBody(response, 'NOT_FOUND')]);
    expect([calls(), state.handlers]).toStrictEqual([0, 0]);
  });

  test('partnerstap/AC-3: rate limit op + alles verder geldig: RATE_LIMITED', async () => {
    state.rateLimits = { ...RATE_LIMIT_MAX, duur: 1 };
    const admin = await signedIn('admin', 'mfa');
    // De enige plek van duur in dit venster vooraf verbruiken, met dezelfde sleutel als de route (bucket + actor).
    await realWithUser({ userId: admin.id, sessionStrength: 'mfa' }, () => Promise.resolve(null), {
      rateLimit: { bucket: 'duur', windowSeconds: RATE_LIMIT_WINDOW_SECONDS, max: 1 },
    });

    const response = await send('/partnerstap/aan', { user: admin });

    expect(await outcome(response)).toStrictEqual([429, errorBody(response, 'RATE_LIMITED')]);
    expect([calls(), state.loads]).toStrictEqual([0, 0]);
  });
});

describe('partnerstap: de aanroep buiten elke transactie', () => {
  test('partnerstap/AC-4: tijdens de aanroep houdt de app geen verbinding vast; time-out geeft 504 en de handler draait niet', async () => {
    await replacePartner({ status: 200, json: { id: 'p-1' }, delayMs: 2000 });
    state.timeoutMs = 300;
    const admin = await signedIn('admin', 'mfa');

    const pending = send('/partnerstap/aan', { user: admin });
    await untilPartnerReceived();
    const busy = pool.totalCount - pool.idleCount;
    const response = await pending;

    expect(busy).toBe(0);
    expect(response.status).toBe(504);
    expect(await response.json()).toStrictEqual(errorBody(response, 'UPSTREAM_TIMEOUT'));
    expect([calls(), state.handlers]).toStrictEqual([1, 0]);
  }, 15_000);

  test('partnerstap/AC-6: koppeling uit: 503 met precies { code, requestId }, 0 aanroepen, één logregel DISABLED, geen handler', async () => {
    const admin = await signedIn('admin', 'mfa');

    const response = await send('/partnerstap/uit', { user: admin });

    expect(response.status).toBe(503);
    expect(await response.json()).toStrictEqual(errorBody(response, 'UPSTREAM_UNAVAILABLE'));
    expect(calls()).toBe(0);
    expect(state.lines.map((line) => [line.outbound, line.outcome])).toStrictEqual([[OFF, 'DISABLED']]);
    expect(state.handlers).toBe(0);
  });

  test('partnerstap/AC-7: met rateLimits.duur 2 slagen twee verzoeken (één telling per verzoek), het derde 429 met Retry-After', async () => {
    state.rateLimits = { ...RATE_LIMIT_MAX, duur: 2 };
    const admin = await signedIn('admin', 'mfa');

    const first = await send('/partnerstap/aan', { user: admin });
    const second = await send('/partnerstap/aan', { user: admin });
    const third = await send('/partnerstap/aan', { user: admin });

    expect([first.status, second.status]).toStrictEqual([200, 200]);
    expect(await outcome(third)).toStrictEqual([429, errorBody(third, 'RATE_LIMITED')]);
    expect(third.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(calls()).toBe(2);
  });
});

describe('partnerstap/AC-8: load, call en handler samen', () => {
  test('partnerstap/AC-8: load leest de eigen rol, de partner ziet hem in het pad, requestId klopt en de auditregel bestaat', async () => {
    const admin = await signedIn('admin', 'mfa');

    const response = await send('/partnerstap/aan', { user: admin });
    const requestId = response.headers.get('x-request-id');

    expect(await outcome(response)).toStrictEqual([200, { id: 'p-1' }]);
    expect(partner.requests.map((request) => request.path)).toStrictEqual(['/roles/admin']);
    expect(state.callRequestIds).toStrictEqual([requestId]);
    expect(await auditRows(requestId)).toStrictEqual([{ action: 'partner.read', target_id: 'handler' }]);
  });

  test('partnerstap/AC-8: roept de handler zelf de client aan, dan 500 INTERNAL_ERROR, geen auditregel en de partner telt 1', async () => {
    const admin = await signedIn('admin', 'mfa');

    const response = await send('/partnerstap/handler-roept-aan', { user: admin });

    expect(await outcome(response)).toStrictEqual([500, errorBody(response, 'INTERNAL_ERROR')]);
    expect(await auditRows(response.headers.get('x-request-id'))).toStrictEqual([]);
    expect([calls(), state.handlers]).toStrictEqual([1, 1]);
  });
});

describe('partnerstap/AC-9: een partnerfout gaat ongewijzigd naar buiten', () => {
  test.each([
    ['een 503', { answer: { status: 503 }, status: 503, code: 'UPSTREAM_UNAVAILABLE' }],
    [
      'een 200 die niet bij het schema past',
      { answer: { status: 200, json: { geheim: 'partner-geheim' } }, status: 502, code: 'UPSTREAM_INVALID' },
    ],
  ] as const)(
    'partnerstap/AC-9: %s geeft precies { code, requestId }, zonder partnertekst, en de handler draait niet',
    async (_, { answer, status, code }) => {
      await replacePartner(answer);
      const admin = await signedIn('admin', 'mfa');

      const response = await send('/partnerstap/aan', { user: admin });
      const text = await response.text();

      expect(response.status).toBe(status);
      expect(JSON.parse(text)).toStrictEqual(errorBody(response, code));
      expect(text).not.toContain('partner-geheim');
      expect(state.handlers).toBe(0);
    },
  );

  test('partnerstap/AC-9: gooit call een gewone Error, dan 500 INTERNAL_ERROR', async () => {
    state.callMode = 'error';
    const admin = await signedIn('admin', 'mfa');

    const response = await send('/partnerstap/aan', { user: admin });

    expect(await outcome(response)).toStrictEqual([500, errorBody(response, 'INTERNAL_ERROR')]);
    expect(state.handlers).toBe(0);
  });
});

test('partnerstap/AC-10: een load die een auditregel schrijft geeft 500 INTERNAL_ERROR, geen regel en 0 aanroepen (read-only)', async () => {
  state.loadMode = 'audit';
  const admin = await signedIn('admin', 'mfa');

  const response = await send('/partnerstap/aan', { user: admin });

  expect(await outcome(response)).toStrictEqual([500, errorBody(response, 'INTERNAL_ERROR')]);
  expect(await auditRows(response.headers.get('x-request-id'))).toStrictEqual([]);
  expect([state.loads, calls(), state.handlers]).toStrictEqual([1, 0, 0]);
});

describe('partnerstap: na de aanroep opnieuw sessie, rol en permissie', () => {
  test('partnerstap/AC-11: rol ingetrokken tijdens de aanroep: 403 FORBIDDEN uit de tweede transactie, geen handler, partner telt 1', async () => {
    await replacePartner({ status: 200, json: { id: 'p-1' }, delayMs: 1500 });
    const admin = await signedIn('admin', 'mfa');

    const pending = send('/partnerstap/aan', { user: admin });
    await untilPartnerReceived();
    await migrator.query("select app.assign_role($1, 'user')", [admin.id]);
    const response = await pending;

    expect(await outcome(response)).toStrictEqual([403, errorBody(response, 'FORBIDDEN')]);
    expect([calls(), state.handlers]).toStrictEqual([1, 0]);
  }, 15_000);

  test.each([
    ['gedeactiveerd', (id: UserId) => sql`select app.set_account_deactivated(${id}, true)`],
    ['geblokkeerd', (id: UserId) => sql`select app.set_account_blocked(${id}, true)`],
  ])(
    'partnerstap/AC-14: account %s tijdens de aanroep: 401 UNAUTHENTICATED, geen handler, geen auditregel, partner telt 1',
    async (_, operation) => {
      await replacePartner({ status: 200, json: { id: 'p-1' }, delayMs: 1500 });
      const admin = await signedIn('admin', 'mfa');

      const pending = send('/partnerstap/aan', { user: admin });
      await untilPartnerReceived();
      await realWithUser({ userId: observer.id, sessionStrength: 'mfa' }, async (tx) => {
        await tx.execute(operation(admin.id));
      });
      const response = await pending;

      expect(await outcome(response)).toStrictEqual([401, errorBody(response, 'UNAUTHENTICATED')]);
      expect(state.handlers).toBe(0);
      expect(await auditRows(response.headers.get('x-request-id'))).toStrictEqual([]);
      expect(calls()).toBe(1);
    },
    15_000,
  );
});

test('partnerstap/AC-12: met partnerstap 2 keer withUser en 2 keer getSession, zonder stap 1 en 1', async () => {
  const admin = await signedIn('admin', 'mfa');

  const withStep = await send('/partnerstap/aan', { user: admin });
  const stepCounts = [state.withUserCalls, state.sessionCalls];
  Object.assign(state, { withUserCalls: 0, sessionCalls: 0 });
  const withoutStep = await send('/partnerstap/gewoon', { user: admin });

  expect([withStep.status, withoutStep.status]).toStrictEqual([200, 200]);
  expect(stepCounts).toStrictEqual([2, 2]);
  expect([state.withUserCalls, state.sessionCalls]).toStrictEqual([1, 1]);
});
