import { describe, expect, test, vi } from 'vitest';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { Auth } from './auth.ts';
import { AccountAlreadyActiveError, AccountNotFoundError, reinviteUser } from './invitations.ts';
import { createRouteEffects } from '../http/route-effects.ts';

function fixture(options: { user?: boolean; credential?: boolean } = {}) {
  const { user = true, credential = false } = options;
  const calls: string[] = [];
  const deleteMany = vi.fn(() => {
    calls.push('deleteMany');
    return Promise.resolve(1);
  });
  const send = vi.fn(() => {
    calls.push('requestPasswordReset');
    return Promise.resolve({ status: true });
  });
  const auth = unsafeCast<Auth>(
    {
      $context: Promise.resolve({
        internalAdapter: {
          findUserById: () => Promise.resolve(user ? { id: 'u1', email: 'u1@example.test' } : null),
          findCredentialAccount: () => Promise.resolve(credential ? { id: 'c1' } : null),
        },
        adapter: { deleteMany },
      }),
      api: { requestPasswordReset: send },
    },
    'test: alleen de interne herinvite-stappen worden gebruikt',
  );
  return { auth, deleteMany, send, calls };
}

describe('reinviteUser met lifecycle', () => {
  test('verwijderen en versturen gebeuren pas na commit, in die volgorde', async () => {
    const { auth, deleteMany, send, calls } = fixture();
    const effects = createRouteEffects();
    await effects.run(async () => {
      await reinviteUser(auth, 'u1', effects);
      expect(deleteMany).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });
    expect(calls).toStrictEqual(['deleteMany', 'requestPasswordReset']);
    expect(send).toHaveBeenCalledWith({ body: { email: 'u1@example.test' } });
  });

  test('verwijderen en versturen zijn samen één geregistreerd effect', async () => {
    const { auth, calls } = fixture();
    const registered: (() => Promise<unknown>)[] = [];
    const afterCommit = vi.fn((effect: () => Promise<unknown>) => void registered.push(effect));
    await reinviteUser(auth, 'u1', { afterCommit });
    expect(afterCommit).toHaveBeenCalledTimes(1);
    expect(calls).toStrictEqual([]);
    await registered[0]?.();
    expect(calls).toStrictEqual(['deleteMany', 'requestPasswordReset']);
  });

  test('bij rollback is er niets verwijderd of verstuurd', async () => {
    const { auth, deleteMany, send } = fixture();
    const effects = createRouteEffects();
    await expect(
      effects.run(async () => {
        await reinviteUser(auth, 'u1', effects);
        throw new Error('commit failed');
      }),
    ).rejects.toThrow('commit failed');
    expect(deleteMany).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  test('faalt het verwijderen in het effect na commit: niet versturen en run gooit', async () => {
    const { auth, deleteMany, send } = fixture();
    deleteMany.mockRejectedValueOnce(new Error('delete failed'));
    const effects = createRouteEffects();
    await expect(effects.run(() => reinviteUser(auth, 'u1', effects))).rejects.toThrow('delete failed');
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  test('onbekende gebruiker: AccountNotFoundError en geen effect geregistreerd', async () => {
    const { auth } = fixture({ user: false });
    const afterCommit = vi.fn();
    await expect(reinviteUser(auth, 'u1', { afterCommit })).rejects.toBeInstanceOf(AccountNotFoundError);
    expect(afterCommit).not.toHaveBeenCalled();
  });

  test('actief account: AccountAlreadyActiveError en geen effect geregistreerd', async () => {
    const { auth, deleteMany } = fixture({ credential: true });
    const afterCommit = vi.fn();
    await expect(reinviteUser(auth, 'u1', { afterCommit })).rejects.toBeInstanceOf(AccountAlreadyActiveError);
    expect(afterCommit).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('reinviteUser zonder lifecycle', () => {
  test('blijft synchroon: oude tokens weg en mail verstuurd bij terugkeer', async () => {
    const { auth, calls } = fixture();
    await reinviteUser(auth, 'u1');
    expect(calls).toStrictEqual(['deleteMany', 'requestPasswordReset']);
  });

  test('onbekende gebruiker en actief account gooien zonder iets te verwijderen', async () => {
    const missing = fixture({ user: false });
    await expect(reinviteUser(missing.auth, 'u1')).rejects.toBeInstanceOf(AccountNotFoundError);
    const active = fixture({ credential: true });
    await expect(reinviteUser(active.auth, 'u1')).rejects.toBeInstanceOf(AccountAlreadyActiveError);
    expect([missing.calls, active.calls]).toStrictEqual([[], []]);
  });
});
