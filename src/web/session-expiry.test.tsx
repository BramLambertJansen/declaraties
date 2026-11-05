import { createMemoryHistory } from '@tanstack/react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { createQueryClient } from '#core/web/lib/query.ts';
import { ApiError } from '#core/web/lib/api-client.ts';
import { createAppRouter } from './lib/router.ts';
import { expireSession, meQuery } from './lib/session.ts';

afterEach(() => vi.unstubAllGlobals());

test('een 401 wist de oude actor en accountdata vóór navigatie naar inloggen', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ code: 'UNAUTHENTICATED' }), { status: 401 }))),
  );
  let navigation: Promise<void> | undefined;
  const client = createQueryClient({
    onUnauthenticated: () => {
      if (!expireSession(client)) return;
      navigation = router.navigate({ to: '/login', search: { sessie: 'verlopen', redirect: '/account' } });
    },
  });
  client.setQueryData(meQuery.queryKey, { id: 'u', naam: 'Review', email: 'review@example.test', rol: 'user' });
  client.setQueryData(['accounts'], { private: 'previous user' });
  const router = createAppRouter(client, createMemoryHistory({ initialEntries: ['/'] }));
  await router.load();
  await expect(
    client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(new ApiError('UNAUTHENTICATED', 401)) })
      .execute(undefined),
  ).rejects.toThrow();
  await navigation;
  expect(router.state.location.pathname).toBe('/login');
  expect(router.state.location.search.sessie).toBe('verlopen');
  expect(client.getQueryData(['accounts'])).toBeUndefined();
  expect(client.getQueryData(meQuery.queryKey)).toBeUndefined();
  client.clear();
});

test('een 401 bij het herladen van me behoudt de verlopen-sessiemelding in de guard', async () => {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(new Response(JSON.stringify({ code: 'UNAUTHENTICATED' }), { status: 401 })),
  );
  let navigation: Promise<void> | undefined;
  const client = createQueryClient({
    onUnauthenticated: () => {
      if (expireSession(client))
        navigation = router.navigate({ to: '/login', search: { sessie: 'verlopen', redirect: '/account' } });
    },
  });
  client.setQueryData(
    meQuery.queryKey,
    { id: 'u', naam: 'Review', email: 'review@example.test', rol: 'user' },
    { updatedAt: Date.now() - 60000 },
  );
  const router = createAppRouter(client, createMemoryHistory({ initialEntries: ['/account'] }));
  await router.load();
  await navigation;
  expect(router.state.location.pathname).toBe('/login');
  expect(router.state.location.search.sessie).toBe('verlopen');
  client.clear();
});
