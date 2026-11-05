import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { beginTestDb, createPool, type TestDb, type TestUser } from '../../src/core/api/db/testing.ts';
import { AppError } from '../../src/core/api/errors.ts';
import { createApp } from '../../src/core/api/http/create-app.ts';
import {
  readSwitch,
  registerIntegrations,
  type IntegrationClient,
  type SwitchReading,
} from '../../src/core/api/integrations/index.ts';
import { guardWithUser, OutboundUsageError } from '../../src/core/api/outbound/index.ts';
import { startFakePartner, type FakePartner } from '../../src/core/api/outbound/testing.ts';
import { createRouteKit } from '../../src/core/api/route/kit.ts';
import { defineAuditActions } from '../../src/core/shared/audit.ts';
import { definePermissions } from '../../src/core/shared/can.ts';
import { createContracts } from '../../src/core/shared/contract.ts';
import { required } from '../auth/harness.ts';

// Spec koppelingsregister: de lezing in een echte withUser (via createApp en via guardWithUser, dus onder de markering),
// AC-3 aan de kant van de client (geen rij = uit, geen aanroep) en het routedeel van AC-2 (503 met precies
// `{ code, requestId }`). Echte database via de testkit (`pnpm test:db`); alleen de partner is nagebootst (R-UIT-07).
// Elke run gebruikt een eigen koppelingsnaam: zonder rij in app.integration_switches staat hij uit (OV-2).

const pool = createPool(required('MIGRATOR_DATABASE_URL'));
afterAll(async () => {
  await pool.end();
});

const TRAITS = {
  auth: 'none',
  direction: ['read'],
  cadence: ['on-demand'],
  sensitivity: 'normal',
  cost: 'free',
  source: 'partner',
} as const;

const ping = { requestId: 'r-koppeling', method: 'GET', path: '/ping', schema: z.object({ id: z.string() }) } as const;

// Wat de routes van deze test achterlaten; elke test zet het opnieuw.
interface State {
  name: string;
  reading: SwitchReading | null;
  error: unknown;
}
const state: State = { name: '', reading: null, error: null };
const readingFromRoute = (): SwitchReading => {
  if (state.reading === null) throw new Error('test: de route heeft niet gelezen');
  return state.reading;
};

let db: TestDb;
let partner: FakePartner;
let client: IntegrationClient;
beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  db = await beginTestDb(pool);
  partner = await startFakePartner({ 'GET /ping': { status: 200, json: { id: 'pong' } } });
  Object.assign(state, { name: `geen-rij-${randomUUID().slice(0, 8)}`, reading: null, error: null });
  client = registerIntegrations([{ name: state.name, hosts: ['127.0.0.1'], traits: TRAITS }]).client(state.name, {
    baseUrl: partner.url,
    appEnv: 'test',
    log: () => undefined,
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await partner.close();
  await db.rollback();
});

const permissions = definePermissions({ 'notes:write': { roles: ['user', 'admin'] } });
const { defineContract } = createContracts(permissions);
const { defineRoute } = createRouteKit({ permissions, audit: defineAuditActions({}) });
const contractFor = (path: `/${string}`) =>
  defineContract({ method: 'POST', path, input: z.object({}).strict(), output: z.null(), permission: 'notes:write' });

const readInRoute = defineRoute(contractFor('/koppeling/lezen'), async ({ tx }) => {
  state.reading = await readSwitch(tx, state.name);
  return null;
});
const upstreamFailure = defineRoute(contractFor('/koppeling/uit'), () => {
  throw state.error;
});

function post(user: TestUser, path: string): Promise<Response> {
  const app = createApp({
    appOrigin: 'http://localhost:5173',
    auth: user.auth,
    withUser: db.withUser,
    routes: [readInRoute, upstreamFailure],
  });
  return app.fetch(
    new Request(`http://localhost/api${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: '{}',
    }),
  );
}

const failure = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => null,
    (reason: unknown) => reason,
  );

describe('koppelingsregister: lezen in een echte withUser', () => {
  test('koppelingsregister/AC-3: een route leest via createApp; zonder rij staat de koppeling uit en doet call geen aanroep', async () => {
    const user = await db.asUser('user');

    const response = await post(user, '/koppeling/lezen');

    expect(response.status).toBe(200);
    const reading = readingFromRoute();
    expect([reading.name, reading.enabled]).toStrictEqual([state.name, false]);
    const error = await failure(client.call(reading, ping));
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    expect(partner.calls('GET /ping')).toBe(0);
  });

  test('koppelingsregister/AC-3: een withUser met guardWithUser leest; zonder rij uit, geen aanroep', async () => {
    const user = await db.asUser('user');
    const guarded = guardWithUser(db.withUser);

    const reading = await guarded(user.actor, async (tx) => readSwitch(tx, state.name), { requestId: 'r-lezen' });

    expect([reading.name, reading.enabled]).toStrictEqual([state.name, false]);
    await expect(client.call(reading, ping)).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    expect(partner.calls('GET /ping')).toBe(0);
  });

  test('koppelingsregister/AC-5: een withUser zonder markering mag niet lezen (OutboundUsageError)', async () => {
    const user = await db.asUser('user');

    const error = await failure(db.withUser(user.actor, async (tx) => readSwitch(tx, state.name)));

    expect(error).toBeInstanceOf(OutboundUsageError);
  });
});

describe('koppelingsregister/AC-2: een route met de fout van een koppeling die uit staat', () => {
  test('koppelingsregister/AC-2: de testroute antwoordt 503 met precies { code, requestId }', async () => {
    const user = await db.asUser('user');
    const guarded = guardWithUser(db.withUser);
    const reading = await guarded(user.actor, async (tx) => readSwitch(tx, state.name), { requestId: 'r-lezen' });
    state.error = await failure(client.call(reading, ping));
    expect(state.error).toBeInstanceOf(AppError);

    const response = await post(user, '/koppeling/uit');

    expect(response.status).toBe(503);
    expect(await response.json()).toStrictEqual({
      code: 'UPSTREAM_UNAVAILABLE',
      requestId: response.headers.get('x-request-id'),
    });
    expect(partner.calls('GET /ping')).toBe(0);
  });
});
