import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { UserId } from '../../shared/ids.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { Tx, WithUser } from '../db/types.ts';
import { createRouteEffects } from '../http/route-effects.ts';
import { createOutboundClient } from './create.ts';
import { guardWithUser, OutboundForbiddenError, type OutboundClient } from './index.ts';
import { startFakePartner, type FakePartner } from './testing.ts';

// Spec uitgaande-client, de markering zonder database (AC-15 in het klein): een nep-withUser met dezelfde signatuur,
// echte createRouteEffects en een echte client tegen de lokale nep-partner (R-UIT-07). "Geen aanroep": teller 0.

const actor = { userId: UserId.parse('u-marker'), sessionStrength: 'password' } as const;
const ping = { requestId: 'r-marker', method: 'GET', path: '/ping', schema: z.object({ id: z.string() }) } as const;
const pong = { ok: true, status: 200, data: { id: 'pong' } };

// Zoals withUser: draait work en meldt de uitkomst; bij een fout eerst 'rolledBack', dan de fout door.
const fakeWithUser: WithUser = async (_actor, work, options) => {
  try {
    const result = await work(unsafeCast<Tx>({}, 'test: de nep-transactie wordt niet gebruikt'), { role: 'user' });
    options.onTransactionOutcome?.('committed');
    return result;
  } catch (error) {
    options.onTransactionOutcome?.('rolledBack');
    throw error;
  }
};

let partner: FakePartner;
let client: OutboundClient;
const setUp = async () => {
  partner = await startFakePartner({ 'GET /ping': { status: 200, json: { id: 'pong' } } });
  client = createOutboundClient({
    name: 'partner',
    baseUrl: partner.url,
    hosts: ['127.0.0.1'],
    appEnv: 'test',
    log: () => undefined,
  });
};
afterEach(async () => {
  vi.restoreAllMocks();
  await partner.close();
});

describe('uitgaande-client/AC-15: de markering zonder database', () => {
  test('uitgaande-client/AC-15: een aanroep in de work van guardWithUser geeft OutboundForbiddenError, zonder aanroep', async () => {
    await setUp();
    const guarded = guardWithUser(fakeWithUser);

    await expect(guarded(actor, async () => client.call(ping), { requestId: 'r-1' })).rejects.toBeInstanceOf(
      OutboundForbiddenError,
    );
    expect(partner.calls('GET /ping')).toBe(0);
  });

  test('uitgaande-client/AC-15: dezelfde async-functie mag na await guarded(...) wel aanroepen', async () => {
    await setUp();
    const guarded = guardWithUser(fakeWithUser);
    const flow = async () => {
      await guarded(actor, () => Promise.resolve(null), { requestId: 'r-1' });
      return client.call(ping);
    };

    expect(await flow()).toStrictEqual(pong);
    expect(partner.calls('GET /ping')).toBe(1);
  });

  test('uitgaande-client/AC-15: een late afterRollback, vanuit de gemarkeerde handler na de afwijzing geregistreerd, mag aanroepen', async () => {
    await setUp();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const guarded = guardWithUser(fakeWithUser);
    const effects = createRouteEffects({ requestId: 'r-1' });
    const late = Promise.withResolvers<undefined>();
    const cleaned = Promise.withResolvers<unknown>();
    const failure = new Error('handler faalt');

    const run = effects.run(() =>
      guarded(
        actor,
        () => {
          // Start onder de markering en registreert pas na de afwijzing van de transactie.
          void (async () => {
            await late.promise;
            effects.afterRollback(async () => {
              // Ook een afwijzing komt in `cleaned`, zodat de test niet blijft wachten.
              cleaned.resolve(await client.call(ping).catch((error: unknown) => error));
            });
          })();
          return Promise.reject(failure);
        },
        { requestId: 'r-1', onTransactionOutcome: effects.onTransactionOutcome },
      ),
    );

    await expect(run).rejects.toBe(failure);
    late.resolve(undefined);
    expect(await cleaned.promise).toStrictEqual(pong);
    expect(partner.calls('GET /ping')).toBe(1);
  });

  test('uitgaande-client/AC-15: een afterCommit-effect dat de client aanroept wordt geweigerd, zonder aanroep', async () => {
    await setUp();
    const effects = createRouteEffects({ requestId: 'r-1' });
    effects.afterCommit(async () => client.call(ping));

    await expect(effects.run(() => Promise.resolve(null))).rejects.toBeInstanceOf(OutboundForbiddenError);
    expect(partner.calls('GET /ping')).toBe(0);
  });
});
