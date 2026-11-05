import { createFileRoute } from '@tanstack/react-router';
import { AppLayout } from '#web/features/layout/app-layout.tsx';
import { guard } from '#web/lib/session.ts';

// Alle ingelogde schermen: guard op app.use (elke rol), dan de AppShell. Elke kindroute heeft daarnaast een eigen guard.
export const Route = createFileRoute('/_app')({ beforeLoad: guard('app.use'), component: AppLayout });
