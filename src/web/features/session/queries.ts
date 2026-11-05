import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { auth } from '#web/lib/auth.ts';
import { meQuery } from '#web/lib/session.ts';

// De ingelogde gebruiker (GET /api/me); de guard heeft hem al geladen.
export function useMe() {
  return useQuery(meQuery);
}

// Uitloggen (spec accounts/AC-10): sessie weg in de database, hele querycache leeg, naar /login.
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => auth.signOut(),
    onSettled: async () => {
      queryClient.clear();
      await navigate({ to: '/login' });
    },
  });
}
