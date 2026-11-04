import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { createOutboundClient, OutboundUsageError, type OutboundRequest } from './index.ts';
import { startFakePartner, type FakePartner } from './testing.ts';

// Spec uitgaande-client AC-10: de URL wordt uit sjabloon en parameters gebouwd; een verkeerde aanroep gaat niet het net op
// en de melding noemt nooit een parameterwaarde. Netwerk alleen tegen de lokale nep-partner (R-UIT-07).

const partners: FakePartner[] = [];
afterEach(async () => {
  await Promise.all(partners.splice(0).map(async (partner) => partner.close()));
});

async function clientFor(routes: Parameters<typeof startFakePartner>[0]) {
  const partner = await startFakePartner(routes);
  partners.push(partner);
  const client = createOutboundClient({
    name: 'partner',
    baseUrl: `${partner.url}/api`,
    hosts: ['127.0.0.1'],
    appEnv: 'test',
    log: () => undefined,
  });
  return { partner, client };
}

const item = z.object({ id: z.string() }).strict();
type Request = OutboundRequest<typeof item, never>;
const base: Request = { requestId: 'r-1', method: 'GET', path: '/items/:id', params: { id: 'i-1' }, schema: item };
const withoutParams: Request = { requestId: 'r-1', method: 'GET', path: '/items/:id', schema: item };

describe('uitgaande-client/AC-10: parameters worden gecodeerd', () => {
  test('uitgaande-client/AC-10: parameter a/b?c komt aan als /items/a%2Fb%3Fc', async () => {
    const { partner, client } = await clientFor({ 'GET /api/items/a%2Fb%3Fc': { status: 200, json: { id: 'ok' } } });

    const result = await client.call({ ...base, params: { id: 'a/b?c' } });

    expect(result).toStrictEqual({ ok: true, status: 200, data: { id: 'ok' } });
    expect(partner.requests.map((request) => request.path)).toStrictEqual(['/api/items/a%2Fb%3Fc']);
  });

  test('uitgaande-client/AC-10: query gaat via URLSearchParams', async () => {
    const { partner, client } = await clientFor({ 'GET /api/items/i-1': { status: 200, json: { id: 'ok' } } });

    await client.call({ ...base, query: { q: 'a&b=c', n: 2, vlag: true } });

    expect(partner.requests.map((request) => request.path)).toStrictEqual(['/api/items/i-1?q=a%26b%3Dc&n=2&vlag=true']);
  });
});

describe('uitgaande-client/AC-10: een verkeerde aanroep geeft een OutboundUsageError zonder aanroep', () => {
  const secret = 'p-waarde-geheim';

  test('uitgaande-client/AC-10: geen params bij een :naam in het sjabloon', async () => {
    const { partner, client } = await clientFor({});
    const attempt = async () => client.call(withoutParams);

    await expect(attempt()).rejects.toBeInstanceOf(OutboundUsageError);
    expect(partner.requests).toHaveLength(0);
  });

  test.each<[string, Partial<Request>]>([
    ['parameter ..', { params: { id: '..' } }],
    ['parameter .', { params: { id: '.' } }],
    ['lege parameter', { params: { id: '' } }],
    ['sjabloon met ?', { path: '/items/:id?x=1' }],
    ['sjabloon met #', { path: '/items/:id#x' }],
    ['sjabloon met //', { path: '//items/:id' }],
    ['sjabloon met ..-segment', { path: '/items/../:id' }],
    ['sjabloon zonder begin-/', { path: 'items/:id' }],
    ['een volledige URL als sjabloon', { path: 'https://evil.example/items/:id' }],
    ['een ontbrekende parameter', { params: {} }],
    ['een extra parameter', { params: { id: 'i-1', extra: secret } }],
    ['een body bij GET', { body: { x: 1 } }],
    ['een body bij HEAD', { method: 'HEAD', body: { x: 1 } }],
    ['een body bij DELETE', { method: 'DELETE', body: { x: 1 } }],
    ['een sleutel met een spatie', { idempotencyKey: `sleutel ${secret}` }],
    ['een lege sleutel', { idempotencyKey: '' }],
    ['een te lange sleutel', { idempotencyKey: 'k'.repeat(201) }],
  ])('uitgaande-client/AC-10: %s', async (_label, change) => {
    const { partner, client } = await clientFor({});
    const attempt = async () => client.call({ ...base, ...change });

    await expect(attempt()).rejects.toBeInstanceOf(OutboundUsageError);
    expect(partner.requests).toHaveLength(0);
  });

  test.each<[string, Partial<Request>]>([
    ['een extra parameter', { params: { id: 'i-1', extra: secret } }],
    ['een ontbrekende parameter naast een andere waarde', { path: '/items/:id/:sub', params: { id: secret } }],
    ['een sleutel met een spatie', { idempotencyKey: `sleutel ${secret}` }],
    ['een parameter .. naast een geheime query', { params: { id: '..' }, query: { token: secret } }],
  ])('uitgaande-client/AC-10: de melding bij %s noemt de waarde niet', async (_label, change) => {
    const { partner, client } = await clientFor({});

    const attempt = async () => client.call({ ...base, ...change });
    const error = await attempt().then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(OutboundUsageError);
    expect(String(error)).not.toContain('geheim');
    expect(partner.requests).toHaveLength(0);
  });
});
