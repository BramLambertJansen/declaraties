import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { createContracts } from '../../shared/contract.ts';
import { definePermissions } from '../../shared/can.ts';
import { UserId } from '../../shared/ids.ts';
import { defineAuditActions } from '../../shared/audit.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { AuthGateway } from '../auth/auth.ts';
import type { Tx, WithUser, WithUserOptions } from '../db/types.ts';
import { createRouteKit } from '../route/kit.ts';
import type { RequestLogEntry } from '../obs/request-log.ts';
import { createApp } from './create-app.ts';

// requestId van de server in de transactie (spec audit-log AC-1, AC-2): createApp geeft c.get('requestId') door aan withUser,
// nooit de X-Request-Id van de client. De database-kant (app.request_id) staat in test/datapad/request-id.int.test.ts.
const permissions = definePermissions({ 'notes:read': { roles: ['user', 'admin'] } });
const { defineContract } = createContracts(permissions);
const { defineRoute } = createRouteKit({ permissions, audit: defineAuditActions({}) });
const ping = defineRoute(
  defineContract({
    method: 'POST',
    path: '/ping',
    input: z.object({}).strict(),
    output: z.null(),
    permission: 'notes:read',
  }),
  () => null,
);

const auth: AuthGateway = {
  handler: () => Promise.resolve(new Response(null, { status: 404 })),
  getSession: () =>
    Promise.resolve({
      session: {
        userId: UserId.parse('u1'),
        sessionId: 's1',
        sessionStrength: 'password',
        name: 'Test',
        email: 't@test.local',
      },
      setCookie: [],
    }),
};

function setup() {
  const seen: WithUserOptions[] = [];
  const logged: RequestLogEntry[] = [];
  const tx = unsafeCast<Tx>({}, 'test: de route gebruikt tx niet');
  const withUser: WithUser = async (_actor, work, options) => {
    seen.push(options);
    return work(tx, { role: 'user' });
  };
  const app = createApp({
    appOrigin: 'http://localhost:5173',
    auth,
    withUser,
    routes: [ping],
    log: (entry) => logged.push(entry),
  });
  return { app, seen, logged };
}

const post = (app: ReturnType<typeof setup>['app'], headers: Record<string, string> = {}) =>
  app.fetch(
    new Request('http://localhost/api/ping', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
      body: '{}',
    }),
  );

describe('requestId naar withUser (ADR 0021)', () => {
  test('withUser krijgt de requestId van de response, ook voor de rate-limit-transactie dezelfde', async () => {
    const { app, seen } = setup();
    const response = await post(app);

    expect(response.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.requestId).toBe(response.headers.get('x-request-id'));
    expect(seen[0]?.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('een X-Request-Id van de client wordt genegeerd: de database en de request-log zien dezelfde server-ID', async () => {
    const { app, seen, logged } = setup();
    const response = await post(app, { 'X-Request-Id': 'vervalst-door-client' });
    const id = response.headers.get('x-request-id');

    expect(id).not.toBe('vervalst-door-client');
    expect(seen[0]?.requestId).toBe(id);
    expect(seen[0]?.requestId).not.toBe('vervalst-door-client');
    expect(logged.map((entry) => entry.requestId)).toStrictEqual([id]);
  });
});
