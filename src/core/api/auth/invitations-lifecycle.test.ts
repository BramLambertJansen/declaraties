import { expect, test, vi } from 'vitest';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { Auth } from './auth.ts';
import { inviteUser } from './invitations.ts';
import { createRouteEffects } from '../http/route-effects.ts';

function fixture() {
  const deleteUser = vi.fn(() => Promise.resolve());
  const send = vi.fn(() => Promise.resolve({ status: true }));
  const auth = unsafeCast<Auth>(
    {
      $context: Promise.resolve({
        internalAdapter: {
          findUserByEmail: () => Promise.resolve(null),
          createUser: () => Promise.resolve({ id: 'new', email: 'new@example.test' }),
          deleteUser,
        },
      }),
      api: { requestPasswordReset: send },
    },
    'test: alleen de interne uitnodigingsstappen worden gebruikt',
  );
  return { auth, deleteUser, send };
}

test('na een commitfout wordt het auth-account opgeruimd zonder een mail te versturen', async () => {
  const { auth, deleteUser, send } = fixture();
  const effects = createRouteEffects();
  await expect(
    effects.run(async () => {
      await inviteUser(
        auth,
        { name: 'New', email: 'new@example.test' },
        { ...effects, beforeMail: () => Promise.resolve() },
      );
      expect(deleteUser).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      throw new Error('commit failed');
    }),
  ).rejects.toThrow('commit failed');
  expect(deleteUser).toHaveBeenCalledWith('new');
  expect(send).not.toHaveBeenCalled();
});

test('tokenopslag faalt na commit: het account blijft behouden voor opnieuw uitnodigen', async () => {
  const { auth, deleteUser, send } = fixture();
  send.mockRejectedValueOnce(new Error('token write failed'));
  const effects = createRouteEffects();
  const beforeMail = vi.fn(() => Promise.resolve());
  await expect(
    effects.run(async () => {
      await inviteUser(auth, { name: 'New', email: 'new@example.test' }, { ...effects, beforeMail });
      expect(send).not.toHaveBeenCalled();
    }),
  ).rejects.toThrow('token write failed');
  expect(beforeMail).toHaveBeenCalledWith('new');
  expect(deleteUser).not.toHaveBeenCalled();
});

test('rechtstreeks uitnodigen zonder transactie ruimt ook een fout na beforeMail op', async () => {
  const { auth, deleteUser, send } = fixture();
  send.mockRejectedValueOnce(new Error('token write failed'));
  await expect(inviteUser(auth, { name: 'New', email: 'new@example.test' })).rejects.toThrow('token write failed');
  expect(deleteUser).toHaveBeenCalledWith('new');
});
