import { expect, test, vi } from 'vitest';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { Auth } from './auth.ts';
import { listOwnSessions } from './profile.ts';

test('de sessielijst vraagt actieve sessies en sluit beide verlopen termijnen uit', async () => {
  const now = Date.now();
  const session = (id: string, age: number, expiresAt: number) => ({
    id,
    createdAt: new Date(now - age),
    updatedAt: new Date(now - age),
    expiresAt: new Date(expiresAt),
    userAgent: '',
  });
  const listSessions = vi.fn(() =>
    Promise.resolve([
      session('current', 1000, now + 1000),
      session('idle-expired', 86400000, now - 1),
      session('boundary', 1000, now),
      session('absolute-expired', 8 * 86400000, now + 1000),
    ]),
  );
  const auth = unsafeCast<Auth>(
    { $context: Promise.resolve({ internalAdapter: { listSessions } }) },
    'test: alleen listSessions wordt gebruikt',
  );
  const result = await listOwnSessions(auth, { userId: 'u1', sessionId: 'current' }, now);
  expect(result.map((item) => item.id)).toEqual(['current']);
  expect(listSessions).toHaveBeenCalledWith('u1', { onlyActiveSessions: true });
});
