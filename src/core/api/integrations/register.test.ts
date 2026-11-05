import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { INTEGRATION_NAME_MAX_LENGTH, INTEGRATION_SWITCH_MAX_AGE_MS } from '../../shared/limits.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import { IntegrationConfigError, integrationTraitCatalog, registerIntegrations, type IntegrationDef } from './index.ts';

// Spec koppelingsregister, Opstart (AC-1): registerIntegrations gooit IntegrationConfigError bij een register dat niet
// klopt; de melding noemt de naam en de regel. Ook client() met een onbekende naam. Geen netwerk en geen database.

type Traits = IntegrationDef['traits'];

const TRAITS: Traits = {
  auth: 'none',
  direction: ['read'],
  cadence: ['on-demand'],
  sensitivity: 'normal',
  cost: 'free',
  source: 'partner',
};

const def = (name: string, extra: Partial<IntegrationDef> = {}): IntegrationDef => ({
  name,
  hosts: ['partner.example'],
  traits: TRAITS,
  ...extra,
});

// Een definitie met kenmerken buiten het type (ontbrekend, onbekend of een waarde zonder bouwsteen).
const withTraits = (name: string, traits: Record<string, unknown>): IntegrationDef =>
  def(name, { traits: unsafeCast<Traits>(traits, 'test: kenmerken buiten het type') });

// De fout van registerIntegrations; null als hij niet gooit.
function configError(list: readonly IntegrationDef[]): unknown {
  try {
    registerIntegrations(list);
    return null;
  } catch (error) {
    return error;
  }
}

function expectConfigError(list: readonly IntegrationDef[], ...mentions: string[]): void {
  const error = configError(list);
  expect(error).toBeInstanceOf(IntegrationConfigError);
  const message = error instanceof Error ? error.message : '';
  for (const mention of mentions) expect(message).toContain(mention);
}

