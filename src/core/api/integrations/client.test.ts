import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { UserId } from '../../shared/ids.ts';
import { INTEGRATION_SWITCH_MAX_AGE_MS } from '../../shared/limits.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { Tx, WithUser } from '../db/types.ts';
import { AppError } from '../errors.ts';
import { createOutboundClient } from '../outbound/create.ts';
import { guardWithUser, OutboundForbiddenError, OutboundUsageError, type OutboundLogEntry } from '../outbound/index.ts';
import { startFakePartner, type FakePartner } from '../outbound/testing.ts';
import { readSwitch, registerIntegrations, type IntegrationClient, type SwitchReading } from './index.ts';

// Spec koppelingsregister, unitdeel van AC-2 en AC-5: de lezing (alleen onder de markering) en de volgorde van de controles
// in IntegrationClient.call, tegen de lokale nep-partner (R-UIT-07). "Geen aanroep" = teller 0. De stand komt hier uit een
// nagebootste readIntegrationSwitch (src/core/api/db/integration-switch.ts); de echte lezing in withUser bewijzen de
// integratietests in test/integrations/.

const db = vi.hoisted(() => {
  const reads: string[] = [];
  return { states: new Map<string, boolean>(), reads };
});
vi.mock('../db/integration-switch.ts', () => ({
  readIntegrationSwitch: (_tx: unknown, name: string): Promise<boolean> => {
    db.reads.push(name);
    return Promise.resolve(db.states.get(name) ?? false);
  },
}));

const actor = { userId: UserId.parse('u-koppeling'), sessionStrength: 'password' } as const;
const fakeTx = unsafeCast<Tx>({}, 'test: readIntegrationSwitch is nagebootst, de transactie wordt niet gebruikt');

// Zoals withUser, zonder database: draait work met een nep-transactie.
const fakeWithUser: WithUser = async (_actor, work) => work(fakeTx, { role: 'user' });
const guarded = guardWithUser(fakeWithUser);

// Een lezing zoals een route hem maakt: binnen withUser, dus onder de markering.
const readingOf = async (name: string): Promise<SwitchReading> =>
  guarded(actor, async (tx) => readSwitch(tx, name), { requestId: 'r-lezing' });

const TRAITS = {
  auth: 'none',
  direction: ['read'],
  cadence: ['on-demand'],
  sensitivity: 'normal',
  cost: 'free',
  source: 'partner',
} as const;

const item = z.object({ id: z.string() }).strict();
const request = {
  requestId: 'r-1',
  method: 'GET',
  path: '/items/:id',
  params: { id: 'i-1' },
  schema: item,
} as const;

const FIELDS = [
  'attempt',
  'durationMs',
  'method',
  'outbound',
  'outcome',
  'path',
  'requestId',
  'retry',
  'status',
  'time',
];

let partner: FakePartner;
let client: IntegrationClient;
let lines: OutboundLogEntry[];
beforeEach(async () => {
  db.states.clear();
  db.reads.length = 0;
  lines = [];
  partner = await startFakePartner({ 'GET /items/i-1': { status: 200, json: { id: 'i-1' } } });
  const integrations = registerIntegrations([
    { name: 'partner', hosts: ['127.0.0.1'], traits: TRAITS },
    { name: 'andere', hosts: ['127.0.0.1'], traits: TRAITS },
  ]);
  client = integrations.client('partner', {
    baseUrl: partner.url,
    appEnv: 'test',
    log: (entry) => {
      lines.push(entry);
    },
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await partner.close();
});

// De fout van een afgewezen aanroep (null als hij slaagt).
async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (reason: unknown) => reason,
  );
}

describe('koppelingsregister: readSwitch leest alleen onder de markering', () => {
  test('koppelingsregister/AC-5: readSwitch buiten withUser geeft OutboundUsageError, zonder lezing', async () => {
    await expect(readSwitch(fakeTx, 'partner')).rejects.toBeInstanceOf(OutboundUsageError);
    expect(db.reads).toStrictEqual([]);
  });

  test('koppelingsregister: readSwitch in withUser geeft naam en stand van readIntegrationSwitch', async () => {
    db.states.set('partner', true);

    const on = await readingOf('partner');
    const off = await readingOf('andere');

    expect([on.name, on.enabled]).toStrictEqual(['partner', true]);
    expect([off.name, off.enabled]).toStrictEqual(['andere', false]);
    expect(db.reads).toStrictEqual(['partner', 'andere']);
  });
});

