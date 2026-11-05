import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { defineAuditActions } from '../../shared/audit.ts';
import { definePermissions } from '../../shared/can.ts';
import { createContracts } from '../../shared/contract.ts';
import type { RateLimitCategory } from '../../shared/limits.ts';
import { registerIntegrations, type Integrations } from '../integrations/index.ts';
import { createRouteKit } from '../route/kit.ts';
import { createApp } from './create-app.ts';

// Spec partnerstap AC-5: de opstartcontroles van createApp voor een route met partnerstap (definePartnerRoute). Alleen
// opstart: createApp gooit al bij het aanmaken, dus er is geen auth, withUser of database nodig. De volgorde per verzoek
// bewijst test/integrations/partner-step.int.test.ts tegen de echte database.

const TRAITS = {
  auth: 'none',
  direction: ['read'],
  cadence: ['on-demand'],
  sensitivity: 'normal',
  cost: 'free',
  source: 'partner',
} as const;

const INTEGRATION = 'partner-opstart';
const integrations: Integrations = registerIntegrations([{ name: INTEGRATION, hosts: ['127.0.0.1'], traits: TRAITS }]);

const permissions = definePermissions({ 'partner:read': { roles: ['admin'] } });
const { defineContract } = createContracts(permissions);
const { defineRoute, definePartnerRoute } = createRouteKit({ permissions, audit: defineAuditActions({}) });

const PATH = '/partnerstap/opstart';
const output = z.object({ id: z.string() }).strict();

function contractWith(rateLimit: RateLimitCategory | null) {
  const base = {
    method: 'POST',
    path: PATH,
    input: z.object({}).strict(),
    output,
    permission: 'partner:read',
  } as const;
  return defineContract(rateLimit === null ? base : { ...base, rateLimit });
}

function partnerRoute(rateLimit: RateLimitCategory | null, integration = INTEGRATION) {
  return definePartnerRoute(
    contractWith(rateLimit),
    {
      integration,
      call: () => Promise.resolve({ id: 'p-1' }),
    },
    ({ partner }) => ({ id: partner.id }),
  );
}

describe('partnerstap/AC-5: opstartcontroles van createApp', () => {
  test.each([
    ['zonder rateLimit (POST, dus schrijven)', null],
    ["met rateLimit: 'lezen'", 'lezen'],
    ["met rateLimit: 'schrijven'", 'schrijven'],
  ] as const)(
    "partnerstap/AC-5: een route met partnerstap %s: createApp gooit met methode, pad en rateLimit: 'duur'",
    (_, rateLimit) => {
      const start = () => createApp({ routes: [partnerRoute(rateLimit)], integrations });

      expect(start).toThrow(PATH);
      expect(start).toThrow('POST');
      expect(start).toThrow("rateLimit: 'duur'");
    },
  );

  test("partnerstap/AC-5: met rateLimit: 'duur' en een geregistreerde koppeling start createApp", () => {
    expect(() => createApp({ routes: [partnerRoute('duur')], integrations })).not.toThrow();
  });

  test('partnerstap/AC-5: een koppeling die niet in het register staat geeft een opstartfout met methode en pad', () => {
    const start = () => createApp({ routes: [partnerRoute('duur', 'partner-onbekend')], integrations });

    expect(start).toThrow(PATH);
    expect(start).toThrow('POST');
  });

  test('partnerstap/AC-5: zonder integrations geeft een route met partnerstap een opstartfout met methode en pad', () => {
    const start = () => createApp({ routes: [partnerRoute('duur')] });

    expect(start).toThrow(PATH);
    expect(start).toThrow('POST');
  });

  test('partnerstap/AC-5: een gewone route uit defineRoute zonder rateLimit start zoals nu, ook zonder integrations', () => {
    const plain = defineRoute(contractWith(null), () => ({ id: 'gewoon' }));

    expect(() => createApp({ routes: [plain] })).not.toThrow();
  });
});