describe('koppelingsregister/AC-1: een register dat niet klopt geeft IntegrationConfigError', () => {
  test('koppelingsregister/AC-1: een geldig register, en een leeg register, gooien niet', () => {
    expect(() => registerIntegrations([])).not.toThrow();
    expect(() => registerIntegrations([def('betaal-partner'), def('kaart2')])).not.toThrow();
  });

  test('koppelingsregister/AC-1: een dubbele naam; de melding noemt de naam', () => {
    expectConfigError([def('dubbel'), def('dubbel', { hosts: ['ander.example'] })], 'dubbel');
  });

  test.each([
    ['een hoofdletter', 'A'],
    ['een liggend streepje', 'a_b'],
    ['een cijfer vooraan', '1partner'],
    ['een streepje vooraan', '-partner'],
    ['een punt', 'partner.nl'],
    ['een lege naam', ''],
  ])('koppelingsregister/AC-1: een naam met %s (%j)', (_label, name) => {
    expectConfigError([def(name)]);
  });

  test('koppelingsregister/AC-1: een naam langer dan INTEGRATION_NAME_MAX_LENGTH; precies de grens mag', () => {
    const atLimit = 'a'.repeat(INTEGRATION_NAME_MAX_LENGTH);
    const overLimit = 'a'.repeat(INTEGRATION_NAME_MAX_LENGTH + 1);

    expect(() => registerIntegrations([def(atLimit)])).not.toThrow();
    expectConfigError([def(overLimit)], overLimit);
  });

  test.each([
    ['`*` als host', ['*']],
    ['een wildcard-host', ['*.partner.example']],
    ['een lege lijst', []],
    ['een schema', ['https://partner.example']],
    ['een poort', ['partner.example:443']],
  ])('koppelingsregister/AC-1: hosts met %s; de melding noemt de naam', (_label, hosts) => {
    expectConfigError([def('host-fout', { hosts })], 'host-fout');
  });

  test.each(Object.keys(TRAITS))(
    'koppelingsregister/AC-1: een ontbrekend kenmerk %s; de melding noemt naam en kenmerk',
    (key) => {
      const traits = Object.fromEntries(Object.entries(TRAITS).filter(([name]) => name !== key));
      expectConfigError([withTraits('zonder-kenmerk', traits)], 'zonder-kenmerk', key);
    },
  );

  test('koppelingsregister/AC-1: een onbekend kenmerk; de melding noemt naam en kenmerk', () => {
    expectConfigError([withTraits('extra-kenmerk', { ...TRAITS, kleur: 'blauw' })], 'extra-kenmerk', 'kleur');
  });

  test.each([
    ['auth', 'magie'],
    ['sensitivity', 'geheim'],
    ['cost', 'gratis'],
    ['source', 'elders'],
  ])('koppelingsregister/AC-1: een onbekende waarde voor %s (%s)', (key, value) => {
    expectConfigError([withTraits('onbekende-waarde', { ...TRAITS, [key]: value })], 'onbekende-waarde', key);
  });

  // OV-6: een waarde zonder bouwsteen wordt geweigerd; elke latere bouw-PR breidt de lijst uit.
  test.each([
    ['direction', ['write']],
    ['direction', ['read', 'callback']],
    ['sensitivity', 'personal-data'],
    ['auth', 'app-oauth2'],
    ['auth', 'on-behalf-of-user'],
    ['cadence', ['periodic']],
    ['cadence', ['on-demand', 'push']],
  ])('koppelingsregister/AC-1: %s %j heeft nog geen bouwsteen (OV-6)', (key, value) => {
    expectConfigError([withTraits('zonder-bouwsteen', { ...TRAITS, [key]: value })], 'zonder-bouwsteen', key);
  });

  test.each([
    ['auth', 'app-key'],
    ['sensitivity', 'money'],
    ['cost', 'per-app'],
    ['cost', 'per-user'],
    ['cost', 'paid'],
    ['source', 'app'],
    ['source', 'shared'],
  ])('koppelingsregister/AC-1: %s %j is nu toegestaan', (key, value) => {
    expect(() => registerIntegrations([withTraits('toegestaan', { ...TRAITS, [key]: value })])).not.toThrow();
  });

  test("koppelingsregister/AC-1: client('onbekend', …) gooit IntegrationConfigError met de naam", () => {
    const integrations = registerIntegrations([def('bekend')]);
    const attempt = () => integrations.client('onbekend', { baseUrl: 'https://partner.example', appEnv: 'test' });

    expect(attempt).toThrow(IntegrationConfigError);
    expect(attempt).toThrow(/onbekend/);
  });

  test('koppelingsregister/AC-1: client() met een geregistreerde naam geeft een client; hosts komen uit het register', () => {
    const integrations = registerIntegrations([def('bekend')]);

    expect(() => integrations.client('bekend', { baseUrl: 'https://partner.example', appEnv: 'test' })).not.toThrow();
    // Eén bron voor hosts: een baseUrl buiten de hosts van het register wordt geweigerd.
    expect(() => integrations.client('bekend', { baseUrl: 'https://ander.example', appEnv: 'test' })).toThrow();
  });
});

describe('koppelingsregister: grenzen in limits.ts', () => {
  test('INTEGRATION_NAME_MAX_LENGTH is 63 en INTEGRATION_SWITCH_MAX_AGE_MS 30 000 (OV-3)', () => {
    expect(INTEGRATION_NAME_MAX_LENGTH).toBe(63);
    expect(INTEGRATION_SWITCH_MAX_AGE_MS).toBe(30_000);
  });

  // De database bewijst de grens in test/integrations/name-limit.int.test.ts; hier de tekst van de migratie.
  test('INTEGRATION_NAME_MAX_LENGTH is gelijk aan de CHECK op app.integration_switches.name in de migratie', () => {
    const dir = path.join(import.meta.dirname, '../../../../db/migrations');
    const texts = readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => readFileSync(path.join(dir, file), 'utf8'))
      .filter((text) => /create table app\.integration_switches\b/i.test(text));
    expect(texts).toHaveLength(1);
    const table = /create table app\.integration_switches\b[\s\S]*?\n\);/i.exec(texts[0] ?? '')?.[0] ?? '';

    expect(table).toMatch(new RegExp(`\\b${String(INTEGRATION_NAME_MAX_LENGTH)}\\b`));
    expect(table).toContain('^[a-z][a-z0-9-]*$');
  });
});

// Spec koppeling-agentlaag (AC-3, AC-4): de catalogus van kenmerken is gebonden aan de echte controle, en het register
// geeft diep bevroren kopieën terug die een latere wijziging niet raakt.

