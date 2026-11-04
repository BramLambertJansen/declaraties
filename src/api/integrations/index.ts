import { registerIntegrations } from '#core/api/integrations/index.ts';

// Het register van de app (spec koppelingsregister): elke koppeling één keer, met naam, hosts en kenmerken. Zonder
// bijwerking (geen env, geen netwerk): server.ts, buildApp en `pnpm integration:switch` importeren het. Template: leeg.
export const integrations = registerIntegrations([]);
