import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { DesignSystemPage } from '#web/features/design-system/design-system-page.tsx';
import { guard } from '#web/lib/session.ts';

// De componentcatalogus (framework §7, spec design-system): alleen voor admins, ook in productie. autoCodeSplitting
// (vite.config.ts) zet de component in een eigen chunk, buiten de entry-chunk (test/ui/bundle.test.ts, AC-6).
export const Route = createFileRoute('/_app/design-system')({
  beforeLoad: guard('design-system:read'),
  validateSearch: z.object({ q: z.string().optional().catch(undefined) }),
  component: DesignSystemPage,
});
