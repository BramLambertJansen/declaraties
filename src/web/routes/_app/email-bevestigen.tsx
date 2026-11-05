import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { EmailConfirmPage } from '#web/features/account/email-confirm-page.tsx';
import { guard } from '#web/lib/session.ts';

// Spec eigen-account: de link uit de e-mailwijziging (EMAIL_CONFIRM_PATH in src/core/api/auth/mailing.ts). Anoniem: eerst
// inloggen en dan terug naar deze link, met het token.
export const Route = createFileRoute('/_app/email-bevestigen')({
  validateSearch: z.object({ token: z.string().optional().catch(undefined) }),
  beforeLoad: guard('me:update'),
  component: EmailConfirmRoute,
});

function EmailConfirmRoute() {
  return <EmailConfirmPage token={Route.useSearch().token} />;
}
