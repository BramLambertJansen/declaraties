import { describe, expect, test, vi } from 'vitest';
import { createReadiness } from './readiness.ts';

// Readiness (roadmap stuk 7): uitkomst kort bewaard, hooguit één controle tegelijk, een hangende database telt als niet klaar.

function clock(start = 0) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('createReadiness', () => {
  test('bereikbare database: klaar', async () => {
    const ready = createReadiness(() => Promise.resolve(), { timeoutMs: 100, cacheMs: 0 });
    expect(await ready()).toBe(true);
  });

  test('fout bij de controle: niet klaar', async () => {
    const ready = createReadiness(() => Promise.reject(new Error('ECONNREFUSED')), { timeoutMs: 100, cacheMs: 0 });
    expect(await ready()).toBe(false);
  });

  test('bewaart de uitkomst binnen cacheMs en controleert daarna opnieuw', async () => {
    const time = clock();
    const check = vi.fn(() => Promise.resolve());
    const ready = createReadiness(check, { timeoutMs: 100, cacheMs: 1000, now: time.now });
    await ready();
    time.advance(999);
    await ready();
    expect(check).toHaveBeenCalledTimes(1);
    time.advance(1);
    await ready();
    expect(check).toHaveBeenCalledTimes(2);
  });

  test('gelijktijdige aanvragen delen één controle', async () => {
    const check = vi.fn(() => Promise.resolve());
    const ready = createReadiness(check, { timeoutMs: 100, cacheMs: 0 });
    const results = await Promise.all([ready(), ready(), ready()]);
    expect(results).toEqual([true, true, true]);
    expect(check).toHaveBeenCalledTimes(1);
  });

  test('hangende controle: niet klaar na de timeout, en geen tweede controle zolang de eerste hangt', async () => {
    const hanging = Promise.withResolvers<undefined>();
    const check = vi.fn(() => hanging.promise);
    const ready = createReadiness(check, { timeoutMs: 20, cacheMs: 0 });
    expect(await ready()).toBe(false);
    expect(await ready()).toBe(false);
    expect(check).toHaveBeenCalledTimes(1);
    hanging.resolve(undefined);
    await hanging.promise;
    await Promise.resolve();
    expect(await ready()).toBe(true);
    expect(check).toHaveBeenCalledTimes(2);
  });

  test('hangende controle die later faalt: daarna start een nieuwe controle', async () => {
    const hanging = Promise.withResolvers<undefined>();
    const check = vi.fn<() => Promise<void>>().mockReturnValueOnce(hanging.promise).mockResolvedValue(undefined);
    const ready = createReadiness(check, { timeoutMs: 20, cacheMs: 0 });
    expect(await ready()).toBe(false);
    hanging.reject(new Error('ETIMEDOUT'));
    await hanging.promise.catch(() => undefined);
    await Promise.resolve();
    expect(await ready()).toBe(true);
    expect(check).toHaveBeenCalledTimes(2);
  });

  test('een timeout wordt net als een gewone uitkomst bewaard binnen cacheMs', async () => {
    const time = clock();
    const hanging = Promise.withResolvers<undefined>();
    const check = vi.fn(() => hanging.promise);
    const ready = createReadiness(check, { timeoutMs: 20, cacheMs: 1000, now: time.now });
    expect(await ready()).toBe(false);
    hanging.resolve(undefined);
    await hanging.promise;
    await Promise.resolve();
    time.advance(500);
    expect(await ready()).toBe(false);
    expect(check).toHaveBeenCalledTimes(1);
  });
});
