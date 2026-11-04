import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { INTEGRATION_NAME_MAX_LENGTH, INTEGRATION_SWITCH_MAX_AGE_MS } from '../../shared/limits.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import { IntegrationConfigError, registerIntegrations, type IntegrationDef } from './index.ts';

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
