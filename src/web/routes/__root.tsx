import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { isDev } from '#core/web/lib/env.ts';
import type { RouterContext } from '#web/lib/session.ts';

// Wortel van de bestandsroutes (framework §5). ErrorBoundary en "niet gevonden" per route via de router (main.tsx).
// Lokaal staat op elk scherm de dev-rolwisselaar (ADR 0043); in de productiebundel is src/web/dev leeg.
const DevRoleSwitcher = isDev
  ? lazy(() => import('#web/dev/role-switcher.tsx').then((module) => ({ default: module.DevRoleSwitcher })))
  : null;

function Root() {
  return (
    <>
      <Outlet />
      {DevRoleSwitcher === null ? null : (
        <Suspense fallback={null}>
          <DevRoleSwitcher />
        </Suspense>
      )}
    </>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({ component: Root });
