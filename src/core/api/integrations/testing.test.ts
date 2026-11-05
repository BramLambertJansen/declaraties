import { beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '../errors.ts';
import { OutboundUsageError } from '../outbound/index.ts';
import type * as OutboundTesting from '../outbound/testing.ts';
import { startFakePartner, type FakePartner, type FakeResponse } from '../outbound/testing.ts';
import {
  registerIntegrations,
  type Adapter,
  type IntegrationClientConfig,
  type Integrations,
  type SwitchReading,
} from './index.ts';
import {
  ContractError,
  contractCases,
  contractTarget,
  describeContract,
  type ContractCase,
  type ContractDef,
} from './testing.ts';

// Spec koppelingsvorm, AC-5 t/m AC-11: de contracttestfabriek met de fictieve koppeling `proefpartner` (poort, adapter en
// schema alleen in dit bestand). "Aanroep" telt de nep-partner. Elke nep-partner die de fabriek start, komt via de spion
// hieronder in `started`, zodat de test de teller van elk geval kan lezen (ook na `close`).

const spy = vi.hoisted(() => ({ started: new Array<FakePartner>() }));
vi.mock('../outbound/testing.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof OutboundTesting>();
  return {
    ...actual,
    startFakePartner: async (routes: OutboundTesting.FakeRoutes): Promise<FakePartner> => {
      const partner = await actual.startFakePartner(routes);
      spy.started.push(partner);
      return partner;
    },
  };
});

const GENERIC = [
  'geslaagd',
  'extra veld',
  'uitgezet',
  'time-out',
  'niet bereikbaar',
  'tijdelijk niet beschikbaar',
  'serverfout',
  'geen JSON',
  'ongeldig antwoord',
] as const;

const TRAITS = {
  auth: 'none',
  direction: ['read'],
  cadence: ['on-demand'],
  sensitivity: 'normal',
  cost: 'free',
  source: 'partner',
} as const;

// --- De proefpartner: poort, schema en adapter (vorm uit de spec, Vaste vorm). ---

interface ProefItem {
  readonly id: string;
  readonly naam: string;
}

interface ProefpartnerPort {
  // null bij een onbekend item (404 via expect, randgeval "Adapter gebruikt expect: [404]").
  readonly item: (id: string) => Promise<ProefItem | null>;
}

const itemSchema = z.object({ id: z.string(), naam: z.string() });

// Afwijkingen voor de foute adapters uit AC-6 en AC-11; zonder afwijking de juiste adapter.
interface Variant {
  readonly strict?: true;
  readonly swallow?: true;
  readonly fixedRequestId?: true;
  readonly twice?: true;
  readonly reading?: (real: SwitchReading) => SwitchReading;
}

// De requestId's die de adapter kreeg, per geval één (AC-5).
const seen = { requestIds: new Array<string>() };

function proefAdapter(variant: Variant = {}): Adapter<ProefpartnerPort> {
  return (client) => (call) => {
    const fetchItem = async (id: string): Promise<ProefItem | null> => {
      const reading = variant.reading?.(call.reading) ?? call.reading;
      const result = await client.call(reading, {
        requestId: variant.fixedRequestId === true ? 'vaste-request-id' : call.requestId,
        method: 'GET',
        path: '/items/:id',
        params: { id },
        schema: variant.strict === true ? itemSchema.strict() : itemSchema,
        expect: [404],
      });
      if (!result.ok) return null;
      return { id: result.data.id, naam: result.data.naam };
    };
    return {
      item: async (id) => {
        seen.requestIds.push(call.requestId);
        if (variant.twice === true) await fetchItem(id);
        if (variant.swallow !== true) return fetchItem(id);
        try {
          return await fetchItem(id);
        } catch (error) {
          if (error instanceof AppError) return { id, naam: 'standaard' };
          throw error;
        }
      },
    };
  };
}

const OK: FakeResponse = { status: 200, json: { id: 'i-1', naam: 'Proef' } };

interface ContractOptions {
  readonly adapter?: Adapter<ProefpartnerPort>;
  readonly integrations?: Integrations;
  readonly name?: string;
  readonly ok?: FakeResponse;
  readonly live?: () => IntegrationClientConfig;
}

