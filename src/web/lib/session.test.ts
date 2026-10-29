import { isRedirect } from '@tanstack/react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ForbiddenError } from '#core/web/lib/guard.ts';
import { createQueryClient } from '#core/web/lib/query.ts';
import { actorFromMe, guard } from './session.ts';

// De guard van de app leest de actor uit GET /api/me (via de API-client en de query-cache) en beslist met de permissies
// van de app. fetch is hier nagebootst; de echte route staat in test/api/me.int.test.ts.
afterEach(() => {
  vi.unstubAllGlobals();
});

function serverSays(status: number, body: unknown) {
  const server = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal('fetch', server);
  return server;
}

const location = { href: '/admin/accounts' };
const user = { id: 'u1', naam: 'Anna', email: 'anna@example.test', rol: 'user' } as const;

async function outcome(permission: 'accounts:read' | 'me:read'): Promise<unknown> {
  try {
    await guard(permission)({ context: { queryClient: createQueryClient() }, location });
    return 'ok';
  } catch (error) {
    return isRedirect(error) ? error.options.href : error;
  }
}

describe('session', () => {
  test('een admin krijgt /me alleen met MFA; een user telt met een password-sessie', () => {
    expect(actorFromMe({ rol: 'admin' })).toStrictEqual({ role: 'admin', sessionStrength: 'mfa' });
    expect(actorFromMe({ rol: 'user' })).toStrictEqual({ role: 'user', sessionStrength: 'password' });
  });

  test('accounts:read: een user krijgt ForbiddenError, een admin mag door', async () => {
    const server = serverSays(200, user);
    expect(await outcome('accounts:read')).toBeInstanceOf(ForbiddenError);
    expect(server).toHaveBeenCalledWith('/api/me', expect.objectContaining({ method: 'GET' }));

    serverSays(200, { ...user, rol: 'admin' });
    expect(await outcome('accounts:read')).toBe('ok');
  });

  test.each([
    ['zonder sessie (401)', 401, 'UNAUTHENTICATED'],
    ['admin zonder MFA (403 MFA_REQUIRED)', 403, 'MFA_REQUIRED'],
  ] as const)('%s: naar /login met de terugweg', async (_, status, code) => {
    serverSays(status, { code, requestId: 'r1' });

    expect(await outcome('me:read')).toBe('/login?redirect=%2Fadmin%2Faccounts');
  });
});
