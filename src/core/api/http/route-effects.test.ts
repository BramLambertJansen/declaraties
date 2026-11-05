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

test('bevestigde rollback compenseert in omgekeerde volgorde en bewaart de oorspronkelijke fout', async () => {
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
    effects.onTransactionOutcome('rolledBack');
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

test('een externe stap die pas na een bevestigde rollback afrondt wordt alsnog gecompenseerd', async () => {
  const effects = createRouteEffects();
  effects.onTransactionOutcome('rolledBack');
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

test('een mislukte cleanup na rollback lekt geen persoonsgegevens naar de log', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const effects = createRouteEffects();
    effects.afterRollback(() =>
      Promise.reject(
        Object.assign(new Error('duplicate key value (alice@example.com)'), {
          code: '23505',
          detail: 'Key (email)=(alice@example.com) already exists.',
        }),
      ),
    );
    const error = new Error('commit failed');
    effects.onTransactionOutcome('rolledBack');
    await expect(effects.run(() => Promise.reject(error))).rejects.toBe(error);

    expect(log).toHaveBeenCalledOnce();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('alice');
    expect(logged).not.toContain('example.com');
    expect(logged).not.toContain('detail');
    expect(logged).not.toContain('already exists');
    expect(logged).not.toContain('"stack"');
    expect(log.mock.calls[0]?.[1]).toMatchObject({ errorClass: 'Error', code: '23505' });
  } finally {
    log.mockRestore();
  }
});
