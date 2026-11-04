import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { AppError } from '../../src/core/api/errors.ts';
import { createOutboundClient, type OutboundConfig } from '../../src/core/api/outbound/index.ts';
import { startFakePartner, type FakePartner, type FakeRoutes } from '../../src/core/api/outbound/testing.ts';

// Spec uitgaande-client, de AC's met echte wachttijden (AC-1, AC-2, het time-outdeel van AC-4, AC-5). Echte fetch tegen de
// lokale nep-partner (R-UIT-07); timing-asserties met de marges uit de spec.

const partners: FakePartner[] = [];
afterEach(async () => {
  await Promise.all(partners.splice(0).map(async (partner) => partner.close()));
});

async function partnerWith(routes: FakeRoutes): Promise<FakePartner> {
  const partner = await startFakePartner(routes);
  partners.push(partner);
  return partner;
}

const configFor = (partner: FakePartner, extra: Partial<OutboundConfig> = {}): OutboundConfig => ({
  name: 'partner',
  baseUrl: partner.url,
  hosts: ['127.0.0.1'],
  appEnv: 'test',
  log: () => undefined,
  ...extra,
});

const item = z.object({ id: z.string() }).strict();
const getItems = { requestId: 'r-1', method: 'GET', path: '/items', schema: item } as const;

async function upstreamCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof AppError)) throw new Error(`verwacht een AppError, kreeg ${String(error)}`);
  expect(error.cause).toBeUndefined();
  return error.code;
}

describe('uitgaande-client/AC-1: time-out per poging', () => {
  test('uitgaande-client/AC-1: GET met timeoutMs 300, maxAttempts 1 en 2 s vertraging geeft UPSTREAM_TIMEOUT binnen 300–1000 ms na 1 aanroep', async () => {
    const partner = await partnerWith({ 'GET /items': { status: 200, json: { id: 'laat' }, delayMs: 2000 } });
    const client = createOutboundClient(configFor(partner, { timeoutMs: 300, maxAttempts: 1 }));
    const started = performance.now();

    const code = await upstreamCode(client.call(getItems));
    const elapsed = performance.now() - started;

    expect(code).toBe('UPSTREAM_TIMEOUT');
    expect(elapsed).toBeGreaterThanOrEqual(300);
    expect(elapsed).toBeLessThan(1000);
    expect(partner.calls('GET /items')).toBe(1);
  });
});

describe('time-out geldt ook voor de body (spec uitgaande-client, Herhalen)', () => {
  test('een body die blijft hangen: bodyDelayMs 2000 met timeoutMs 300 en maxAttempts 1 geeft UPSTREAM_TIMEOUT binnen 1000 ms', async () => {
    const partner = await partnerWith({
      'GET /items': { status: 200, json: { id: 'traag' }, bodyDelayMs: 2000 },
    });
    const client = createOutboundClient(configFor(partner, { timeoutMs: 300, maxAttempts: 1 }));
    const started = performance.now();

    const code = await upstreamCode(client.call(getItems));

    expect(code).toBe('UPSTREAM_TIMEOUT');
    expect(performance.now() - started).toBeLessThan(1000);
    expect(partner.calls('GET /items')).toBe(1);
  });
});

describe('uitgaande-client/AC-2: het budget begrenst de pogingen', () => {
  test('uitgaande-client/AC-2: elke 503 na 900 ms met budget 1500 geeft hooguit 2 aanroepen, binnen 1800 ms, UPSTREAM_TIMEOUT', async () => {
    const partner = await partnerWith({ 'GET /items': { status: 503, delayMs: 900 } });
    const client = createOutboundClient(configFor(partner, { timeoutMs: 1000, budgetMs: 1500, maxAttempts: 3 }));
    const started = performance.now();

    const code = await upstreamCode(client.call(getItems));

    expect(code).toBe('UPSTREAM_TIMEOUT');
    expect(performance.now() - started).toBeLessThan(1800);
    expect(partner.calls('GET /items')).toBeLessThanOrEqual(2);
  });
});

describe('uitgaande-client/AC-4: POST met sleutel na een time-out', () => {
  test('uitgaande-client/AC-4: eerst een time-out, dan 201: slaagt na 2 aanroepen met dezelfde Idempotency-Key', async () => {
    const partner = await partnerWith({
      'POST /orders': [
        { status: 201, json: { id: 'te-laat' }, delayMs: 1500 },
        { status: 201, json: { id: 'o-1' } },
      ],
    });
    const client = createOutboundClient(configFor(partner, { timeoutMs: 300 }));

    const result = await client.call({
      requestId: 'r-1',
      method: 'POST',
      path: '/orders',
      body: { a: 1 },
      schema: item,
      idempotencyKey: 'order-123',
    });

    expect(result).toStrictEqual({ ok: true, status: 201, data: { id: 'o-1' } });
    expect(partner.calls('POST /orders')).toBe(2);
    expect(partner.requests.map((request) => request.headers['idempotency-key'])).toStrictEqual([
      'order-123',
      'order-123',
    ]);
  });
});

describe('uitgaande-client/AC-5: Retry-After', () => {
  async function gapAfter(retryAfter: string): Promise<number> {
    const partner = await partnerWith({
      'GET /items': [
        { status: 429, headers: { 'retry-after': retryAfter } },
        { status: 200, json: { id: 'i-1' } },
      ],
    });
    const client = createOutboundClient(configFor(partner));

    const result = await client.call(getItems);

    expect(result).toStrictEqual({ ok: true, status: 200, data: { id: 'i-1' } });
    expect(partner.calls('GET /items')).toBe(2);
    // Aankomsttijden zoals de nep-partner ze vastlegt (`at`, performance.now()). Aankomst 1 ligt vóór het eerste antwoord
    // en aankomst 2 na de start van de tweede aanroep: het gemeten gat is de wachttijd plus de antwoordtijd van poging 1
    // (lokaal enkele ms, het eerste antwoord heeft geen vertraging). Het kan dus nooit kleiner zijn dan de wachttijd; de
    // grens van 1000 ms uit de spec geldt zonder marge.
    const [first, second] = partner.requests;
    if (first === undefined || second === undefined) throw new Error('twee verzoeken verwacht');
    return second.at - first.at;
  }

  test('uitgaande-client/AC-5: 429 met Retry-After 1, dan 200: de tweede aanroep start ten minste 1000 ms later', async () => {
    expect(await gapAfter('1')).toBeGreaterThanOrEqual(1000);
  });

  test('uitgaande-client/AC-5: 429 met een HTTP-datum 2 s vooruit: ten minste 1000 ms', async () => {
    expect(await gapAfter(new Date(Date.now() + 2000).toUTCString())).toBeGreaterThanOrEqual(1000);
  });

  test('uitgaande-client/AC-5: 429 met Retry-After soon: de backoff geldt (hooguit 200 ms voor de eerste herhaling)', async () => {
    expect(await gapAfter('soon')).toBeLessThan(1000);
  });
});
