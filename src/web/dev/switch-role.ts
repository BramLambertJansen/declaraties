import type { QueryClient } from '@tanstack/react-query';
import type { useNavigate } from '@tanstack/react-router';
import type { Role } from '#core/shared/can.ts';
import { api } from '#web/lib/api.ts';
import { homeFor } from '#web/lib/session.ts';

// Alleen lokaal (ADR 0043; src/web/dev is leeg in de productiebundel): echt inloggen als het seed-account van de rol,
// cache leeg, naar de start van die rol.
export async function switchRole(
  role: Role,
  queryClient: QueryClient,
  navigate: ReturnType<typeof useNavigate>,
): Promise<void> {
  await api.devLoginAs(role);
  queryClient.clear();
  await navigate({ to: homeFor(role) });
}
