import type { QueryClient } from '@tanstack/react-query';
import { createRouter, type RouterHistory } from '@tanstack/react-router';
import { NotFound, RouteError } from '#core/web/ui/route-error.tsx';
import { routeTree } from '../routeTree.gen.ts';

// De router van de app: bestandsroutes, de query-client als context voor de guards, en per route dezelfde ErrorBoundary
// en "niet gevonden" (framework §5). Gedeeld door main.tsx en de routetests.
export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: NotFound,
    defaultPreload: 'intent',
    ...(history === undefined ? {} : { history }),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
