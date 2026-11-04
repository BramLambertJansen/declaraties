import { sql } from 'drizzle-orm';
import type { Tx } from './types.ts';

// De schakelaar van een koppeling (spec koppelingsregister, OV-1): app.integration_enabled in de transactie van withUser.
// Geen rij = false (OV-2). Eigen bestand zodat het register de pool niet laadt; index.ts geeft hem door. Alleen
// readSwitch (src/core/api/integrations) maakt er een geldige lezing van.
export async function readIntegrationSwitch(tx: Tx, name: string): Promise<boolean> {
  const { rows } = await tx.execute<{ enabled: boolean }>(sql`select app.integration_enabled(${name}) as enabled`);
  return rows[0]?.enabled === true;
}
