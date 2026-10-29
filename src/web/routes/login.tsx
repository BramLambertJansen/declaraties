import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { LoginPage } from '#web/features/login/login-page.tsx';
import { homeFor, meQuery } from '#web/lib/session.ts';

// Publiek (framework §3): het inlogscherm. Al ingelogd → door naar de start van de rol (spec accountbeheer).
const search = z.object({
  redirect: z.string().optional().catch(undefined),
  ingesteld: z.boolean().optional().catch(undefined),
  sessie: z.literal('verlopen').optional().catch(undefined),
});

export const Route = createFileRoute('/login')({
  validateSearch: search,
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.query(meQuery).catch(() => null);
    if (me !== null) redirect({ to: homeFor(me.rol), throw: true });
  },
  component: LoginRoute,
});

function LoginRoute() {
  const { redirect: target, ingesteld, sessie } = Route.useSearch();
  const notice = ingesteld === true ? 'ingesteld' : sessie === 'verlopen' ? 'verlopen' : null;
  return <LoginPage notice={notice} redirect={target} />;
}