// Het register van de "app": de proefpartner met een fictieve host; de fabriek maakt in fake-modus zelf een register.
const appIntegrations = registerIntegrations([
  { name: 'proefpartner', hosts: ['api.proefpartner.test'], traits: TRAITS },
]);

function proefContract(options: ContractOptions = {}): ContractDef<ProefpartnerPort> {
  return {
    integrations: options.integrations ?? appIntegrations,
    name: options.name ?? 'proefpartner',
    adapter: options.adapter ?? proefAdapter(),
    probe: { route: 'GET /items/i-1', ok: options.ok ?? OK, run: (port) => port.item('i-1') },
    live:
      options.live ??
      ((): IntegrationClientConfig => {
        throw new Error('test: live() hoort in fake-modus niet aangeroepen te worden');
      }),
  };
}

// Eigen gevallen van de proefpartner (AC-5, AC-7, AC-9).
const unknownItem: ContractCase<ProefpartnerPort> = {
  name: 'onbekend item geeft null',
  fake: { 'GET /items/i-9': { status: 404 } },
  run: async (port, partner) => {
    expect(await port.item('i-9')).toBeNull();
    if (partner !== null)
      expect(partner.requests.map((r) => `${r.method} ${r.path}`)).toStrictEqual(['GET /items/i-9']);
  },
  live: true,
};

const namedItem: ContractCase<ProefpartnerPort> = {
  name: 'item met naam, onbekend veld gestript',
  fake: { 'GET /items/i-2': { status: 200, json: { id: 'i-2', naam: 'Twee', onbekend: 'x' } } },
  run: async (port) => {
    expect(await port.item('i-2')).toStrictEqual({ id: 'i-2', naam: 'Twee' });
  },
};

const OWN = [unknownItem, namedItem] as const;

// De vorm die contractCases volgens de spec teruggeeft.
type Built = readonly { readonly name: string; readonly run: () => Promise<void> }[];

function caseNamed(list: Built, name: string): Built[number] {
  const found = list.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`test: geval ${JSON.stringify(name)} ontbreekt in contractCases`);
  return found;
}

// De fout van een afgewezen aanroep (null als hij slaagt).
async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (reason: unknown) => reason,
  );
}

// Draait één geval en geeft de nep-partners die de fabriek daarvoor startte.
async function runCase(list: Built, name: string): Promise<{ error: unknown; partners: FakePartner[] }> {
  spy.started.length = 0;
  const error = await failure(caseNamed(list, name).run());
  return { error, partners: [...spy.started] };
}

beforeEach(() => {
  spy.started.length = 0;
  seen.requestIds.length = 0;
});

// Testplan: één describeContract-aanroep voor de juiste proefpartner bewijst dat de suite zich registreert.
describeContract(proefContract(), OWN);

describe('koppelingsvorm/AC-5: de juiste proefpartner slaagt in fake-modus', () => {
  test('koppelingsvorm/AC-5: de casenamen zijn de negen generieke plus de eigen', () => {
    const names = contractCases(proefContract(), OWN, 'fake').map((entry) => entry.name);

    expect([...names].sort()).toStrictEqual([...GENERIC, ...OWN.map((own) => own.name)].sort());
  });

  test('koppelingsvorm/AC-5: alle generieke en eigen gevallen slagen, elk met een eigen nep-partner', async () => {
    const list = contractCases(proefContract(), OWN, 'fake');

    for (const entry of list) {
      const { error, partners } = await runCase(list, entry.name);
      expect(error, entry.name).toBeNull();
      expect(partners, entry.name).toHaveLength(1);
    }
  });

  test('koppelingsvorm/AC-5: "geslaagd" telt 1 aanroep, "uitgezet" 0', async () => {
    const list = contractCases(proefContract(), OWN, 'fake');

    const ok = await runCase(list, 'geslaagd');
    const off = await runCase(list, 'uitgezet');

    expect(ok.error).toBeNull();
    expect(ok.partners.map((partner) => partner.requests.length)).toStrictEqual([1]);
    expect(off.error).toBeNull();
    expect(off.partners.map((partner) => partner.requests.length)).toStrictEqual([0]);
  });

  test('koppelingsvorm/AC-5: twee gevallen hebben nooit dezelfde requestId (contract-<n>-<willekeurig>)', async () => {
    for (let round = 0; round < 2; round += 1) {
      const list = contractCases(proefContract(), OWN, 'fake');
      for (const entry of list) await entry.run();
    }

    expect(seen.requestIds.length).toBeGreaterThanOrEqual(2 * (GENERIC.length + OWN.length));
    expect(new Set(seen.requestIds).size).toBe(seen.requestIds.length);
    for (const requestId of seen.requestIds) expect(requestId).toMatch(/^contract-\d+-\S+$/);
  });
});

