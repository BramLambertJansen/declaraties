import type { WithUser } from '#core/api/db/types.ts';
import { UserId } from '#core/shared/ids.ts';

export function createLoginPolicy(withUser: WithUser) {
  return (userId: string) =>
    withUser(
      { userId: UserId.parse(userId), sessionStrength: 'password' },
      (_tx, actorRole) => Promise.resolve(actorRole.role === 'admin'),
      { requestId: crypto.randomUUID(), readOnly: true },
    );
}
