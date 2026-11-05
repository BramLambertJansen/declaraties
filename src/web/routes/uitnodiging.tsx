import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { InvitationPage } from '#web/features/invitation/invitation-page.tsx';

// Publiek (framework §3): de link uit de uitnodigingsmail (INVITATION_PATH in src/core/api/auth/options.ts).
export const Route = createFileRoute('/uitnodiging')({
  validateSearch: z.object({ token: z.string().optional().catch(undefined) }),
  component: InvitationRoute,
});

function InvitationRoute() {
  return <InvitationPage token={Route.useSearch().token} />;
}
