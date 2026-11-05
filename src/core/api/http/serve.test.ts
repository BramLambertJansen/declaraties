import { afterEach, describe, expect, test, vi } from 'vitest';
import { type RunningServer, startServer } from './serve.ts';

// Netjes stoppen (roadmap stuk 7): na stop() geen nieuwe verbindingen, lopende requests maken af, daarna pas onStopped.

interface Gate {
  readonly started: Promise<unknown>;
  readonly markStarted: () => void;
  readonly released: Promise<unknown>;
  readonly release: () => void;
}

// Een request dat pas antwoordt als de test het loslaat, zodat het "lopend" is op het moment van stoppen.
function gate(): Gate {
  const started = Promise.withResolvers();
  const released = Promise.withResolvers();
  return {
    started: started.promise,
    markStarted: () => {
      started.resolve(undefined);
    },
    released: released.promise,
    release: () => {
      released.resolve(undefined);
    },
  };
}

function slowApp(slow: Gate) {
  return {
    fetch: async (request: Request): Promise<Response> => {
      if (new URL(request.url).pathname !== '/slow') return new Response('snel');
      slow.markStarted();
      await slow.released;
      return new Response('klaar');
    },
  };
}

const servers: RunningServer[] = [];

async function start(app: ReturnType<typeof slowApp>, overrides: { shutdownTimeoutMs?: number } = {}) {
  const onStopped = vi.fn(() => Promise.resolve());
  const server = await startServer(app, {
    host: '127.0.0.1',
    port: 0,
    shutdownTimeoutMs: overrides.shutdownTimeoutMs ?? 5000,
    onStopped,
    signals: [],
  });
  servers.push(server);
  return { server, onStopped, url: (path: string) => `http://127.0.0.1:${String(server.port)}${path}` };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map(async (server) => server.stop()));
});

describe('startServer', () => {
  test('luistert op de opgegeven host en een vrije poort', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { server, url } = await start(slowApp(gate()));

    expect(server.port).toBeGreaterThan(0);
    expect(await (await fetch(url('/'))).text()).toBe('snel');
  });

  test('een lopend request maakt af; daarna pas onStopped, en nieuwe verbindingen worden geweigerd', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const slow = gate();
    const { server, onStopped, url } = await start(slowApp(slow));
    // Een keep-alive-verbinding die idle is, mag het stoppen niet ophouden.
    await (await fetch(url('/'))).text();

    const pending = fetch(url('/slow'));
    await slow.started;
    const stopped = server.stop();

    await expect(fetch(url('/'))).rejects.toThrow();
    expect(onStopped).not.toHaveBeenCalled();

    slow.release();
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('klaar');
    await stopped;
    expect(onStopped).toHaveBeenCalledOnce();
  });

  test('na de timeout wordt een hangend request afgebroken en stopt de server toch', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const hanging = gate();
    const { server, onStopped, url } = await start(slowApp(hanging), { shutdownTimeoutMs: 50 });

    const pending = fetch(url('/slow'));
    await hanging.started;
    await server.stop();

    await expect(pending).rejects.toThrow();
    expect(onStopped).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('API: lopende requests na 50 ms afgebroken');
    hanging.release();
  });

  test('een bron die niet sluit, houdt het stoppen hooguit de timeout op', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const server = await startServer(slowApp(gate()), {
      host: '127.0.0.1',
      port: 0,
      shutdownTimeoutMs: 50,
      onStopped: () => new Promise(() => undefined),
      signals: [],
    });

    await expect(server.stop()).rejects.toThrow('bronnen niet gesloten binnen 50 ms');
  });

  test('stop() twee keer (tweede signaal) sluit de bronnen één keer', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { server, onStopped } = await start(slowApp(gate()));

    await Promise.all([server.stop(), server.stop()]);

    expect(onStopped).toHaveBeenCalledOnce();
  });

  test('faalt als de poort al bezet is', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { server } = await start(slowApp(gate()));

    await expect(
      startServer(slowApp(gate()), {
        host: '127.0.0.1',
        port: server.port,
        shutdownTimeoutMs: 50,
        onStopped: () => Promise.resolve(),
        signals: [],
      }),
    ).rejects.toThrow('EADDRINUSE');
  });
});
