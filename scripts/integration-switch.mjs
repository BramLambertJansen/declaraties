// Schakelaar per koppeling zetten zonder scherm (spec koppelingsregister, OV-7). Werkt in elke omgeving, voor wie
// MIGRATOR_DATABASE_URL heeft; app.set_integration_enabled schrijft de auditregel (db_role app_migrator, geen actor).
// Gebruik: pnpm integration:switch --name <naam> --on|--off
import { parseArgs } from 'node:util';
import pg from 'pg';

/**
 * Zet de schakelaar van een geregistreerde koppeling. Een naam buiten het register stopt vóór elke query.
 * @param {{ query: (sql: string, values: unknown[]) => Promise<unknown> }} pool
 * @param {{ has: (name: string) => boolean }} integrations
 * @param {{ name: string, enabled: boolean }} change
 */
export async function switchIntegration(pool, integrations, { name, enabled }) {
  if (!integrations.has(name)) throw new Error(`Koppeling ${name} staat niet in het register (src/api/integrations)`);
  await pool.query('select app.set_integration_enabled($1, $2)', [name, enabled]);
}

/** @param {string} name */
function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} ontbreekt`);
  return value;
}

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      on: { type: 'boolean', default: false },
      off: { type: 'boolean', default: false },
    },
  });
  const name = values.name?.trim() ?? '';
  if (name === '' || values.on === values.off) {
    console.error('Gebruik: pnpm integration:switch --name <naam> --on|--off');
    process.exit(2);
  }
  const { integrations } = await import('../src/api/integrations/index.ts');
  if (!integrations.has(name)) {
    console.error(`✗ Koppeling ${name} staat niet in het register (src/api/integrations); niets gewijzigd.`);
    process.exit(1);
  }
  const migrator = new pg.Pool({ connectionString: required('MIGRATOR_DATABASE_URL'), max: 1 });
  try {
    await switchIntegration(migrator, integrations, { name, enabled: values.on });
    console.info(`✓ ${name}: ${values.on ? 'aan' : 'uit'}`);
  } finally {
    await migrator.end();
  }
}

if (import.meta.main) await main();