describe('koppelingsvorm/AC-6: een foute adapter laat het genoemde geval falen met ContractError', () => {
  test('koppelingsvorm/AC-6 (a): schema met .strict() faalt op "extra veld"; "geslaagd" slaagt', async () => {
    const list = contractCases(proefContract({ adapter: proefAdapter({ strict: true }) }), [], 'fake');

    expect((await runCase(list, 'extra veld')).error).toBeInstanceOf(ContractError);
    expect((await runCase(list, 'geslaagd')).error).toBeNull();
  });

  test.each(GENERIC.filter((name) => name !== 'geslaagd' && name !== 'extra veld'))(
    'koppelingsvorm/AC-6 (b): adapter die elke AppError afvangt faalt op "%s"; geen partnerbody in de melding',
    async (name) => {
      const list = contractCases(proefContract({ adapter: proefAdapter({ swallow: true }) }), [], 'fake');

      const { error } = await runCase(list, name);

      expect(error).toBeInstanceOf(ContractError);
      expect(error instanceof Error ? error.message : '').toContain(name);
      expect(error instanceof Error ? error.message : 'partner-geheim').not.toContain('partner-geheim');
      expect(JSON.stringify(error)).not.toContain('partner-geheim');
    },
  );

  test('koppelingsvorm/AC-6 (b): met de afvangende adapter slaagt "geslaagd"', async () => {
    const list = contractCases(proefContract({ adapter: proefAdapter({ swallow: true }) }), [], 'fake');

    expect((await runCase(list, 'geslaagd')).error).toBeNull();
  });

  test('koppelingsvorm/AC-6 (c): een vaste requestId faalt op "geslaagd"', async () => {
    const list = contractCases(proefContract({ adapter: proefAdapter({ fixedRequestId: true }) }), [], 'fake');

    expect((await runCase(list, 'geslaagd')).error).toBeInstanceOf(ContractError);
  });

  test('koppelingsvorm/AC-6 (d): twee aanroepen van de client falen op "geslaagd"', async () => {
    const list = contractCases(proefContract({ adapter: proefAdapter({ twice: true }) }), [], 'fake');

    const { error, partners } = await runCase(list, 'geslaagd');

    expect(error).toBeInstanceOf(ContractError);
    expect(partners.map((partner) => partner.requests.length)).toStrictEqual([2]);
  });
});

describe('koppelingsvorm/AC-7: eigen gevallen', () => {
  test('koppelingsvorm/AC-7: een mislukte expect in een eigen geval laat run afwijzen met die fout', async () => {
    const thrown: unknown[] = [];
    const wrong: ContractCase<ProefpartnerPort> = {
      name: 'verkeerde verwachting',
      fake: { 'GET /items/i-1': OK },
      run: async (port) => {
        const item = await port.item('i-1');
        try {
          expect(item).toStrictEqual({ id: 'i-1', naam: 'Anders' });
        } catch (error) {
          thrown.push(error);
          throw error;
        }
      },
    };
    const list = contractCases(proefContract(), [wrong], 'fake');

    const { error } = await runCase(list, 'verkeerde verwachting');

    expect(thrown).toHaveLength(1);
    expect(error).toBe(thrown[0]);
  });

  test('koppelingsvorm/AC-7: een eigen geval krijgt de nep-partner en ziet de verzoeken van de adapter', async () => {
    const given: (FakePartner | null)[] = [];
    const watch: ContractCase<ProefpartnerPort> = {
      name: 'ziet de verzoeken',
      fake: { 'GET /items/i-3': { status: 200, json: { id: 'i-3', naam: 'Drie' } } },
      run: async (port, partner) => {
        given.push(partner);
        expect(await port.item('i-3')).toStrictEqual({ id: 'i-3', naam: 'Drie' });
        expect(partner?.requests.map((r) => `${r.method} ${r.path}`)).toStrictEqual(['GET /items/i-3']);
      },
    };
    const list = contractCases(proefContract(), [watch], 'fake');

    const { error, partners } = await runCase(list, 'ziet de verzoeken');

    expect(error).toBeNull();
    expect(partners).toHaveLength(1);
    expect(given).toStrictEqual([partners[0]]);
  });
});