describe('koppelingsregister/AC-2: stand uit geeft UPSTREAM_UNAVAILABLE zonder aanroep', () => {
  test('koppelingsregister/AC-2: stand uit: UPSTREAM_UNAVAILABLE, geen aanroep, één logregel DISABLED met attempt 0 en status null', async () => {
    const reading = await readingOf('partner');
    expect(reading.enabled).toBe(false);

    const error = await failure(client.call(reading, request));

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', cause: undefined });
    expect(partner.requests).toHaveLength(0);
    expect(lines).toHaveLength(1);
    expect(Object.keys(lines[0] ?? {}).sort()).toStrictEqual(FIELDS);
    expect(lines[0]).toMatchObject({
      requestId: 'r-1',
      outbound: 'partner',
      method: 'GET',
      path: '/items/:id',
      status: null,
      attempt: 0,
      outcome: 'DISABLED',
      retry: false,
    });
  });

  // Randgeval: ook bij stand uit controleert call eerst het sjabloon, zodat een geheim in de query nooit in de log komt.
  test('koppelingsregister/AC-2: stand uit met een ongeldig sjabloon (/items?token=geheim): dezelfde gebruiksfout als de gewone client, geen logregel', async () => {
    const reading = await readingOf('partner');
    expect(reading.enabled).toBe(false);
    const invalid = { requestId: 'r-1', method: 'GET', path: '/items?token=geheim', schema: item } as const;
    const plain = createOutboundClient({
      name: 'partner',
      baseUrl: partner.url,
      hosts: ['127.0.0.1'],
      appEnv: 'test',
      log: () => undefined,
    });
    const expected = await failure(plain.call(invalid));
    expect(expected).toBeInstanceOf(OutboundUsageError);

    const error = await failure(client.call(reading, invalid));

    expect(error).toBeInstanceOf(OutboundUsageError);
    expect(error).toMatchObject({ message: expected instanceof Error ? expected.message : '' });
    expect(partner.requests).toHaveLength(0);
    expect(lines).toHaveLength(0);
    expect(JSON.stringify(lines)).not.toContain('token');
  });

  test('koppelingsregister/AC-2: stand aan: de gewone client doet de aanroep', async () => {
    db.states.set('partner', true);
    const reading = await readingOf('partner');

    expect(await client.call(reading, request)).toStrictEqual({ ok: true, status: 200, data: { id: 'i-1' } });
    expect(partner.calls('GET /items/i-1')).toBe(1);
    expect(lines.map((line) => line.outcome)).toStrictEqual(['OK']);
  });
});

describe('koppelingsregister/AC-5: een lezing die niet geldt geeft OutboundUsageError, zonder aanroep', () => {
  test('koppelingsregister/AC-5: een lezing van een andere koppeling', async () => {
    db.states.set('andere', true);
    const reading = await readingOf('andere');

    await expect(client.call(reading, request)).rejects.toBeInstanceOf(OutboundUsageError);
    expect(partner.requests).toHaveLength(0);
    expect(lines).toHaveLength(0);
  });

  test('koppelingsregister/AC-5: een lezing ouder dan INTEGRATION_SWITCH_MAX_AGE_MS', async () => {
    db.states.set('partner', true);
    const reading = await readingOf('partner');
    const now = performance.now.bind(performance);
    vi.spyOn(performance, 'now').mockImplementation(() => now() + INTEGRATION_SWITCH_MAX_AGE_MS + 1);

    await expect(client.call(reading, request)).rejects.toBeInstanceOf(OutboundUsageError);
    expect(partner.requests).toHaveLength(0);
    expect(lines).toHaveLength(0);
  });

  test('koppelingsregister/AC-5: een lezing binnen de grens geldt nog (OV-3)', async () => {
    db.states.set('partner', true);
    const reading = await readingOf('partner');
    const now = performance.now.bind(performance);
    vi.spyOn(performance, 'now').mockImplementation(() => now() + INTEGRATION_SWITCH_MAX_AGE_MS - 5000);

    expect(await client.call(reading, request)).toStrictEqual({ ok: true, status: 200, data: { id: 'i-1' } });
    expect(partner.calls('GET /items/i-1')).toBe(1);
  });

  test('koppelingsregister/AC-5: een oude lezing die uit staat geeft OutboundUsageError, geen DISABLED (controle 2 vóór 3)', async () => {
    const reading = await readingOf('partner');
    const now = performance.now.bind(performance);
    vi.spyOn(performance, 'now').mockImplementation(() => now() + INTEGRATION_SWITCH_MAX_AGE_MS + 1);

    await expect(client.call(reading, request)).rejects.toBeInstanceOf(OutboundUsageError);
    expect(partner.requests).toHaveLength(0);
    expect(lines).toHaveLength(0);
  });

  test.each([
    ['een kopie van een echte lezing', (real: SwitchReading) => ({ ...real })],
    ['een kopie met de stand op aan', (real: SwitchReading) => ({ ...real, enabled: true })],
    ['een object met dezelfde naam en stand', (real: SwitchReading) => ({ name: real.name, enabled: true })],
  ])('koppelingsregister/AC-5: een nagemaakt object (%s)', async (_label, forge) => {
    const real = await readingOf('partner');
    const forged = unsafeCast<SwitchReading>(forge(real), 'test: een lezing die core niet maakte');

    await expect(client.call(forged, request)).rejects.toBeInstanceOf(OutboundUsageError);
    expect(partner.requests).toHaveLength(0);
    expect(lines).toHaveLength(0);
  });
});

describe('koppelingsregister/AC-5: onder de markering eerst OutboundForbiddenError', () => {
  test.each([
    ['een lezing die uit staat', false],
    ['een lezing die aan staat', true],
  ])(
    'koppelingsregister/AC-5: call in withUser met %s geeft OutboundForbiddenError, zonder aanroep',
    async (_label, on) => {
      db.states.set('partner', on);
      const reading = await readingOf('partner');

      const error = await failure(guarded(actor, async () => client.call(reading, request), { requestId: 'r-in' }));

      expect(error).toBeInstanceOf(OutboundForbiddenError);
      expect(partner.requests).toHaveLength(0);
      expect(lines).toHaveLength(0);
    },
  );

  test('koppelingsregister/AC-5: call in withUser met een nagemaakt object of een andere koppeling geeft OutboundForbiddenError', async () => {
    const other = await readingOf('andere');
    const forged = unsafeCast<SwitchReading>({ ...other, name: 'partner' }, 'test: een lezing die core niet maakte');

    for (const reading of [other, forged]) {
      const error = await failure(guarded(actor, async () => client.call(reading, request), { requestId: 'r-in' }));
      expect(error).toBeInstanceOf(OutboundForbiddenError);
    }
    expect(partner.requests).toHaveLength(0);
    expect(lines).toHaveLength(0);
  });
});
