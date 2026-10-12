import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type { accountsSearch, inviteInput } from '#shared/contracts/accounts.ts';
import { api } from '#web/lib/api.ts';

// Accounts (spec accountbeheer): lijst per pagina met cursor; uitnodigen en opnieuw uitnodigen invalideren de lijst.
export const accountKeys = {
  all: ['accounts'] as const,
  list: (search: AccountsSearch) => [...accountKeys.all, 'list', search] as const,
};

export type AccountsSearch = z.output<typeof accountsSearch.web>;

const firstPage: string | null = null;

// Zoek- en filterwaarden zitten in de query key: elke wijziging begint bij de eerste pagina; de vorige rijen blijven staan tot het antwoord er is.
export function useAccounts(search: AccountsSearch) {
  return useInfiniteQuery({
    queryKey: accountKeys.list(search),
    queryFn: ({ pageParam }) =>
      api.call('GET /accounts', { ...search, ...(pageParam === null ? {} : { cursor: pageParam }) }),
    initialPageParam: firstPage,
    getNextPageParam: (page) => page.nextCursor,
    placeholderData: keepPreviousData,
  });
}

export function useInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: z.input<typeof inviteInput>) => api.call('POST /accounts/invite', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  });
}

export function useReinvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.call('POST /accounts/:id/reinvite', { id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  });
}

// Blokkeren en deblokkeren (spec accountbeheer-uitbreiding, ADR 0026): de status komt uit de lijst, dus invalideren.
export function useBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.call('POST /accounts/:id/block', { id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  });
}

export function useUnblock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.call('POST /accounts/:id/unblock', { id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  });
}
