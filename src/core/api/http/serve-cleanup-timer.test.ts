import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { startServer, type RunningServer } from './serve.ts';

const servers: RunningServer[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      await server.stop().catch(() => undefined);
    }),
  );
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test.each(['sync', 'async'])('een %s fout tijdens opruimen laat geen shutdowntimer achter', async (kind) => {
  const error = new Error('bron kon niet sluiten');
  const onStopped = vi.fn<() => Promise<void>>(() => {
    if (kind === 'sync') throw error;
    return Promise.reject(error);
  });
  const baseline = vi.getTimerCount();
  const server = await startServer(
    { fetch: () => new Response('ok') },
    {
      host: '127.0.0.1',
      port: 0,
      shutdownTimeoutMs: 5000,
      onStopped,
      signals: [],
    },
  );
  servers.push(server);

  await expect(server.stop()).rejects.toBe(error);
  expect(onStopped).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(baseline);
});

test('ook geslaagd opruimen laat geen shutdowntimer achter', async () => {
  const baseline = vi.getTimerCount();
  const server = await startServer(
    { fetch: () => new Response('ok') },
    {
      host: '127.0.0.1',
      port: 0,
      shutdownTimeoutMs: 5000,
      onStopped: () => Promise.resolve(),
      signals: [],
    },
  );
  servers.push(server);

  await server.stop();
  expect(vi.getTimerCount()).toBe(baseline);
});
