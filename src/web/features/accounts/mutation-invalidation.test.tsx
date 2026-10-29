import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { createQueryClient } from '#core/web/lib/query.ts';
import { accountKeys, useBlock, useInvite } from './queries.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function useInviteAction(): () => Promise<unknown> {
  const mutation = useInvite();
  return () => mutation.mutateAsync({ naam: 'New', email: 'new@example.test', rol: 'user' });
}

function useBlockAction(): () => Promise<unknown> {
  const mutation = useBlock();
  return () => mutation.mutateAsync('user');
}

const cases: readonly { label: string; useAction: () => () => Promise<unknown> }[] = [
  { label: 'uitnodigen', useAction: useInviteAction },
  { label: 'blokkeren', useAction: useBlockAction },
];

test.each(cases)('$label ververst de accountlijst ook bij een mogelijke fout na commit', async ({ useAction }) => {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(new Response(JSON.stringify({ code: 'INTERNAL_ERROR' }), { status: 500 })),
  );
  const client = createQueryClient();
  const key = [...accountKeys.all, 'list', {}];
  client.setQueryData(key, { items: [], nextCursor: null });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(useAction, { wrapper });
  await act(async () => {
    await expect(result.current()).rejects.toThrow('INTERNAL_ERROR');
  });
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  client.clear();
});
