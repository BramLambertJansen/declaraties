import { z } from 'zod';
import { definePermissions, type Role, type SessionStrength } from '../../shared/can.ts';
import { createContracts } from '../../shared/contract.ts';
import { defineErrorCodes } from '../../shared/errors.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { AuthGateway } from '../auth/auth.ts';
import type { Tx, WithUser } from '../db/types.ts';
import { createApp } from '../http/create-app.ts';
import { createRouteKit, type RouteDef } from './kit.ts';
import { UserId } from '../../shared/ids.ts';

// Een app in het klein, zonder database: nep-sessie en nep-withUser waarvan tx.execute de rol teruggeeft.
export const permissions = definePermissions({
  'notes:read': { roles: ['user', 'admin'] },
  'notes:admin': { roles: ['admin'] },
});
export const errors = defineErrorCodes(['NOTE_LOCKED']);
export const { defineContract } = createContracts(permissions);
export const { defineRoute } = createRouteKit({ permissions });

export interface FakeUser {
  readonly role: Role | null;
  readonly sessionStrength: SessionStrength;
}

export function fakeDeps(user: FakeUser | null) {
  const calls: { readOnly: boolean }[] = [];
  const auth: AuthGateway = {
    handler: () => Promise.resolve(new Response('auth')),
    getSession: () =>
      Promise.resolve({
        session:
          user === null
            ? null
            : {
                userId: UserId.parse('u1'),
                sessionId: 's1',
                sessionStrength: user.sessionStrength,
                name: 'Test',
                email: 't@test.local',
              },
        setCookie: ['__Host-auth.session_token=vernieuwd; Path=/; Secure; HttpOnly'],
      }),
  };
  const tx = unsafeCast<Tx>({}, 'test: de routes in deze tests gebruiken tx niet');
  const withUser: WithUser = async (_actor, work, options) => {
    calls.push({ readOnly: options?.readOnly ?? false });
    return work(tx, { role: user?.role ?? null });
  };
  return { auth, withUser, calls };
}

export const notesContract = defineContract({
  method: 'GET',
  path: '/notes/:id',
  input: z.object({ id: z.string(), q: z.string().optional() }).strict(),
  output: z.object({ id: z.string(), by: z.string() }).strict(),
  permission: 'notes:read',
});

export function appWith(user: FakeUser | null, routes: readonly RouteDef[]) {
  const deps = fakeDeps(user);
  return {
    app: createApp({ appOrigin: 'http://localhost:5173', auth: deps.auth, withUser: deps.withUser, routes, errors }),
    deps,
  };
}
