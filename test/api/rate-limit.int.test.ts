import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { routes } from '../../src/api/app.ts';
import { defineRoute } from '../../src/api/kit.ts';
import { createServices, type AppServices } from '../../src/api/services.ts';
import { authGateway, inviteUser, type AuthGateway } from '../../src/core/api/auth/index.ts';
import { createPool, createWithUser } from '../../src/core/api/db/testing.ts';
import { createApp } from '../../src/core/api/http/create-app.ts';
import { UserId } from '../../src/core/shared/ids.ts';
import { defineContract } from '../../src/shared/contracts/kit.ts';
import { errors } from '../../src/shared/errors.ts';
import { APP_ORIGIN, Browser, createTestApp, latestMailTo, required, tokenFrom, uniqueEmail } from '../auth/harness.ts';

// Rate limit van app-routes (spec rate-limit, AC-1 t/m AC-5) door de hele pipeline: echte sessies uit Better Auth, de echte
// withUser (eigen transactie voor de telling, daarna die van de route) en de echte database. De grens is verlaagd via de
// parameter van createApp (niet via env); het venster (60 s) is dat van core. Draait via `pnpm test:db`.
const LIMITS = { lezen: 3, schrijven: 2, duur: 2 } as const;
const PASSWORD = 'rl-'.repeat(6);

// Twee routes alleen voor deze test, gemaakt zoals elke app-route (defineContract + defineRoute uit de app).
const writeRoute = defineRoute(
  defineContract({
    method: 'POST',
    path: '/test/rate-limit',
    input: z.object({ fout: z.boolean().optional() }).strict(),
    output: z.null(),
    permission: 'me:read',
  }),
  ({ input }) => {
    if (input.fout === true) throw new Error('rate-limit-test: fout in de handler');
    return null;
  },
);
const readOnlyRoute = defineRoute(
  defineContract({
    method: 'GET',
    path: '/test/read-only',
    input: z.object({}).strict(),
    output: z.object({ readOnly: z.string() }).strict(),
    permission: 'me:read',
  }),
  async ({ tx }) => {
    const { rows } = await tx.execute<{ read_only: string }>(
      sql`select current_setting('transaction_read_only') as read_only`,
    );
    return { readOnly: rows[0]?.read_only ?? '' };
  },
);

const { auth, pool, withUser } = createTestApp();
const services = createServices(auth);
const app = createApp<AppServices>({
  appOrigin: APP_ORIGIN,
  auth: authGateway(auth),
  withUser,
  services,
  routes: [...routes, writeRoute, readOnlyRoute],
  errors,
  rateLimits: LIMITS,
});
const migrator = new pg.Pool({ connectionString: required('MIGRATOR_DATABASE_URL'), max: 1 });
afterAll(async () => {
  await Promise.all([pool.end(), migrator.end()]);
});

async function signedIn(role: 'user' | 'admin'): Promise<{ browser: Browser; userId: UserId }> {
  const email = uniqueEmail(`rate-limit-${role}`);
  const { userId } = await inviteUser(auth, { name: 'Teller', email });
  await migrator.query('select app.assign_role($1, $2)', [userId, role]);
  const token = tokenFrom((await latestMailTo(email)).text);
  const browser = new Browser(app);
  await browser.post('/api/auth/reset-password', { token, newPassword: PASSWORD });
  await browser.post('/api/auth/sign-in/email', { email, password: PASSWORD });
  return { browser, userId: UserId.parse(userId) };
}

const errorBody = z.object({ code: z.string(), requestId: z.string().min(1) }).strict();

async function outcome(response: Response): Promise<[number, string]> {
  const body: unknown = await response.json();
  return [response.status, response.ok ? 'ok' : errorBody.parse(body).code];
}

