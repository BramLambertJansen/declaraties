import { expect, test, vi } from 'vitest';
import { createReadiness } from './readiness.ts';

test('een synchrone fout wordt bewaard als niet klaar; na de cachetijd kan de controle herstellen', async () => {
  let now = 0;
  const check = vi
    .fn<() => Promise<void>>()
    .mockImplementationOnce(() => {
      throw new Error('verbinding kon niet worden gestart');
    })
    .mockResolvedValue(undefined);
  const ready = createReadiness(check, { timeoutMs: 100, cacheMs: 1000, now: () => now });

  await expect(ready()).resolves.toBe(false);
  now = 999;
  await expect(ready()).resolves.toBe(false);
  expect(check).toHaveBeenCalledTimes(1);
  now = 1000;
  await expect(ready()).resolves.toBe(true);
  expect(check).toHaveBeenCalledTimes(2);
});

test('gelijktijdige aanvragen delen ook een synchroon falende controle', async () => {
  const check = vi.fn<() => Promise<void>>(() => {
    throw new Error('controle mislukt');
  });
  const ready = createReadiness(check, { timeoutMs: 100, cacheMs: 0 });

  await expect(Promise.all([ready(), ready(), ready()])).resolves.toEqual([false, false, false]);
  expect(check).toHaveBeenCalledTimes(1);
});

test('een synchrone fout na een geslaagde controle blokkeert latere controles niet', async () => {
  const check = vi
    .fn<() => Promise<void>>()
    .mockResolvedValueOnce(undefined)
    .mockImplementationOnce(() => {
      throw new Error('tijdelijke fout');
    })
    .mockResolvedValue(undefined);
  const ready = createReadiness(check, { timeoutMs: 100, cacheMs: 0 });

  await expect(ready()).resolves.toBe(true);
  await expect(ready()).resolves.toBe(false);
  await expect(ready()).resolves.toBe(true);
  expect(check).toHaveBeenCalledTimes(3);
});
