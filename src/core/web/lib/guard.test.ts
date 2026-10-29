import { isRedirect } from '@tanstack/react-router';
import { describe, expect, test } from 'vitest';
import { definePermissions, type CanActor } from '../../shared/can.ts';
import { ApiError } from './api-client.ts';
import { createGuard, ForbiddenError } from './guard.ts';

// De can()-guard van een schermroute (framework §5): dezelfde beslissing als de API.
const permissions = definePermissions({
  'notes:read': { roles: ['user', 'admin'] },
  'beheer:read': { roles: ['admin'] },
});
const location = { href: '/beheer?tab=2' };

function guardFor(actor: () => Promise<CanActor | null>) {
  return createGuard({ permissions, loadActor: actor, loginPath: '/login' });
}

async function outcome(run: Promise<void>): Promise<unknown> {
  try {
    await run;
    return 'ok';
  } catch (error) {
    if (isRedirect(error)) return error.options.href;
    return error;
  }
}

describe('createGuard', () => {
  test('een rol met de permissie mag door', async () => {
    const guard = guardFor(() => Promise.resolve({ role: 'user', sessionStrength: 'password' }));

    expect(await outcome(guard('notes:read')({ context: {}, location }))).toBe('ok');
  });

  test.each([
    ['niet ingelogd (null)', () => Promise.resolve(null)],
    ['401 van /me', () => Promise.reject(new ApiError('UNAUTHENTICATED', 401))],
    ['admin zonder MFA (MFA_REQUIRED van /me)', () => Promise.reject(new ApiError('MFA_REQUIRED', 403))],
    ['admin met een password-sessie', () => Promise.resolve<CanActor>({ role: 'admin', sessionStrength: 'password' })],
  ] as const)('%s: naar inloggen, met de terugweg', async (_, actor) => {
    expect(await outcome(guardFor(actor)('beheer:read')({ context: {}, location }))).toBe(
      '/login?redirect=%2Fbeheer%3Ftab%3D2',
    );
  });

  test('een rol zonder de permissie: ForbiddenError voor de ErrorBoundary', async () => {
    const guard = guardFor(() => Promise.resolve({ role: 'user', sessionStrength: 'password' }));

    expect(await outcome(guard('beheer:read')({ context: {}, location }))).toBeInstanceOf(ForbiddenError);
  });

  test('een andere fout (bijv. server onbereikbaar) gaat ongewijzigd door', async () => {
    const down = new ApiError('INTERNAL_ERROR', 500);

    expect(await outcome(guardFor(() => Promise.reject(down))('notes:read')({ context: {}, location }))).toBe(down);
  });
});
