import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '../errors.ts';
import { createOutboundClient, OutboundUsageError, type OutboundConfig } from './index.ts';
import { startFakePartner, type FakePartner, type FakeRoutes } from './testing.ts';

// Spec uitgaande-client, unitdeel: de AC's zonder echte wachttijd, de spionnen op `cancel` van de body, de
// Retry-After-parser en de jitter (kleine waarden). Netwerk alleen tegen de lokale nep-partner (R-UIT-07); fetch is echt.

const partners: FakePartner[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
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

// De fout van een afgewezen aanroep; een UPSTREAM_* is een AppError zonder cause.
async function upstreamCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof AppError)) throw new Error(`verwacht een AppError, kreeg ${String(error)}`);
  expect(error.cause).toBeUndefined();
  return error.code;
}

const cancelSpy = () => vi.spyOn(ReadableStream.prototype, 'cancel');

describe('uitgaande-client/AC-3: POST zonder sleutel wordt niet herhaald', () => {
  test('uitgaande-client/AC-3: een 503 geeft na 1 aanroep UPSTREAM_UNAVAILABLE', async () => {
    const partner = await partnerWith({ 'POST /orders': [{ status: 503 }, { status: 201, json: { id: 'o-1' } }] });
    const client = createOutboundClient(configFor(partner));

    const code = await upstreamCode(
      client.call({ requestId: 'r-1', method: 'POST', path: '/orders', body: { a: 1 }, schema: item }),
    );

    expect(code).toBe('UPSTREAM_UNAVAILABLE');
    expect(partner.calls('POST /orders')).toBe(1);
  });

  test('uitgaande-client/AC-3: een verbroken verbinding geeft na 1 aanroep UPSTREAM_UNAVAILABLE', async () => {
    const partner = await partnerWith({ 'POST /orders': [{ destroy: true }, { status: 201, json: { id: 'o-1' } }] });
    const client = createOutboundClient(configFor(partner));

    const code = await upstreamCode(
      client.call({ requestId: 'r-1', method: 'POST', path: '/orders', body: { a: 1 }, schema: item }),
    );

    expect(code).toBe('UPSTREAM_UNAVAILABLE');
    expect(partner.calls('POST /orders')).toBe(1);
  });
});

