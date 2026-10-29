import { createFileRoute } from '@tanstack/react-router';
import { HomePage } from '#web/features/home/home-page.tsx';
import { guard } from '#web/lib/session.ts';

export const Route = createFileRoute('/_app/')({ beforeLoad: guard('app.use'), component: HomePage });
