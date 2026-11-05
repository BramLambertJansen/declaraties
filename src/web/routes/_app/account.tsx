import { createFileRoute } from '@tanstack/react-router';
import { AccountPage } from '#web/features/account/account-page.tsx';
import { guard } from '#web/lib/session.ts';

// Spec eigen-account: elke ingelogde rol; een admin zonder MFA-sessie stuurt de guard eerst naar de TOTP-stap.
export const Route = createFileRoute('/_app/account')({ beforeLoad: guard('me:update'), component: AccountPage });
