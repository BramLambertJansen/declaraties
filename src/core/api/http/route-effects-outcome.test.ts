import { afterEach, expect, test, vi } from 'vitest';
import { createRouteEffects } from './route-effects.ts';

afterEach(() => vi.restoreAllMocks());

test('zonder bevestigde uitkomst voert een fout geen destructieve cleanup uit', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const effects = createRouteEffects({ requestId: 'unknown-request', route: 'POST /api/accounts/invite' });
  const cleanup = vi.fn(() => Promise.resolve());
  effects.afterRollback(cleanup);
  const error = Object.assign(new Error('private@example.test'), {
    detail: 'private@example.test',
    query: 'sensitive',
  });
  await expect(effects.run(() => Promise.reject(error))).rejects.toBe(error);
  expect(cleanup).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledOnce();
  expect(log.mock.calls[0]?.[1]).toMatchObject({ requestId: 'unknown-request', route: 'POST /api/accounts/invite' });
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private@example|sensitive|detail|stack/);
});

test('een bevestigde commit gevolgd door een fout wordt niet gecompenseerd', async () => {
  const effects = createRouteEffects();
  const cleanup = vi.fn(() => Promise.resolve());
  effects.afterRollback(cleanup);
  effects.onTransactionOutcome('committed');
  await expect(effects.run(() => Promise.reject(new Error('after acknowledgement')))).rejects.toThrow(
    'after acknowledgement',
  );
  expect(cleanup).not.toHaveBeenCalled();
});
