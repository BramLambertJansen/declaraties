import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '#web/lib/api.ts';
import { auth } from '#web/lib/auth.ts';
import { meQuery } from '#web/lib/session.ts';

// Het eigen account (spec eigen-account). Elke mutatie invalideert `me` en alles eronder (`me/sessions`).
export const accountKeys = {
  me: meQuery.queryKey,
};

export function useRename() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (naam: string) => api.call('PATCH /me', { naam }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.me }),
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ huidig, nieuw }: { readonly huidig: string; readonly nieuw: string }) =>
      auth.changePassword(huidig, nieuw),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.me }),
  });
}

// Eigen sessies (spec eigen-account): de lijst hangt onder `me`, dus elke mutatie die `me` invalideert ververst hem ook.
export const sessionsQuery = queryOptions({
  queryKey: [...accountKeys.me, 'sessions'],
  queryFn: () => api.call('GET /me/sessions', {}),
});

export function useSessions() {
  return useQuery(sessionsQuery);
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.call('DELETE /me/sessions/:id', { id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.me }),
  });
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.call('POST /me/sessions/revoke-others', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.me }),
  });
}

// Stap 1 van een e-mailwijziging: een mail naar het oude adres. Het adres verandert pas na beide bevestigingen.
export function useChangeEmail() {
  return useMutation({ mutationFn: (newEmail: string) => auth.changeEmail(newEmail) });
}

// Stap 1 of 2 bevestigen met het token uit de mail; na stap 2 zijn naam, e-mail en accountlijst veranderd.
export function useConfirmEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.call('POST /me/email/bevestigen', { token }),
    onSuccess: async ({ stap }) => {
      if (stap === 'nieuw') {
        await queryClient.invalidateQueries({ queryKey: accountKeys.me });
        await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      }
    },
  });
}