describe('koppelingsvorm/AC-8: contractTarget kiest het doel', () => {
  test.each([
    ['niet gezet', {}, 'fake'],
    ['leeg', { CONTRACT_LIVE: '' }, 'fake'],
    ['leeg, CI gezet', { CONTRACT_LIVE: '', CI: 'true' }, 'fake'],
    ['gelijk aan de naam, CI niet gezet', { CONTRACT_LIVE: 'proefpartner' }, 'live'],
    ['gelijk aan de naam, CI leeg', { CONTRACT_LIVE: 'proefpartner', CI: '' }, 'live'],
    ['andere geldige naam', { CONTRACT_LIVE: 'andere-partner' }, 'fake'],
  ] as const)('koppelingsvorm/AC-8: CONTRACT_LIVE %s geeft %s', (_label, vars, target) => {
    expect(contractTarget('proefpartner', vars)).toBe(target);
  });

  test.each([
    ['buiten het naampatroon', { CONTRACT_LIVE: 'Proef!' }],
    ['gelijk aan de naam met CI', { CONTRACT_LIVE: 'proefpartner', CI: 'true' }],
    ['andere naam met CI', { CONTRACT_LIVE: 'andere-partner', CI: '1' }],
  ] as const)('koppelingsvorm/AC-8: CONTRACT_LIVE %s geeft ContractError', (_label, vars) => {
    expect(() => contractTarget('proefpartner', vars)).toThrow(ContractError);
  });

  test('koppelingsvorm/AC-8: met CI noemt de melding dat de handmatige run nooit in CI draait', () => {
    expect(() => contractTarget('proefpartner', { CONTRACT_LIVE: 'proefpartner', CI: 'true' })).toThrow(
      'handmatige run nooit in CI',
    );
  });
});

describe('koppelingsvorm/AC-9: live-modus', () => {
  // De testomgeving van de partner is hier een tweede nep-partner op 127.0.0.1, in een register met die host.
  const liveIntegrations = registerIntegrations([{ name: 'proefpartner', hosts: ['127.0.0.1'], traits: TRAITS }]);

  async function startSecond(): Promise<FakePartner> {
    const second = await startFakePartner({
      'GET /items/i-1': OK,
      'GET /items/i-2': { status: 200, json: { id: 'i-2', naam: 'Twee' } },
      'GET /items/i-9': { status: 404 },
    });
    spy.started.length = 0;
    return second;
  }

  function liveConfig(second: FakePartner, appEnv: IntegrationClientConfig['appEnv']): IntegrationClientConfig {
    return { baseUrl: second.url, appEnv, timeoutMs: 250, maxAttempts: 1, log: () => undefined };
  }

  test('koppelingsvorm/AC-9: alleen gevallen met live: true draaien, tegen de tweede partner, met partner null', async () => {
    const second = await startSecond();
    const given: (FakePartner | null)[] = [];
    const liveCase: ContractCase<ProefpartnerPort> = {
      ...unknownItem,
      run: async (port, partner) => {
        given.push(partner);
        await unknownItem.run(port, partner);
      },
    };
    try {
      const contract = proefContract({ integrations: liveIntegrations, live: () => liveConfig(second, 'test') });
      const list = contractCases(contract, [liveCase, namedItem], 'live');

      expect(list.map((entry) => entry.name)).toStrictEqual([`live: ${liveCase.name}`]);
      for (const entry of list) await entry.run();

      expect(given).toStrictEqual([null]);
      expect(second.requests.map((r) => `${r.method} ${r.path}`)).toStrictEqual(['GET /items/i-9']);
      expect(spy.started).toHaveLength(0);
    } finally {
      await second.close();
    }
  });

  test.each(['local', 'staging', 'production'] as const)(
    'koppelingsvorm/AC-9: live() met appEnv %s geeft ContractError vóór elke aanroep',
    async (appEnv) => {
      const second = await startSecond();
      try {
        const contract = proefContract({ integrations: liveIntegrations, live: () => liveConfig(second, appEnv) });

        expect(() => contractCases(contract, OWN, 'live')).toThrow(ContractError);
        expect(second.requests).toHaveLength(0);
      } finally {
        await second.close();
      }
    },
  );

  test('koppelingsvorm/AC-9: zonder geval met live: true geeft live-modus ContractError vóór elke aanroep', async () => {
    const second = await startSecond();
    try {
      const contract = proefContract({ integrations: liveIntegrations, live: () => liveConfig(second, 'test') });

      expect(() => contractCases(contract, [namedItem], 'live')).toThrow(ContractError);
      expect(second.requests).toHaveLength(0);
    } finally {
      await second.close();
    }
  });

  test('koppelingsvorm/AC-9: in fake-modus wordt live() niet aangeroepen', async () => {
    const second = await startSecond();
    const live = vi.fn((): IntegrationClientConfig => liveConfig(second, 'test'));
    try {
      const list = contractCases(proefContract({ live }), OWN, 'fake');
      for (const entry of list) await entry.run();

      expect(live).toHaveBeenCalledTimes(0);
      expect(second.requests).toHaveLength(0);
    } finally {
      await second.close();
    }
  });
});

