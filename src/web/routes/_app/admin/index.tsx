import { createFileRoute } from '@tanstack/react-router';
import { DashboardPage } from '#web/features/dashboard/dashboard-page.tsx';
import { guard } from '#web/lib/session.ts';

export const Route = createFileRoute('/_app/admin/')({ beforeLoad: guard('accounts:read'), component: DashboardPage });
