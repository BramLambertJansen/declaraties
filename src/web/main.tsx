import '#core/web/lib/zod-config.ts';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createQueryClient } from '#core/web/lib/query.ts';
import { applyStoredTheme } from '#core/web/lib/theme.ts';
import { ErrorTextsProvider } from '#core/web/ui/error-texts.tsx';
import { ToastProvider } from '#core/web/ui/toast.tsx';
import { errorTexts } from '#web/copy/errors.ts';
import { createAppRouter } from '#web/lib/router.ts';
import { expireSession } from '#web/lib/session.ts';
import './styles/app.css';

// Compositie-root van de frontend (ADR 0040): query-client, router, foutteksten.
const queryClient = createQueryClient({
  // 401 uit een query of mutatie → inloggen met de terugweg (framework §5). Alleen als er in dit tabblad een sessie was:
  // dan is hij verlopen (spec: "Je sessie is verlopen."); bij een eerste bezoek stuurt de guard al door.
  onUnauthenticated: () => {
    if (!expireSession(queryClient)) return;
    void router.navigate({ to: '/login', search: { redirect: router.state.location.href, sessie: 'verlopen' } });
  },
});
const router = createAppRouter(queryClient);

// Het bewaarde thema vóór de eerste render, zodat er geen licht scherm flitst.
applyStoredTheme();

const root = document.getElementById('root');
if (root === null) throw new Error('Element #root ontbreekt in index.html');

createRoot(root).render(
  <StrictMode>
    <ErrorTextsProvider texts={errorTexts}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </ErrorTextsProvider>
  </StrictMode>,
);