// Een POST met een ruwe body (ongeldige JSON), met de cookies en CSRF-headers van de browser.
function rawPost(browser: Browser, path: string, text: string): Promise<Response> {
  const cookie = [...browser.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  return app.fetch(
    new Request(`${APP_ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: APP_ORIGIN, cookie },
      body: text,
    }),
  );
}

async function hits(key: string): Promise<number | undefined> {
  const { rows } = await migrator.query<{ hits: number }>('select hits from app.rate_limits where key = $1', [key]);
  return rows[0]?.hits;
}

describe('rate limit (spec rate-limit)', () => {
  test('AC-1: na het maximum van schrijven geeft de volgende POST 429 met { code, requestId } en Retry-After 1–60', async () => {
    const { browser } = await signedIn('user');
    for (let i = 0; i < LIMITS.schrijven; i += 1) {
      expect(await outcome(await browser.post('/api/test/rate-limit'))).toStrictEqual([200, 'ok']);
    }

    const blocked = await browser.post('/api/test/rate-limit');
    expect(await outcome(blocked)).toStrictEqual([429, 'RATE_LIMITED']);
    const retryAfter = blocked.headers.get('retry-after') ?? '';
    expect(retryAfter).toMatch(/^\d+$/);
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
    expect(Number(retryAfter)).toBeLessThanOrEqual(60);
  });

  test('AC-2: een geblokkeerde gebruiker blokkeert een andere gebruiker niet', async () => {
    const [first, second] = await Promise.all([signedIn('user'), signedIn('user')]);
    for (let i = 0; i <= LIMITS.schrijven; i += 1) await first.browser.post('/api/test/rate-limit');
    expect(await outcome(await first.browser.post('/api/test/rate-limit'))).toStrictEqual([429, 'RATE_LIMITED']);

    expect(await outcome(await second.browser.post('/api/test/rate-limit'))).toStrictEqual([200, 'ok']);
  });

  test('AC-3: na het venster slaagt een verzoek weer en begint de telling op 1', async () => {
    const { browser, userId } = await signedIn('user');
    for (let i = 0; i <= LIMITS.schrijven; i += 1) await browser.post('/api/test/rate-limit');
    expect(await outcome(await browser.post('/api/test/rate-limit'))).toStrictEqual([429, 'RATE_LIMITED']);

    // Het venster laten verlopen zonder 60 s te wachten (de database bepaalt de tijd, niet de API).
    await migrator.query(
      "update app.rate_limits set window_start = window_start - interval '60 seconds' where key = $1",
      [`schrijven:${userId}`],
    );
    expect(await outcome(await browser.post('/api/test/rate-limit'))).toStrictEqual([200, 'ok']);
    expect(await hits(`schrijven:${userId}`)).toBe(1);
  });

  test.each([
    ['VALIDATION door zod', { onbekend: 1 }, [400, 'VALIDATION']],
    ['VALIDATION door ongeldige JSON', '{kapot', [400, 'VALIDATION']],
    ['een fout in de handler', { fout: true }, [500, 'INTERNAL_ERROR']],
  ] as const)('AC-4: %s telt mee', async (_, body, expected) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { browser, userId } = await signedIn('user');
    const send = () =>
      typeof body === 'string'
        ? rawPost(browser, '/api/test/rate-limit', body)
        : browser.post('/api/test/rate-limit', body);
    for (let i = 0; i < LIMITS.schrijven; i += 1) expect(await outcome(await send())).toStrictEqual(expected);

    expect(await hits(`schrijven:${userId}`)).toBe(LIMITS.schrijven);
    expect(await outcome(await browser.post('/api/test/rate-limit'))).toStrictEqual([429, 'RATE_LIMITED']);
    error.mockRestore();
  });

  test('AC-4 en verboden rol: een user op /api/accounts krijgt FORBIDDEN, daarna RATE_LIMITED (lezen)', async () => {
    const { browser } = await signedIn('user');
    for (let i = 0; i < LIMITS.lezen; i += 1) {
      expect(await outcome(await browser.get('/api/accounts'))).toStrictEqual([403, 'FORBIDDEN']);
    }
    expect(await outcome(await browser.get('/api/accounts'))).toStrictEqual([429, 'RATE_LIMITED']);
  });

  test('verboden rol op een dure route: een user op uitnodigen krijgt FORBIDDEN, daarna RATE_LIMITED (duur)', async () => {
    const { browser } = await signedIn('user');
    const invite = () => browser.post('/api/accounts/invite', { naam: 'X', email: uniqueEmail('nooit'), rol: 'user' });
    for (let i = 0; i < LIMITS.duur; i += 1) expect(await outcome(await invite())).toStrictEqual([403, 'FORBIDDEN']);
    expect(await outcome(await invite())).toStrictEqual([429, 'RATE_LIMITED']);
    // Een andere categorie heeft een eigen teller.
    expect(await outcome(await browser.post('/api/test/rate-limit'))).toStrictEqual([200, 'ok']);
  });

  test('AC-5: een GET draait read only en krijgt RATE_LIMITED na de grens van lezen', async () => {
    const { browser } = await signedIn('user');
    for (let i = 0; i < LIMITS.lezen; i += 1) {
      const response = await browser.get('/api/test/read-only');
      expect(response.status).toBe(200);
      expect(await response.json()).toStrictEqual({ readOnly: 'on' });
    }
    expect(await outcome(await browser.get('/api/test/read-only'))).toStrictEqual([429, 'RATE_LIMITED']);
    // lezen is één teller per gebruiker, over alle GET-routes heen.
    expect(await outcome(await browser.get('/api/me'))).toStrictEqual([429, 'RATE_LIMITED']);
  });

  test('racetest: van twee gelijktijdige verzoeken op de laatste vrije plek slaagt er precies één', async () => {
    const { browser } = await signedIn('user');
    for (let i = 0; i < LIMITS.schrijven - 1; i += 1) await browser.post('/api/test/rate-limit');

    const both = await Promise.all([browser.post('/api/test/rate-limit'), browser.post('/api/test/rate-limit')]);
    const results = await Promise.all(both.map(outcome));
    expect(results.toSorted((a, b) => a[0] - b[0])).toStrictEqual([
      [200, 'ok'],
      [429, 'RATE_LIMITED'],
    ]);
  });
});

test('database onbereikbaar tijdens de telling: INTERNAL_ERROR, nooit doorlaten zonder telling (fail closed)', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  // De echte URL met een poort waar niets luistert: verbinden faalt meteen.
  const unreachable = new URL(required('DATABASE_URL'));
  unreachable.port = '1';
  const deadPool = createPool(unreachable.toString());
  let handled = false;
  const counted = defineRoute(
    defineContract({
      method: 'POST',
      path: '/test/fail-closed',
      input: z.object({}).strict(),
      output: z.null(),
      permission: 'me:read',
    }),
    () => {
      handled = true;
      return null;
    },
  );
  const session = {
    userId: UserId.parse('u-fail-closed'),
    sessionStrength: 'password',
    name: 'X',
    email: 'x@test.local',
  } as const;
  const gateway: AuthGateway = {
    handler: () => Promise.resolve(new Response(null, { status: 404 })),
    getSession: () => Promise.resolve({ session, setCookie: [] }),
  };
  const deadApp = createApp<AppServices>({
    appOrigin: APP_ORIGIN,
    auth: gateway,
    withUser: createWithUser(deadPool),
    services,
    routes: [counted],
    errors,
  });

  const response = await new Browser(deadApp).post('/api/test/fail-closed');
  expect(await outcome(response)).toStrictEqual([500, 'INTERNAL_ERROR']);
  expect(handled).toBe(false);
  await deadPool.end();
  error.mockRestore();
});
