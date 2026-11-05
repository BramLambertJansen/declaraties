// Register en schakelaar per koppeling (spec koppelingsregister, ADR 0077): de app registreert elke koppeling één keer
// (src/api/integrations/index.ts) en maakt haar client via integrations.client; een route leest de stand met readSwitch in
// withUser en geeft die lezing aan call. Uit = UPSTREAM_UNAVAILABLE zonder netwerkaanroep.

export { IntegrationConfigError } from './errors.ts';
export { readSwitch } from './reading.ts';
export { integrationTraitCatalog, registerIntegrations } from './register.ts';
export type {
  Adapter,
  AdapterCall,
  IntegrationClient,
  IntegrationClientConfig,
  IntegrationDef,
  Integrations,
  IntegrationTraitInfo,
  IntegrationTraits,
  SwitchReading,
} from './types.ts';