describe('uitgaande-client/AC-4: POST met sleutel wordt herhaald met dezelfde Idempotency-Key', () => {
  test('uitgaande-client/AC-4: eerst 503, dan 201: slaagt na 2 aanroepen met dezelfde sleutel', async () => {
    const partner = await partnerWith({ 'POST /orders': [{ status: 503 }, { status: 201, json: { id: 'o-1' } }] });
    const client = createOutboundClient(configFor(partner));

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

describe('uitgaande-client/AC-6: Retry-After die niet in het budget past', () => {
  test('uitgaande-client/AC-6: 429 met Retry-After 30 geeft binnen 500 ms UPSTREAM_UNAVAILABLE na 1 aanroep, body afgebroken', async () => {
    const partner = await partnerWith({
      'GET /items': { status: 429, headers: { 'retry-after': '30' }, json: { fout: 'te snel' } },
    });
    const client = createOutboundClient(configFor(partner, { budgetMs: 8000 }));
    const cancel = cancelSpy();
    const started = performance.now();

    const code = await upstreamCode(client.call({ requestId: 'r-1', method: 'GET', path: '/items', schema: item }));

    expect(code).toBe('UPSTREAM_UNAVAILABLE');
    expect(performance.now() - started).toBeLessThan(500);
    expect(partner.calls('GET /items')).toBe(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('uitgaande-client/AC-7: welke GET-uitkomsten herhaald worden', () => {
  test.each([
    [400, 'UPSTREAM_INVALID'],
    [404, 'UPSTREAM_INVALID'],
    [500, 'UPSTREAM_UNAVAILABLE'],
  ])('uitgaande-client/AC-7: een GET met %i geeft na 1 aanroep %s', async (status, expected) => {
    const partner = await partnerWith({ 'GET /items': { status, json: { fout: 'x' } } });
    const client = createOutboundClient(configFor(partner));

    const code = await upstreamCode(client.call({ requestId: 'r-1', method: 'GET', path: '/items', schema: item }));

    expect(code).toBe(expected);
    expect(partner.calls('GET /items')).toBe(1);
  });

  test('uitgaande-client/AC-7: altijd 503 met maxAttempts 3 geeft 3 aanroepen en elke ongelezen body afgebroken', async () => {
    const partner = await partnerWith({ 'GET /items': { status: 503, json: { fout: 'weg' } } });
    const client = createOutboundClient(configFor(partner, { maxAttempts: 3 }));
    const cancel = cancelSpy();

    const code = await upstreamCode(client.call({ requestId: 'r-1', method: 'GET', path: '/items', schema: item }));

    expect(code).toBe('UPSTREAM_UNAVAILABLE');
    expect(partner.calls('GET /items')).toBe(3);
    expect(cancel).toHaveBeenCalledTimes(3);
  });

  test('uitgaande-client/AC-7: eerst een verbroken verbinding, dan 200: slaagt na 2 aanroepen', async () => {
    const partner = await partnerWith({ 'GET /items': [{ destroy: true }, { status: 200, json: { id: 'i-1' } }] });
    const client = createOutboundClient(configFor(partner));

    const result = await client.call({ requestId: 'r-1', method: 'GET', path: '/items', schema: item });

    expect(result).toStrictEqual({ ok: true, status: 200, data: { id: 'i-1' } });
    expect(partner.calls('GET /items')).toBe(2);
  });
});

describe('uitgaande-client/AC-9: redirects worden nooit gevolgd', () => {
  test('uitgaande-client/AC-9: een 302 naar een tweede nep-partner geeft UPSTREAM_INVALID; de tweede telt 0', async () => {
    const second = await partnerWith({ 'GET /items': { status: 200, json: { id: 'elders' } } });
    const first = await partnerWith({ 'GET /items': { status: 302, headers: { location: `${second.url}/items` } } });
    const client = createOutboundClient(configFor(first));

    const code = await upstreamCode(client.call({ requestId: 'r-1', method: 'GET', path: '/items', schema: item }));

    expect(code).toBe('UPSTREAM_INVALID');
    expect(first.calls('GET /items')).toBe(1);
    expect(second.calls('GET /items')).toBe(0);
  });
});

describe('uitgaande-client/AC-11: het antwoord moet bij het schema passen', () => {
  test.each([
    ['een 200 die niet bij het schema past', { status: 200, json: { geheim: 'partner-geheim' } }],
    ['een 200 die geen JSON is', { status: 200, body: 'partner-geheim, geen json' }],
  ])('uitgaande-client/AC-11: %s geeft UPSTREAM_INVALID zonder partnertekst', async (_label, answer) => {
    const partner = await partnerWith({ 'GET /items': answer });
    const client = createOutboundClient(configFor(partner));

    const error = await client.call({ requestId: 'r-1', method: 'GET', path: '/items', schema: item }).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'UPSTREAM_INVALID', cause: undefined });
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain('partner-geheim');
  });

  test.each([
    ['een 204', { status: 204 }, 204],
    ['een lege 200', { status: 200, body: '' }, 200],
  ])('uitgaande-client/AC-11: %s geeft het schema undefined', async (_label, answer, status) => {
    const partner = await partnerWith({ 'GET /items': answer });
    const client = createOutboundClient(configFor(partner));
    const seen: unknown[] = [];
    const schema = z.custom<undefined>((value) => {
      seen.push(value);
      return value === undefined;
    });

    const result = await client.call({ requestId: 'r-1', method: 'GET', path: '/items', schema });

    expect(result).toStrictEqual({ ok: true, status, data: undefined });
    expect(seen).toStrictEqual([undefined]);
  });
});

describe('uitgaande-client/AC-12: verwachte status via expect', () => {
  test('uitgaande-client/AC-12: een 404 zonder expect geeft UPSTREAM_INVALID', async () => {
    const partner = await partnerWith({ 'GET /items': { status: 404, json: { fout: 'weg' } } });
    const client = createOutboundClient(configFor(partner));

    const code = await upstreamCode(client.call({ requestId: 'r-1', method: 'GET', path: '/items', schema: item }));

    expect(code).toBe('UPSTREAM_INVALID');
  });

  test('uitgaande-client/AC-12: met expect [404] { ok: false, status: 404 } en de body afgebroken', async () => {
    const partner = await partnerWith({ 'GET /items': { status: 404, json: { fout: 'weg' } } });
    const client = createOutboundClient(configFor(partner));
    const cancel = cancelSpy();

    const result = await client.call({ requestId: 'r-1', method: 'GET', path: '/items', schema: item, expect: [404] });

    expect(result).toStrictEqual({ ok: false, status: 404 });
    expect(partner.calls('GET /items')).toBe(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test.each([[429], [500]])(
    'uitgaande-client/AC-12: expect [%i] geeft een OutboundUsageError zonder aanroep',
    async (status) => {
      const partner = await partnerWith({ 'GET /items': { status, json: {} } });
      const client = createOutboundClient(configFor(partner));
      const attempt = async () =>
        client.call({ requestId: 'r-1', method: 'GET', path: '/items', schema: item, expect: [status] });

      await expect(attempt()).rejects.toBeInstanceOf(OutboundUsageError);
      expect(partner.requests).toHaveLength(0);
    },
  );
});

describe('uitgaande-client/AC-13: antwoord boven maxResponseBytes', () => {
  const big = JSON.stringify({ id: 'x'.repeat(2000) });

  test.each([
    ['met Content-Length', { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(big)) }],
    ['zonder Content-Length', { 'content-type': 'application/json', 'transfer-encoding': 'chunked' }],
  ])('uitgaande-client/AC-13: %s geeft UPSTREAM_INVALID', async (_label, headers) => {
    const partner = await partnerWith({ 'GET /items': { status: 200, headers, body: big } });
    const client = createOutboundClient(configFor(partner, { maxResponseBytes: 100 }));

    const code = await upstreamCode(
      client.call({ requestId: 'r-1', method: 'GET', path: '/items', schema: z.object({ id: z.string() }) }),
    );

    expect(code).toBe('UPSTREAM_INVALID');
  });

  test('uitgaande-client/AC-13: een gzip-body onder de grens die gedecodeerd erboven uitkomt geeft UPSTREAM_INVALID', async () => {
    const decoded = JSON.stringify({ id: 'x'.repeat(5000) });
    const compressed = gzipSync(Buffer.from(decoded));
    const partner = await partnerWith({
      'GET /items': {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
          'content-length': String(compressed.byteLength),
        },
        body: compressed,
      },
    });
    const client = createOutboundClient(configFor(partner, { maxResponseBytes: 1000 }));

    const code = await upstreamCode(
      client.call({ requestId: 'r-1', method: 'GET', path: '/items', schema: z.object({ id: z.string() }) }),
    );

    expect(compressed.byteLength).toBeLessThan(1000);
    expect(code).toBe('UPSTREAM_INVALID');
  });

  test('uitgaande-client/AC-13: een HEAD met Content-Length 5000000 en geen body geeft het schema undefined', async () => {
    const partner = await partnerWith({
      'HEAD /items': { status: 200, headers: { 'content-type': 'application/json', 'content-length': '5000000' } },
    });
    const client = createOutboundClient(configFor(partner));
    const seen: unknown[] = [];
    const schema = z.custom<undefined>((value) => {
      seen.push(value);
      return value === undefined;
    });

    const result = await client.call({ requestId: 'r-1', method: 'HEAD', path: '/items', schema });

    expect(result).toStrictEqual({ ok: true, status: 200, data: undefined });
    expect(seen).toStrictEqual([undefined]);
    expect(partner.calls('HEAD /items')).toBe(1);
  });
});

describe('Retry-After-parser en backoff (spec uitgaande-client, Herhalen; randgevallen)', () => {
  test.each([
    ['Retry-After 0', '0'],
    ['een HTTP-datum in het verleden', new Date(Date.now() - 60_000).toUTCString()],
  ])('%s: wachttijd 0, de tweede poging volgt meteen', async (_label, retryAfter) => {
    const partner = await partnerWith({
      'GET /items': [
        { status: 429, headers: { 'retry-after': retryAfter } },
        { status: 200, json: { id: 'i-1' } },
      ],
    });
    const client = createOutboundClient(configFor(partner));
    const started = performance.now();

    const result = await client.call({ requestId: 'r-1', method: 'GET', path: '/items', schema: item });

    expect(result).toStrictEqual({ ok: true, status: 200, data: { id: 'i-1' } });
    expect(partner.calls('GET /items')).toBe(2);
    expect(performance.now() - started).toBeLessThan(500);
  });

  test('jitter: drie pogingen op 503 wachten samen hooguit 200 + 400 ms (backoff 200 × 2^(n−1))', async () => {
    const partner = await partnerWith({ 'GET /items': { status: 503 } });
    const client = createOutboundClient(configFor(partner, { maxAttempts: 3 }));
    const started = performance.now();

    const code = await upstreamCode(client.call({ requestId: 'r-1', method: 'GET', path: '/items', schema: item }));

    expect(code).toBe('UPSTREAM_UNAVAILABLE');
    expect(partner.calls('GET /items')).toBe(3);
    expect(performance.now() - started).toBeLessThan(1200);
  });

  test('randgeval: een 504 van de partner zelf is UPSTREAM_UNAVAILABLE, geen eigen time-out', async () => {
    const partner = await partnerWith({ 'GET /items': { status: 504 } });
    const client = createOutboundClient(configFor(partner, { maxAttempts: 1 }));

    const code = await upstreamCode(client.call({ requestId: 'r-1', method: 'GET', path: '/items', schema: item }));

    expect(code).toBe('UPSTREAM_UNAVAILABLE');
  });
});
