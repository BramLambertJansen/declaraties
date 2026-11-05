import { EventEmitter } from 'node:events';
import type { Pool } from 'pg';
import { expect, test, vi } from 'vitest';
import { UserId } from '../../shared/ids.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import { createWithUser } from './with-user.ts';

test('disconnect tijdens een wachtende handler faalt gecontroleerd en vernietigt de client', async () => {
  const client = Object.assign(new EventEmitter(), {
    query: vi.fn((text: string) => Promise.resolve({ rows: text.includes('current_user') ? [{ clean: true }] : [] })),
    release: vi.fn(),
  });
  const pool = unsafeCast<Pool>(
    { connect: () => Promise.resolve(client) },
    'test: pg-client met echte error-events en gesimuleerde queryantwoorden',
  );
  const entered = Promise.withResolvers<undefined>();
  const resume = Promise.withResolvers<undefined>();
  const result = createWithUser(pool)(
    { userId: UserId.parse('u1'), sessionStrength: 'password' },
    async () => {
      entered.resolve(undefined);
      await resume.promise;
    },
    { requestId: 'r1' },
  );
  const failed = expect(result).rejects.toThrow('connection lost');
  await entered.promise;
  expect(() => client.emit('error', new Error('connection lost'))).not.toThrow();
  await failed;
  expect(client.release).toHaveBeenCalledWith(true);
  expect(client.listenerCount('error')).toBe(0);
  resume.resolve(undefined);
  await new Promise((resolve) => setImmediate(resolve));
  expect(client.query.mock.calls.map(([text]) => text)).not.toContain('commit');
});
