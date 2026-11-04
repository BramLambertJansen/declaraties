import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { beginTestDb, createPool, type TestDb, type TestUser } from '../../src/core/api/db/testing.ts';
import { AppError } from '../../src/core/api/errors.ts';
import { createApp } from '../../src/core/api/http/create-app.ts';
import {
  createOutboundClient,
  guardWithUser,
  OutboundForbiddenError,
  type OutboundClient,
  type OutboundResult,
} from '../../src/core/api/outbound/index.ts';
import { startFakePartner, type FakePartner } from '../../src/core/api/outbound/testing.ts';
import { createRouteKit } from '../../src/core/api/route/kit.ts';
import { defineAuditActions } from '../../src/core/shared/audit.ts';
import { definePermissions } from '../../src/core/shared/can.ts';
import { createContracts } from '../../src/core/shared/contract.ts';
import { required } from '../auth/harness.ts';

// Spec uitgaande-client AC-15 (de client weigert in withUser en afterCommit) en het routedeel van AC-11 (een partnerfout
// wordt 502 met precies `{ code, requestId }`). Echte createApp en echte withUser via de testkit (`pnpm test:db`); alleen
// de partner is nagebootst (R-UIT-07). "Geen aanroep": de teller van de nep-partner blijft 0.

const pool = createPool(required('MIGRATOR_DATABASE_URL'));
afterAll(async () => {
  await pool.end();
});

const pong = z.object({ id: z.string() }).strict();
type Pong = OutboundResult<typeof pong, never>;
const ping = { requestId: 'r-outbound', method: 'GET', path: '/ping', schema: pong } as const;

// Wat de handlers van deze test gebruiken en achterlaten; elke test zet het opnieuw.
interface State {
  client: OutboundClient | null;
  pending: Promise<Pong> | null;
  cleanup: Pong | null;
  error: unknown;
}
const state: State = { client: null, pending: null, cleanup: null, error: null };
const clientOf = (): OutboundClient => {
  if (state.client === null) throw new Error('test: geen client');
  return state.client;
};

let db: TestDb;
let partner: FakePartner;
beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  db = await beginTestDb(pool);
  partner = await startFakePartner({
    'GET /ping': { status: 200, json: { id: 'pong' } },
    'GET /bad': { status: 200, json: { geheim: 'partner-geheim' } },
  });
  Object.assign(state, { client: null, pending: null, cleanup: null, error: null });
  state.client = createOutboundClient({
    name: 'partner',
    baseUrl: partner.url,
    hosts: ['127.0.0.1'],
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

const inHandler = defineRoute(contractFor('/outbound/in-handler'), async () => {
  await clientOf().call(ping);
  return null;
});
const inAfterCommit = defineRoute(contractFor('/outbound/after-commit'), ({ afterCommit }) => {
  afterCommit(async () => clientOf().call(ping));
  return Promise.resolve(null);
});
const voidInHandler = defineRoute(contractFor('/outbound/void'), () => {
  const pending = clientOf().call(ping);
  // De afwijzing blijft zichtbaar via state.pending; deze catch voorkomt alleen een onafgehandelde afwijzing.
  pending.catch(() => undefined);
  state.pending = pending;
  return Promise.resolve(null);
});
const inAfterRollback = defineRoute(contractFor('/outbound/after-rollback'), ({ afterRollback }) => {
  afterRollback(async () => {
    state.cleanup = await clientOf().call(ping);
  });
  throw new AppError('VALIDATION');
});
const upstreamFailure = defineRoute(contractFor('/outbound/upstream-invalid'), () => {
  throw state.error;
});

const routes = [inHandler, inAfterCommit, voidInHandler, inAfterRollback, upstreamFailure];

function post(user: TestUser, path: string): Promise<Response> {
  const app = createApp({ appOrigin: 'http://localhost:5173', auth: user.auth, withUser: db.withUser, routes });
  return app.fetch(
    new Request(`http://localhost/api${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: '{}',
    }),
  );
}

describe('uitgaande-client/AC-15: de client weigert binnen withUser en afterCommit', () => {
  test('uitgaande-client/AC-15: een handler die de client aanroept geeft 500 INTERNAL_ERROR, zonder aanroep', async () => {
    const user = await db.asUser('user');
    const response = await post(user, '/outbound/in-handler');

    expect([response.status, await response.json()]).toMatchObject([500, { code: 'INTERNAL_ERROR' }]);
    expect(partner.calls('GET /ping')).toBe(0);
  });

  test('uitgaande-client/AC-15: een afterCommit-effect dat de client aanroept geeft 500 INTERNAL_ERROR, zonder aanroep', async () => {
    const user = await db.asUser('user');
    const response = await post(user, '/outbound/after-commit');

    expect([response.status, await response.json()]).toMatchObject([500, { code: 'INTERNAL_ERROR' }]);
    expect(partner.calls('GET /ping')).toBe(0);
  });

  test('uitgaande-client/AC-15: void client.call() in een handler geeft een afgewezen belofte met OutboundForbiddenError', async () => {
    const user = await db.asUser('user');
    await post(user, '/outbound/void');

    expect(state.pending).not.toBeNull();
    await expect(state.pending).rejects.toBeInstanceOf(OutboundForbiddenError);
    expect(partner.calls('GET /ping')).toBe(0);
  });

  test('uitgaande-client/AC-15: met guardWithUser weigert ook een withUser buiten een route, zonder aanroep', async () => {
    const user = await db.asUser('user');
    const guarded = guardWithUser(db.withUser);
    let pending: Promise<Pong> | null = null;

    await guarded(
      user.actor,
      () => {
        const call = clientOf().call(ping);
        call.catch(() => undefined);
        pending = call;
        return Promise.resolve(null);
      },
      { requestId: 'r-guard-void' },
    );

    expect(pending).not.toBeNull();
    await expect(pending).rejects.toBeInstanceOf(OutboundForbiddenError);
    await expect(
      guarded(user.actor, async () => clientOf().call(ping), { requestId: 'r-guard-await' }),
    ).rejects.toBeInstanceOf(OutboundForbiddenError);
    expect(partner.calls('GET /ping')).toBe(0);
  });

  test('uitgaande-client/AC-15: een afterRollback-cleanup mag de client aanroepen', async () => {
    const user = await db.asUser('user');
    const response = await post(user, '/outbound/after-rollback');

    expect(response.status).toBe(400);
    expect(state.cleanup).toStrictEqual({ ok: true, status: 200, data: { id: 'pong' } });
    expect(partner.calls('GET /ping')).toBe(1);
  });

  test('uitgaande-client/AC-15: dezelfde client buiten withUser slaagt', async () => {
    expect(await clientOf().call(ping)).toStrictEqual({ ok: true, status: 200, data: { id: 'pong' } });
    expect(partner.calls('GET /ping')).toBe(1);
  });
});

describe('uitgaande-client/AC-11: een partnerfout in een route', () => {
  test('uitgaande-client/AC-11: een route met UPSTREAM_INVALID antwoordt 502 met precies { code, requestId }, zonder partnertekst', async () => {
    state.error = await clientOf()
      .call({ ...ping, path: '/bad' })
      .then(
        () => null,
        (reason: unknown) => reason,
      );
    expect(state.error).toBeInstanceOf(AppError);
    const user = await db.asUser('user');

    const response = await post(user, '/outbound/upstream-invalid');
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(text)).toStrictEqual({
      code: 'UPSTREAM_INVALID',
      requestId: response.headers.get('x-request-id'),
    });
    expect(text).not.toContain('partner-geheim');
  });
});
