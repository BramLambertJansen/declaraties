// Genereert de SQL voor de tabellen van Better Auth uit exact de opties van src/core/api/auth (framework §6: "auth generate",
// nooit "auth migrate"). Zonder database: een nep-pool antwoordt "leeg schema", zodat getMigrations alles als nieuw ziet.
// Gebruik: node scripts/auth-schema.mjs > db/migrations/<tijdstempel>_better_auth.sql (daarna controleren en committen).
// test/auth/schema.int.test.ts bewijst tegen de echte database dat er na de migraties niets meer te migreren valt.
import { getMigrations } from 'better-auth/db/migration';
import pg from 'pg';
import { createAuthOptions } from '../src/core/api/auth/options.ts';

const emptyResult = { rows: [], rowCount: 0, command: 'SELECT', fields: [] };
const client = { query: async () => emptyResult, release: () => undefined };
// Een echte pg.Pool zonder verbinding: connect en query geven een leeg resultaat terug.
const pool = Object.assign(new pg.Pool(), { connect: async () => client, query: async () => emptyResult });

const options = createAuthOptions(
  { origin: 'http://localhost:5173', secret: 'x'.repeat(32), sendInvitation: async () => undefined },
  pool,
);
const { compileMigrations, toBeCreated, toBeAdded } = await getMigrations(options);
if (toBeAdded.length > 0) throw new Error('onverwacht: kolommen toevoegen aan een leeg schema');
console.info(`-- migrate:up
-- Tabellen van Better Auth ${'1.7.7'} (ADR 0041, 0043), gegenereerd met scripts/auth-schema.mjs. Draait als app_migrator.
-- Grants: default privileges uit de baseline geven auth_service DML op schema better_auth.
set local search_path = better_auth;

${(await compileMigrations()).trim()}

-- Template: session_strength alleen 'password' of 'mfa', standaard 'password' (framework §6, ADR 0043).
alter table "session" alter column "session_strength" set default 'password';
alter table "session" add constraint "session_strength_check" check ("session_strength" in ('password', 'mfa'));

-- dbmate schrijft schema_migrations in dezelfde transactie, zonder schemanaam: zonder reset belandt die in better_auth.
reset search_path;

-- migrate:down
-- Append-only: geen down-migraties (docs/framework.md §10).`);
console.error(`tabellen: ${toBeCreated.map((table) => table.table).join(', ')}`);