describe('koppelingsvorm/AC-10: opbouwfouten geven ContractError vóór elke aanroep', () => {
  const duplicate: ContractCase<ProefpartnerPort> = { ...namedItem };
  const genericName: ContractCase<ProefpartnerPort> = { ...namedItem, name: 'geslaagd' };

  test.each([
    ['een naam die niet in integrations staat', proefContract({ name: 'onbekende-partner' }), OWN],
    ['probe.ok met status 404', proefContract({ ok: { status: 404, json: { id: 'i-1', naam: 'Proef' } } }), OWN],
    ['probe.ok.json is een tekst', proefContract({ ok: { status: 200, json: 'tekst' } }), OWN],
    ['probe.ok.json is een lege lijst', proefContract({ ok: { status: 200, json: [] } }), OWN],
    ['probe.ok.json is een lijst met een tekst', proefContract({ ok: { status: 200, json: ['tekst'] } }), OWN],
    ['een eigen geval met de naam van een generiek geval', proefContract(), [genericName]],
    ['een dubbele casenaam', proefContract(), [namedItem, duplicate]],
  ] as const)('koppelingsvorm/AC-10: %s', (_label, contract, cases) => {
    expect(() => contractCases(contract, cases, 'fake')).toThrow(ContractError);
    expect(spy.started).toHaveLength(0);
  });
});

describe('koppelingsvorm/AC-11: de testlezing', () => {
  // Een eigen geval dat port.item('i-1') aanroept en de uitkomst teruggeeft aan de test.
  function probeCase(outcome: unknown[]): ContractCase<ProefpartnerPort> {
    return {
      name: 'lezing',
      fake: { 'GET /items/i-1': OK },
      run: async (port) => {
        outcome.push(await failure(port.item('i-1')));
      },
    };
  }

  test('koppelingsvorm/AC-11: IntegrationClient.call aanvaardt de testlezing uit testing.ts', async () => {
    const outcome: unknown[] = [];
    const list = contractCases(proefContract(), [probeCase(outcome)], 'fake');

    const { error, partners } = await runCase(list, 'lezing');

    expect(error).toBeNull();
    expect(outcome).toStrictEqual([null]);
    expect(partners.map((partner) => partner.requests.length)).toStrictEqual([1]);
  });

  test.each([
    ['een kopie', (real: SwitchReading): SwitchReading => ({ ...real })],
    [
      'een nagemaakt object',
      (real: SwitchReading): SwitchReading => ({ name: real.name, enabled: true, readAt: performance.now() }),
    ],
  ] as const)(
    'koppelingsvorm/AC-11: %s van de testlezing geeft OutboundUsageError, 0 aanroepen',
    async (_label, forge) => {
      const outcome: unknown[] = [];
      const list = contractCases(
        proefContract({ adapter: proefAdapter({ reading: forge }) }),
        [probeCase(outcome)],
        'fake',
      );

      await runCase(list, 'lezing');

      expect(outcome).toHaveLength(1);
      expect(outcome[0]).toBeInstanceOf(OutboundUsageError);
      expect(spy.started.map((partner) => partner.requests.length)).toStrictEqual([0]);
    },
  );
});
