import { INTEGRATION_NAME_MAX_LENGTH } from '../../shared/limits.ts';
import { allowedHosts } from '../outbound/config.ts';
import { OutboundConfigError } from '../outbound/errors.ts';
import { createIntegrationClient } from './client.ts';
import { IntegrationConfigError } from './errors.ts';
import type { IntegrationDef, Integrations, IntegrationTraitInfo, IntegrationTraits } from './types.ts';

// Het register (spec koppelingsregister, Opstart; ADR 0077 punt 1 en 2): bij opstart gecontroleerd, elke fout een
// IntegrationConfigError met naam en regel.

const NAME = /^[a-z][a-z0-9-]*$/;

interface TraitRule {
  // Een lijst van waarden (minstens één) in plaats van één waarde.
  readonly list: boolean;
  readonly known: readonly string[];
  // Waarden met een bouwsteen (OV-6); elke latere bouw-PR breidt deze lijst uit.
  readonly built: readonly string[];
}

const TRAITS = {
  auth: { list: false, known: ['none', 'app-key', 'app-oauth2', 'on-behalf-of-user'], built: ['none', 'app-key'] },
  direction: { list: true, known: ['read', 'write', 'callback'], built: ['read'] },
  cadence: { list: true, known: ['on-demand', 'periodic', 'push'], built: ['on-demand'] },
  sensitivity: { list: false, known: ['normal', 'personal-data', 'money'], built: ['normal', 'money'] },
  cost: {
    list: false,
    known: ['free', 'per-app', 'per-user', 'paid'],
    built: ['free', 'per-app', 'per-user', 'paid'],
  },
  source: { list: false, known: ['partner', 'app', 'shared'], built: ['partner', 'app', 'shared'] },
} as const satisfies Record<keyof IntegrationTraits, TraitRule>;

const fail = (name: string, rule: string): never => {
  throw new IntegrationConfigError(`registerIntegrations: koppeling ${JSON.stringify(name)}: ${rule}`);
};

function checkName(name: string, seen: ReadonlySet<string>): void {
  if (!NAME.test(name)) fail(name, 'naam moet voldoen aan /^[a-z][a-z0-9-]*$/');
  if (name.length > INTEGRATION_NAME_MAX_LENGTH) {
    fail(name, `naam is langer dan INTEGRATION_NAME_MAX_LENGTH (${String(INTEGRATION_NAME_MAX_LENGTH)})`);
  }
  if (seen.has(name)) fail(name, 'dubbele naam');
}

function checkHosts(def: IntegrationDef): void {
  try {
    allowedHosts(def.hosts);
  } catch (error) {
    if (!(error instanceof OutboundConfigError)) throw error;
    fail(def.name, `hosts klopt niet (${error.message})`);
  }
}

// De fout bij één kenmerk, of null als de waarde mag.
function traitProblem(rule: TraitRule, value: unknown): string | null {
  const values: readonly unknown[] = rule.list ? (Array.isArray(value) ? Array.from<unknown>(value) : []) : [value];
  if (rule.list && values.length === 0) return 'moet een lijst met minstens één waarde zijn';
  if (!values.every((item) => typeof item === 'string' && rule.known.includes(item))) return 'onbekende waarde';
  if (!values.every((item) => typeof item === 'string' && rule.built.includes(item))) {
    return 'waarde heeft nog geen bouwsteen (OV-6)';
  }
  return null;
}

function checkTraits(def: IntegrationDef): void {
  const traits: unknown = def.traits;
  if (typeof traits !== 'object' || traits === null) return fail(def.name, 'kenmerken ontbreken');
  const rules: Readonly<Record<string, TraitRule>> = TRAITS;
  const given = new Map<string, unknown>(Object.entries(traits));
  for (const key of given.keys()) {
    if (!(key in rules)) fail(def.name, `onbekend kenmerk ${key}`);
  }
  for (const [key, rule] of Object.entries(rules)) {
    if (!given.has(key)) fail(def.name, `kenmerk ${key} ontbreekt`);
    const problem = traitProblem(rule, given.get(key));
    if (problem !== null) fail(def.name, `kenmerk ${key}: ${problem}`);
  }
}

const isTraitKey = (key: string): key is keyof IntegrationTraits => Object.hasOwn(TRAITS, key);

// De catalogus van kenmerken (spec koppeling-agentlaag, OV-2): afgeleid uit TRAITS, één keer gebouwd en diep bevroren.
const CATALOG: readonly IntegrationTraitInfo[] = Object.freeze(
  Object.entries(TRAITS).flatMap(([trait, rule]: [string, TraitRule]) =>
    isTraitKey(trait)
      ? [
          Object.freeze({
            trait,
            list: rule.list,
            values: Object.freeze(
              rule.known.map((value) => Object.freeze({ value, built: rule.built.includes(value) })),
            ),
          }),
        ]
      : [],
  ),
);

// Per kenmerk de lijst-eigenschap en per bekende waarde of er een bouwsteen is; bevroren, in de volgorde van TRAITS.
export function integrationTraitCatalog(): readonly IntegrationTraitInfo[] {
  return CATALOG;
}

// Een diep bevroren kopie: een latere wijziging van het invoerobject verandert het register niet.
function frozenDef(def: IntegrationDef): IntegrationDef {
  const { traits } = def;
  return Object.freeze({
    name: def.name,
    hosts: Object.freeze([...def.hosts]),
    traits: Object.freeze({
      auth: traits.auth,
      direction: Object.freeze([...traits.direction]),
      cadence: Object.freeze([...traits.cadence]),
      sensitivity: traits.sensitivity,
      cost: traits.cost,
      source: traits.source,
    }),
  });
}

// Controleert het register bij opstart; gooit IntegrationConfigError. Zonder bijwerking: geen env, geen netwerk.
export function registerIntegrations(list: readonly IntegrationDef[]): Integrations {
  const defs = new Map<string, IntegrationDef>();
  for (const def of list) {
    checkName(def.name, new Set(defs.keys()));
    checkHosts(def);
    checkTraits(def);
    defs.set(def.name, frozenDef(def));
  }
  const names = Object.freeze([...defs.keys()]);
  return {
    names,
    defs: Object.freeze([...defs.values()]),
    has: (name) => defs.has(name),
    client: (name, config) => {
      const def = defs.get(name);
      if (def === undefined) {
        throw new IntegrationConfigError(
          `integrations.client: koppeling ${JSON.stringify(name)} staat niet in het register`,
        );
      }
      return createIntegrationClient(def, config);
    },
  };
}