describe('koppeling-agentlaag/AC-3: de catalogus volgt de controle van registerIntegrations', () => {
  const catalog = integrationTraitCatalog();
  const cases = catalog.flatMap((info) =>
    info.values.map(({ value, built }) => ({ trait: info.trait, list: info.list, value, built })),
  );

  test('koppeling-agentlaag/AC-3: precies de zes sleutels in de volgorde auth tot en met source; direction en cadence zijn lijsten', () => {
    expect(catalog.map(({ trait }) => trait)).toStrictEqual(Object.keys(TRAITS));
    expect(catalog.filter(({ list }) => list).map(({ trait }) => trait)).toStrictEqual(['direction', 'cadence']);
  });

  test('koppeling-agentlaag/AC-3: de catalogus is diep bevroren en een wijzigpoging verandert hem niet', () => {
    const before = JSON.stringify(catalog);

    expect(Object.isFrozen(catalog)).toBe(true);
    for (const info of catalog) {
      expect(Object.isFrozen(info)).toBe(true);
      expect(Object.isFrozen(info.values)).toBe(true);
      for (const item of info.values) expect(Object.isFrozen(item)).toBe(true);
    }
    expectRejectedMutation(() => {
      unsafeCast<{ built: boolean }[]>(catalog[0]?.values, 'test: wijzigpoging op de bevroren catalogus').push({
        built: true,
      });
    });
    expectRejectedMutation(() => {
      const first = unsafeCast<{ built: boolean }>(catalog[0]?.values[0], 'test: wijzigpoging op een catalogwaarde');
      first.built = !first.built;
    });
    expect(JSON.stringify(integrationTraitCatalog())).toBe(before);
  });

  test.each(cases.filter(({ built }) => built))(
    'koppeling-agentlaag/AC-3: $trait $value (built: true) wordt aanvaard',
    ({ trait, list, value }) => {
      const traits = { ...TRAITS, [trait]: list ? [value] : value };
      expect(() => registerIntegrations([withTraits('gebouwd', traits)])).not.toThrow();
    },
  );

  test.each(cases.filter(({ built }) => !built))(
    'koppeling-agentlaag/AC-3: $trait $value (built: false) gooit IntegrationConfigError met "nog geen bouwsteen"',
    ({ trait, list, value }) => {
      const traits = { ...TRAITS, [trait]: list ? [value] : value };
      expectConfigError([withTraits('zonder-bouwsteen', traits)], 'zonder-bouwsteen', trait, 'nog geen bouwsteen');
    },
  );

  test('koppeling-agentlaag/AC-3: de catalogus heeft waarden met en zonder bouwsteen', () => {
    expect(cases.some(({ built }) => built)).toBe(true);
    expect(cases.some(({ built }) => !built)).toBe(true);
  });
});

// Een wijziging op een bevroren object gooit in strikte modus een TypeError; op een kopie gaat ze zonder fout. Beide mogen,
// zolang het register niet verandert.
function expectRejectedMutation(mutate: () => void): void {
  try {
    mutate();
  } catch (error) {
    expect(error).toBeInstanceOf(TypeError);
  }
}

type MutableTraits = {
  -readonly [K in keyof Traits]: Traits[K] extends readonly (infer U)[] ? U[] : Traits[K];
};

interface MutableDef {
  name: string;
  hosts: string[];
  traits: MutableTraits;
}

const freshTraits = (): MutableTraits => ({
  auth: 'none',
  direction: ['read'],
  cadence: ['on-demand'],
  sensitivity: 'normal',
  cost: 'free',
  source: 'partner',
});

const CLIENT_CONFIG = { baseUrl: 'http://127.0.0.1:1', appEnv: 'test' } as const;
const SNAPSHOT = [
  { name: 'eerste', hosts: ['127.0.0.1'], traits: freshTraits() },
  { name: 'tweede', hosts: ['127.0.0.1'], traits: freshTraits() },
];

