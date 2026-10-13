import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';
import { z } from 'zod';
import { guard } from '#web/lib/session.ts';

// De componentcatalogus (framework §7, spec design-system): alleen voor admins, ook in productie. Lazy, zodat hij niet in de
// entry-chunk zit (test/ui/bundle.test.ts, AC-6).
export const Route = createFileRoute('/_app/design-system')({
  beforeLoad: guard('design-system:read'),
  validateSearch: z.object({ q: z.string().optional().catch(undefined) }),
  component: lazyRouteComponent(() => import('#web/features/design-system/design-system-page.tsx'), 'DesignSystemPage'),
});
