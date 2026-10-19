import { expect, test, vi } from 'vitest';
import { createRouteEffects } from './route-effects.ts';

test('gevolgen lopen na commit en vrijgeven, cleanup alleen na rollback', async () => {
  const effects = createRouteEffects();
  const events: string[] = [];
  effects.afterCommit(() => {
    events.push('mail');
    return Promise.resolve();
  });
  effects.afterRollback(() => {
    events.push('cleanup');
    return Promise.resolve();
  });
  expect(
    await effects.run(() => {
      events.push('commit', 'release');
      return Promise.resolve(42);
    }),
  ).toBe(42);
  expect(events).toEqual(['commit', 'release', 'mail']);
});

test('commitfout compenseert in omgekeerde volgorde en bewaart de oorspronkelijke fout', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const effects = createRouteEffects();
    const events: string[] = [];
    effects.afterCommit(() => {
      events.push('mail');
      return Promise.resolve();
    });
    effects.afterRollback(() => {
      events.push('first');
      return Promise.resolve();
    });
    effects.afterRollback(() => {
      events.push('second');
      return Promise.reject(new Error('cleanup failed'));
    });
    const error = new Error('commit failed');
    await expect(effects.run(() => Promise.reject(error))).rejects.toBe(error);
    expect(events).toEqual(['second', 'first']);
  } finally {
    log.mockRestore();
  }
});

test('een fout na commit draait geen compensatie maar voert de andere gevolgen wel uit', async () => {
  const effects = createRouteEffects();
  const cleanup = vi.fn();
  const other = vi.fn(() => Promise.resolve());
  effects.afterRollback(cleanup);
  effects.afterCommit(() => Promise.reject(new Error('mail failed')));
  effects.afterCommit(other);
  await expect(effects.run(() => Promise.resolve())).rejects.toThrow('mail failed');
  expect(cleanup).not.toHaveBeenCalled();
  expect(other).toHaveBeenCalledOnce();
});

test('een externe stap die pas na een disconnect afrondt wordt alsnog gecompenseerd', async () => {
  const effects = createRouteEffects();
  await expect(effects.run(() => Promise.reject(new Error('disconnect')))).rejects.toThrow('disconnect');
  const cleanup = Promise.withResolvers<undefined>();
  const mail = vi.fn();
  effects.afterRollback(() => {
    cleanup.resolve(undefined);
    return Promise.resolve();
  });
  effects.afterCommit(mail);
  await cleanup.promise;
  expect(mail).not.toHaveBeenCalled();
});