describe('koppeling-agentlaag/AC-4: integrations.defs is een bevroren kopie in registervolgorde', () => {
  test('koppeling-agentlaag/AC-4: defs geeft naam, hosts en kenmerken in registervolgorde', () => {
    const integrations = registerIntegrations([
      def('tweede', { hosts: ['127.0.0.1'] }),
      def('eerste', { hosts: ['127.0.0.1', 'localhost'] }),
    ]);

    expect(integrations.defs).toStrictEqual([
      { name: 'tweede', hosts: ['127.0.0.1'], traits: TRAITS },
      { name: 'eerste', hosts: ['127.0.0.1', 'localhost'], traits: TRAITS },
    ]);
    expect(integrations.defs.map(({ name }) => name)).toStrictEqual(integrations.names);
    expect(registerIntegrations([]).defs).toStrictEqual([]);
  });

  test('koppeling-agentlaag/AC-4: defs, elke definitie, hosts, traits, direction en cadence zijn bevroren', () => {
    const integrations = registerIntegrations([def('bevroren', { hosts: ['127.0.0.1'] })]);
    const [first] = integrations.defs;

    expect(Object.isFrozen(integrations.defs)).toBe(true);
    expect(first).toBeDefined();
    for (const part of [first, first?.hosts, first?.traits, first?.traits.direction, first?.traits.cadence]) {
      expect(Object.isFrozen(part)).toBe(true);
    }
  });

  test('koppeling-agentlaag/AC-4: een wijziging via defs (ook traits.direction) verandert defs, names en client niet', () => {
    const integrations = registerIntegrations([
      { name: 'eerste', hosts: ['127.0.0.1'], traits: freshTraits() },
      { name: 'tweede', hosts: ['127.0.0.1'], traits: freshTraits() },
    ]);
    const viaDefs = unsafeCast<MutableDef[]>(integrations.defs, 'test: wijzigpoging op de bevroren defs');
    const first = viaDefs[0];

    expectRejectedMutation(() => {
      viaDefs.push({ name: 'erbij', hosts: ['127.0.0.1'], traits: freshTraits() });
    });
    expectRejectedMutation(() => {
      viaDefs.reverse();
    });
    if (first !== undefined) {
      expectRejectedMutation(() => {
        first.name = 'anders';
      });
      expectRejectedMutation(() => {
        first.hosts.push('ander.example');
      });
      expectRejectedMutation(() => {
        first.traits.direction.push('write');
      });
      expectRejectedMutation(() => {
        first.traits.cadence.push('push');
      });
      expectRejectedMutation(() => {
        first.traits.auth = 'app-oauth2';
      });
      expectRejectedMutation(() => {
        first.traits = { ...freshTraits(), sensitivity: 'personal-data' };
      });
    }

    expect(integrations.defs).toStrictEqual(SNAPSHOT);
    expect(integrations.names).toStrictEqual(['eerste', 'tweede']);
    expect(integrations.has('anders')).toBe(false);
    expect(integrations.client('eerste', CLIENT_CONFIG).name).toBe('eerste');
    expect(() => integrations.client('eerste', { baseUrl: 'http://ander.example', appEnv: 'test' })).toThrow();
  });

  test('koppeling-agentlaag/AC-4: een wijziging van het invoerobject (ook traits en lijsten) verandert defs, names en client niet', () => {
    const traits = freshTraits();
    const first: MutableDef = { name: 'eerste', hosts: ['127.0.0.1'], traits };
    const list: MutableDef[] = [first, { name: 'tweede', hosts: ['127.0.0.1'], traits: freshTraits() }];
    const integrations = registerIntegrations(list);

    first.name = 'anders';
    first.hosts.push('ander.example');
    traits.direction.push('write');
    traits.cadence.push('periodic');
    traits.auth = 'on-behalf-of-user';
    traits.sensitivity = 'personal-data';
    first.traits = { ...freshTraits(), source: 'shared' };
    list.push({ name: 'derde', hosts: ['127.0.0.1'], traits: freshTraits() });
    list.reverse();

    expect(integrations.defs).toStrictEqual(SNAPSHOT);
    expect(integrations.names).toStrictEqual(['eerste', 'tweede']);
    expect(integrations.has('anders')).toBe(false);
    expect(integrations.has('derde')).toBe(false);
    expect(integrations.client('eerste', CLIENT_CONFIG).name).toBe('eerste');
    // De host die later aan het invoerobject werd toegevoegd, geldt niet voor de client.
    expect(() => integrations.client('eerste', { baseUrl: 'http://ander.example', appEnv: 'test' })).toThrow();
    expect(() => integrations.client('anders', CLIENT_CONFIG)).toThrow(IntegrationConfigError);
  });
});
