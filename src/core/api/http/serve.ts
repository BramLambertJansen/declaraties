import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getRequestListener } from '@hono/node-server';
import { onProcessSignal } from '../env.ts';

interface Fetchable {
  fetch: (request: Request) => Response | Promise<Response>;
}

export interface ServeOptions {
  readonly host: string;
  readonly port: number;
  // Hoe lang lopende requests na SIGTERM mogen doorlopen; daarna worden hun verbindingen verbroken.
  readonly shutdownTimeoutMs: number;
  // Na de laatste request: databasepools en andere bronnen sluiten; de compositie-root (src/api/server.ts) geeft ze mee.
  readonly onStopped: () => Promise<void>;
  // Standaard SIGTERM (containerhost) en SIGINT (Ctrl+C); tests geven een lege lijst.
  readonly signals?: readonly NodeJS.Signals[];
}

export interface RunningServer {
  readonly port: number;
  // Idempotent: een tweede aanroep (bijv. SIGINT na SIGTERM) wacht op dezelfde afloop.
  readonly stop: () => Promise<void>;
}

const DEFAULT_SIGNALS: readonly NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

function listen(server: Server, options: ServeOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.off('error', reject);
      const address: AddressInfo | string | null = server.address();
      resolve(typeof address === 'object' && address !== null ? address.port : options.port);
    });
  });
}

// Geen nieuwe verbindingen, lopende requests afmaken (hooguit timeoutMs).
function drain(server: Server, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`API: lopende requests na ${String(timeoutMs)} ms afgebroken`);
      server.closeAllConnections();
    }, timeoutMs);
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
    server.closeIdleConnections();
  });
}

// Een onbereikbare database mag het stoppen niet ophouden: het sluiten van de bronnen krijgt dezelfde timeout.
async function closeWithin(close: () => Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      resolve('timeout');
    }, timeoutMs);
  });
  try {
    const outcome = await Promise.race([close().then(() => 'closed' as const), timedOut]);
    if (outcome === 'timeout') throw new Error(`bronnen niet gesloten binnen ${String(timeoutMs)} ms`);
  } finally {
    clearTimeout(timer);
  }
}

function shutdown(server: Server, options: ServeOptions): () => Promise<void> {
  let stopping: Promise<void> | undefined;
  return () => {
    stopping ??= drain(server, options.shutdownTimeoutMs).then(async () =>
      closeWithin(options.onStopped, options.shutdownTimeoutMs),
    );
    return stopping;
  };
}

// Node-ingang; host-adapters in deploy/<host>/ gebruiken dit niet.
export async function startServer(app: Fetchable, options: ServeOptions): Promise<RunningServer> {
  // De listener vangt fouten van de app zelf af (500); node:http verwacht een functie zonder Promise.
  const listener = getRequestListener(app.fetch);
  const server = createServer((request, response) => {
    void listener(request, response);
  });
  const port = await listen(server, options);
  const stop = shutdown(server, options);
  for (const signal of options.signals ?? DEFAULT_SIGNALS) {
    onProcessSignal(signal, async () => {
      console.info(`API: ${signal} ontvangen, stoppen`);
      await stop();
    });
  }
  console.info(`API op http://${options.host}:${String(port)}`);
  return { port, stop };
}
