import { describe, expect, test } from 'vitest';
import { createOutboundClient } from './create.ts';
import { OutboundConfigError, type OutboundConfig } from './index.ts';

// Spec uitgaande-client AC-8: opstartfouten. Geen netwerk: createOutboundClient controleert alleen de configuratie.
// Harde grenzen uit de spec: timeoutMs 10 000, budgetMs 20 000, maxAttempts 5.

const valid: OutboundConfig = {
  name: 'partner',
  baseUrl: 'https://api.partner.nl/v1',
  hosts: ['api.partner.nl'],
  appEnv: 'production',
  log: () => undefined,
};

const create = (change: Partial<OutboundConfig>) => () => createOutboundClient({ ...valid, ...change });

describe('uitgaande-client/AC-8: opstartfouten geven een OutboundConfigError', () => {
  test('uitgaande-client/AC-8: een geldige configuratie maakt een client', () => {
    expect(createOutboundClient(valid)).toHaveProperty('call');
  });

  test('uitgaande-client/AC-8: de host van baseUrl staat niet in hosts', () => {
    expect(create({ hosts: ['andere.partner.nl'] })).toThrow(OutboundConfigError);
  });

  test.each([['*.partner.nl'], ['*'], ['api.partner.nl:443'], ['https://api.partner.nl']])(
    'uitgaande-client/AC-8: hosts met %s',
    (host) => {
      expect(create({ hosts: [host] })).toThrow(OutboundConfigError);
    },
  );

  test('uitgaande-client/AC-8: lege hosts', () => {
    expect(create({ hosts: [] })).toThrow(OutboundConfigError);
  });

  test.each([['Partner'], ['1partner'], ['par_tner'], [''], ['partner nl']])(
    'uitgaande-client/AC-8: ongeldige name %j',
    (name) => {
      expect(create({ name })).toThrow(OutboundConfigError);
    },
  );

  test.each([
    ['Host'],
    ['Idempotency-Key'],
    ['idempotency-key'],
    ['host'],
    ['Content-Type'],
    ['Content-Length'],
    ['Connection'],
    ['Transfer-Encoding'],
    ['Proxy-Authorization'],
  ])('uitgaande-client/AC-8: header %s in headers', (header) => {
    expect(create({ headers: { [header]: 'x' } })).toThrow(OutboundConfigError);
  });

  test.each([
    ['staging', 'http://api.partner.nl/v1', 'api.partner.nl'],
    ['production', 'http://api.partner.nl/v1', 'api.partner.nl'],
    ['staging', 'https://127.0.0.1/v1', '127.0.0.1'],
    ['production', 'https://127.0.0.1/v1', '127.0.0.1'],
    ['staging', 'https://localhost/v1', 'localhost'],
    ['production', 'https://localhost/v1', 'localhost'],
    ['production', 'https://localhost./v1', 'localhost.'],
  ] as const)('uitgaande-client/AC-8: met appEnv %s is %s niet toegestaan', (appEnv, baseUrl, host) => {
    expect(create({ appEnv, baseUrl, hosts: [host] })).toThrow(OutboundConfigError);
  });

  test.each([
    ['local', 'http://127.0.0.1:8080/v1'],
    ['test', 'http://127.0.0.1:8080/v1'],
    ['local', 'http://api.partner.nl/v1'],
    ['test', 'http://api.partner.nl/v1'],
  ] as const)('uitgaande-client/AC-8: met appEnv %s mag %s', (appEnv, baseUrl) => {
    const hosts = [new URL(baseUrl).hostname];

    expect(createOutboundClient({ ...valid, appEnv, baseUrl, hosts })).toHaveProperty('call');
  });

  test.each([
    ['timeoutMs boven de harde grens', { timeoutMs: 10_001 }],
    ['budgetMs boven de harde grens', { budgetMs: 20_001 }],
    ['maxAttempts boven de harde grens', { maxAttempts: 6 }],
    ['timeoutMs 0', { timeoutMs: 0 }],
    ['budgetMs 0', { budgetMs: 0 }],
    ['maxAttempts 0', { maxAttempts: 0 }],
    ['maxResponseBytes 0', { maxResponseBytes: 0 }],
    ['timeoutMs > budgetMs', { timeoutMs: 5000, budgetMs: 4000 }],
  ])('uitgaande-client/AC-8: %s', (_label, limits) => {
    expect(create(limits)).toThrow(OutboundConfigError);
  });

  test('uitgaande-client/AC-8: grenzen op de harde grens zelf zijn toegestaan', () => {
    expect(create({ timeoutMs: 10_000, budgetMs: 20_000, maxAttempts: 5 })).not.toThrow();
  });
});
