import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { createOutboundClient } from './create.ts';
import type { OutboundConfig, OutboundLogEntry } from './index.ts';
import { startFakePartner, type FakePartner, type FakeRoutes } from './testing.ts';

// Spec uitgaande-client AC-14: één logregel per poging met precies de velden uit de spec, nooit headers, body, query of
// geheimen; een gooiende logschrijver stopt de aanroep niet. Netwerk alleen tegen de lokale nep-partner (R-UIT-07).

const partners: FakePartner[] = [];
afterEach(async () => {
  await Promise.all(partners.splice(0).map(async (partner) => partner.close()));
});

async function partnerWith(routes: FakeRoutes): Promise<FakePartner> {
  const partner = await startFakePartner(routes);
  partners.push(partner);
  return partner;
}

const configFor = (partner: FakePartner, log: OutboundConfig['log']): OutboundConfig => ({
  name: 'betaal-partner',
  baseUrl: partner.url,
  hosts: ['127.0.0.1'],
  appEnv: 'test',
  headers: { Authorization: 'Bearer h-geheim' },
  ...(log === undefined ? {} : { log }),
});

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
const item = z.object({ id: z.string() }).strict();
const secretCall = {
  requestId: 'r-log',
  method: 'POST',
  path: '/items/:id',
  params: { id: 'p-geheim' },
  query: { token: 'q-geheim' },
  body: { waarde: 'b-geheim' },
  schema: item,
  idempotencyKey: 'sleutel-1',
} as const;

describe('uitgaande-client/AC-14: de log noemt nooit geheimen', () => {
  test('uitgaande-client/AC-14: elke logregel heeft precies de velden uit de spec, path /items/:id en nergens geheim', async () => {
    const partner = await partnerWith({
      'POST /items/p-geheim': [{ status: 503 }, { status: 200, json: { id: 'i-1' } }],
    });
    const entries: OutboundLogEntry[] = [];
    const client = createOutboundClient(configFor(partner, (entry) => entries.push(entry)));

    const result = await client.call(secretCall);

    expect(result).toStrictEqual({ ok: true, status: 200, data: { id: 'i-1' } });
    // De partner kreeg de geheimen wel: de log laat ze weg, niet het verzoek.
    expect(partner.requests[0]).toMatchObject({
      path: '/items/p-geheim?token=q-geheim',
      headers: { authorization: 'Bearer h-geheim' },
      body: JSON.stringify({ waarde: 'b-geheim' }),
    });
    expect(entries).toHaveLength(2);
    for (const entry of entries) expect(Object.keys(entry).toSorted()).toStrictEqual(FIELDS);
    expect(JSON.stringify(entries)).not.toContain('geheim');
    expect(entries).toMatchObject([
      {
        requestId: 'r-log',
        outbound: 'betaal-partner',
        method: 'POST',
        path: '/items/:id',
        status: 503,
        attempt: 1,
        outcome: 'UPSTREAM_UNAVAILABLE',
        retry: true,
      },
      {
        requestId: 'r-log',
        outbound: 'betaal-partner',
        method: 'POST',
        path: '/items/:id',
        status: 200,
        attempt: 2,
        outcome: 'OK',
        retry: false,
      },
    ]);
    for (const entry of entries) {
      expect(Number.isNaN(Date.parse(entry.time))).toBe(false);
      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  test('uitgaande-client/AC-14: zonder antwoord is status null', async () => {
    const partner = await partnerWith({ 'GET /items/p-geheim': { destroy: true } });
    const entries: OutboundLogEntry[] = [];
    const client = createOutboundClient({
      ...configFor(partner, (entry) => entries.push(entry)),
      maxAttempts: 1,
    });

    await client
      .call({ requestId: 'r-log', method: 'GET', path: '/items/:id', params: { id: 'p-geheim' }, schema: item })
      .catch(() => undefined);

    expect(entries).toMatchObject([{ status: null, attempt: 1, outcome: 'UPSTREAM_UNAVAILABLE', retry: false }]);
    expect(JSON.stringify(entries)).not.toContain('geheim');
  });

  test('uitgaande-client/AC-14: een gooiende logschrijver laat de aanroep slagen', async () => {
    const partner = await partnerWith({ 'POST /items/p-geheim': { status: 200, json: { id: 'i-1' } } });
    let written = 0;
    const client = createOutboundClient(
      configFor(partner, () => {
        written += 1;
        throw new Error('logschrijver kapot');
      }),
    );

    const result = await client.call(secretCall);

    expect(result).toStrictEqual({ ok: true, status: 200, data: { id: 'i-1' } });
    expect(written).toBe(1);
  });
});
