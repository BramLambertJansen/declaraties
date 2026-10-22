import { env } from '../env.ts';
import { createPing, createPool } from './pool.ts';
import { createWithUser } from './with-user.ts';

const { databaseUrl } = env();
const pool = createPool(databaseUrl);
// Verbinden en query elk hooguit 900 ms: samen korter dan de timeout van readiness (2 s, src/api/server.ts), zodat de
// ping altijd vóór de volgende controle zelf eindigt.
const PING_TIMEOUT_MS = 900;
const ping = createPing(databaseUrl, PING_TIMEOUT_MS);

// De enige ingang naar de database (framework §1, §6): de rest van de module is intern.
export const withUser = createWithUser(pool);

// Alleen voor readiness (GET /api/ready, ADR 0049): leest niets, zet geen gebruiker, eigen verbinding.
export const pingDatabase = ping.ping;

// Alleen bij het stoppen van het proces (startServer, onStopped): daarna faalt elke withUser().
export async function closeDatabase(): Promise<void> {
  await Promise.all([pool.end(), ping.end()]);
}

export type { Actor, SessionStrength, Tx, WithUserOptions } from './with-user.ts';
