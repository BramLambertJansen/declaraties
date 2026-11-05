import { EventEmitter } from 'node:events';
import type { Pool } from 'pg';
import { afterEach, expect, test, vi } from 'vitest';
import { UserId } from '../../shared/ids.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import { createRouteEffects } from '../http/route-effects.ts';
import type { TransactionOutcome } from './types.ts';
import { createWithUser } from './with-user.ts';

const actor = { userId: UserId.parse('outcome-user'), sessionStrength: 'password' } as const;
const requestId = 'outcome-request';
afterEach(() => vi.restoreAllMocks());

// Unit-faultinjectie op de drivergrens: COMMIT kan uitgevoerd zijn voordat zijn bevestiging verloren gaat.
function fixture(failAt?: 'commit' | 'rollback') {
  const events: string[] = [];
  let committed = false;
  const client = Object.assign(new EventEmitter(), {
    query: vi.fn((text: string) => {
      events.push(text);
      if (text === 'commit') committed = true;
      if (text === failAt) return Promise.reject(new Error(`${text} acknowledgement lost`));
      const rows = text.includes('current_user')
        ? [{ clean: true }]
        : text.startsWith('select role')
          ? [{ role: 'user' }]
          : [];
      return Promise.resolve({ rows });
    }),
    release: vi.fn((destroy: boolean) => events.push(`release:${String(destroy)}`)),
  });
  const pool = unsafeCast<Pool>(
    { connect: () => Promise.resolve(client) },
    'test: pg-drivergrens met gecontroleerd verloren bevestigingen',
  );
  return { client, events, committed: () => committed, withUser: createWithUser(pool) };
}

test('bevestigde commit wordt precies eenmaal en na vrijgeven gerapporteerd', async () => {
  const t = fixture();
  const outcome = vi.fn((value: TransactionOutcome) => t.events.push(value));
  await expect(
    t.withUser(actor, () => Promise.resolve(42), { requestId, onTransactionOutcome: outcome }),
  ).resolves.toBe(42);
  expect(outcome).toHaveBeenCalledExactlyOnceWith('committed');
  expect(t.events.slice(-2)).toEqual(['release:false', 'committed']);
});

test('een bevestigde rollback van het werk wordt na vrijgeven gerapporteerd', async () => {
  const t = fixture();
  const error = new Error('handler failed');
  const outcome = vi.fn((value: TransactionOutcome) => t.events.push(value));
  await expect(
    t.withUser(actor, () => Promise.reject(error), { requestId, onTransactionOutcome: outcome }),
  ).rejects.toBe(error);
  expect(outcome).toHaveBeenCalledExactlyOnceWith('rolledBack');
  expect(t.events.slice(-3)).toEqual(['rollback', 'release:false', 'rolledBack']);
});

test('verloren COMMIT-bevestiging blijft onbekend en vernietigt de verbinding', async () => {
  const t = fixture('commit');
  const outcome = vi.fn();
  await expect(
    t.withUser(actor, () => Promise.resolve(), { requestId, onTransactionOutcome: outcome }),
  ).rejects.toThrow('commit acknowledgement lost');
  expect(t.committed()).toBe(true);
  expect(outcome).toHaveBeenCalledExactlyOnceWith('unknown');
  expect(t.client.release).toHaveBeenCalledExactlyOnceWith(true);
});

test('een mislukte ROLLBACK is geen bewijs van terugdraaien', async () => {
  const t = fixture('rollback');
  const error = new Error('handler failed');
  const outcome = vi.fn();
  await expect(
    t.withUser(actor, () => Promise.reject(error), { requestId, onTransactionOutcome: outcome }),
  ).rejects.toBe(error);
  expect(outcome).toHaveBeenCalledExactlyOnceWith('unknown');
  expect(t.client.release).toHaveBeenCalledWith(true);
});

test('route-cleanup verwijdert niets wanneer COMMIT al toegepast is maar de bevestiging ontbreekt', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const t = fixture('commit');
  const effects = createRouteEffects({ requestId });
  const cleanup = vi.fn(() => Promise.resolve());
  const mail = vi.fn(() => Promise.resolve());
  effects.afterRollback(cleanup);
  effects.afterCommit(mail);
  await expect(
    effects.run(() =>
      t.withUser(actor, () => Promise.resolve(), {
        requestId,
        onTransactionOutcome: effects.onTransactionOutcome,
      }),
    ),
  ).rejects.toThrow('commit acknowledgement lost');
  expect(t.committed()).toBe(true);
  expect(cleanup).not.toHaveBeenCalled();
  expect(mail).not.toHaveBeenCalled();
  effects.afterRollback(cleanup);
  await new Promise((resolve) => setImmediate(resolve));
  expect(cleanup).not.toHaveBeenCalled();
});

test('route-cleanup blijft werken na een bevestigde rollback', async () => {
  const t = fixture();
  const effects = createRouteEffects();
  const cleanup = vi.fn(() => {
    t.events.push('cleanup');
    return Promise.resolve();
  });
  effects.afterRollback(cleanup);
  await expect(
    effects.run(() =>
      t.withUser(actor, () => Promise.reject(new Error('handler failed')), {
        requestId,
        onTransactionOutcome: effects.onTransactionOutcome,
      }),
    ),
  ).rejects.toThrow('handler failed');
  expect(cleanup).toHaveBeenCalledOnce();
  expect(t.events.slice(-2)).toEqual(['release:false', 'cleanup']);
});

test('de rate-limitcommit is geen commitbewijs voor een later mislukte route', async () => {
  const t = fixture();
  const outcome = vi.fn();
  await expect(
    t.withUser(actor, () => Promise.reject(new Error('handler failed')), {
      requestId,
      rateLimit: { bucket: 'read', windowSeconds: 60, max: 10 },
      onTransactionOutcome: outcome,
    }),
  ).rejects.toThrow('handler failed');
  expect(t.committed()).toBe(true);
  expect(outcome).toHaveBeenCalledExactlyOnceWith('rolledBack');
});

test('een observerfout vervangt geen gecommitteerd resultaat en lekt geen foutinhoud', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const t = fixture();
  await expect(
    t.withUser(actor, () => Promise.resolve(42), {
      requestId,
      onTransactionOutcome: () => {
        throw new Error('private@example.test');
      },
    }),
  ).resolves.toBe(42);
  expect(log).toHaveBeenCalledOnce();
  expect(JSON.stringify(log.mock.calls)).not.toContain('private@example.test');
});
