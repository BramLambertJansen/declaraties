import pg from 'pg';
import { logUnexpectedError } from '../http/safe-error-log.ts';

// Kleine pool per proces (framework §2): API en database staan in dezelfde regio, een request houdt een verbinding
// maar één transactie vast.
const POOL_SIZE = 5;
const IDLE_TIMEOUT_MS = 10_000;
// Wachten op een verbinding (nieuw of uit de volle pool) duurt hooguit 10 s; daarna faalt de request (INTERNAL_ERROR)
// in plaats van te blijven hangen tot de TCP-timeout van het OS (minuten) als de database onbereikbaar is.
const CONNECT_TIMEOUT_MS = 10_000;
// TCP-keepalive na 10 s stilte: zonder deze waarde gebruikt pg de OS-standaard (Linux: pas na 2 uur).
const KEEPALIVE_DELAY_MS = 10_000;

// Een idle verbinding die wegvalt (herstart of failover van de database of de pooler) meldt pg-pool als 'error' op de
// pool; zonder listener stopt dat het hele proces. De pool gooit de verbinding zelf weg; de volgende request verbindt opnieuw.
function ignoreIdleErrors(pool: pg.Pool): pg.Pool {
  pool.on('error', (error) => {
    logUnexpectedError({ label: 'database: idle verbinding verbroken' }, error, console.warn);
  });
  return pool;
}

export function createPool(connectionString: string): pg.Pool {
  return ignoreIdleErrors(
    new pg.Pool({
      connectionString,
      max: POOL_SIZE,
      idleTimeoutMillis: IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      // Een dode verbinding (half-open TCP) wordt gezien in plaats van een request te laten hangen.
      keepAlive: true,
      keepAliveInitialDelayMillis: KEEPALIVE_DELAY_MS,
      application_name: 'api',
    }),
  );
}

// Readiness (framework §3, ADR 0049): kan de API de database bereiken? Een eigen verbinding (max 1), los van de pool van
// withUser(): een volle pool onder belasting maakt de instantie niet "niet klaar", en een hangende ping houdt geen plek
// van een request vast. Verbinden en de query zijn elk begrensd op timeoutMs; na een fout wordt de verbinding weggegooid,
// zodat een half-open verbinding nooit blijft hangen. Draait als api_user zonder withUser(); `select 1` raakt geen tabel.
export interface Ping {
  readonly ping: () => Promise<void>;
  readonly end: () => Promise<void>;
}

export function createPing(connectionString: string, timeoutMs: number): Ping {
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: KEEPALIVE_DELAY_MS,
    // Herkenbaar in pg_stat_activity (en in de integratietest).
    application_name: 'readiness',
  });
  ignoreIdleErrors(pool);
  return {
    ping: async () => {
      const client = await pool.connect();
      try {
        await client.query('select 1');
        client.release();
      } catch (error) {
        client.release(true);
        throw error;
      }
    },
    end: async () => {
      await pool.end();
    },
  };
}
