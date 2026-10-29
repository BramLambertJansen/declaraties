import { getSessionFromCtx } from 'better-auth/api';
import type { Pool } from 'pg';
import { beforeEach, expect, test, vi } from 'vitest';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import { createAccountLifecycle } from './account-lifecycle.ts';

vi.mock('better-auth/api', async (original) => ({
  ...(await original<typeof import('better-auth/api')>()),
  getSessionFromCtx: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());

test.each([
  { required: false, strength: 'password', recordsLogin: false },
  { required: true, strength: 'password', recordsLogin: true },
  { required: true, strength: 'mfa', recordsLogin: false },
])('TOTP bij bestaande sessie: %j', async ({ required, strength, recordsLogin }) => {
  const user = { id: 'enrollment-user', sessionVersion: 2 };
  const session = { token: 'enrollment-token', sessionStrength: strength, sessionVersion: 2 };
  vi.mocked(getSessionFromCtx).mockResolvedValue(
    unsafeCast({ user, session }, 'Unit-fixture bevat de bestaande sessie voor MFA-inschrijving'),
  );
  const query = vi.fn(() => Promise.resolve({ rowCount: 1 }));
  const lifecycle = createAccountLifecycle(
    unsafeCast<Pool>({ query }, 'Unit-fixture voert alleen de loginregistratiequery uit'),
    () => Promise.resolve(required),
  );
  const ctx = {
    path: '/two-factor/verify-totp',
    context: {
      internalAdapter: { findUserById: () => Promise.resolve(user) },
      session: { session },
      newSession: { user, session },
    },
  };
  const endpoint = unsafeCast<Parameters<typeof lifecycle.beforeEndpoint>[0]>(
    ctx,
    'Unit-fixture bevat de velden die de account-lifecycle gebruikt',
  );
  await lifecycle.beforeEndpoint(endpoint);
  await lifecycle.beforeSession({ userId: user.id }, ctx);
  await lifecycle.afterEndpoint(endpoint, Date.now());
  expect(query).toHaveBeenCalledTimes(recordsLogin ? 1 : 0);
});
