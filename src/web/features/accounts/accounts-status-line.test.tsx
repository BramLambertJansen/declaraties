import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { createQueryClient } from '#core/web/lib/query.ts';
import { ErrorTextsProvider } from '#core/web/ui/error-texts.tsx';
import { ToastProvider } from '#core/web/ui/toast.tsx';
import { errorTexts } from '#web/copy/errors.ts';
import { createAppRouter } from '#web/lib/router.ts';

// typografie-en-layout/AC-9: de statusregel van de accountlijst via Text; de API is nagebootst zoals in routes.test.tsx.
// De bron-eis (geen text-sm/text-muted-foreground meer in accounts-page.tsx) staat in test/ui/typografie-en-layout.test.ts.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const admin = { id: 'a1', naam: 'Bea Beheer', email: 'bea@example.test', rol: 'admin' };

function account(id: string, naam: string) {
  return {
    id,
    naam,
    email: `${id}@example.test`,
    rol: 'user',
    status: 'actief',
    aangemaakt: '2026-10-21T08:00:00Z',
    laatstIngelogd: null,
    gedeactiveerd: false,
    geblokkeerd: false,
  };
}

function show(nextCursor: string | null) {
  vi.stubGlobal('fetch', (input: string) => {
    if (input.endsWith('/api/me')) return Promise.resolve(new Response(JSON.stringify(admin)));
    const items = [account('u1', 'Anna'), account('u2', 'Bram')];
    return Promise.resolve(new Response(JSON.stringify({ items, nextCursor })));
  });
  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: ['/admin/accounts'] }));
  render(
    <ErrorTextsProvider texts={errorTexts}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </ErrorTextsProvider>,
  );
}

// typografie-en-layout/AC-9
test.each([
  [null, '2 accounts getoond.'],
  ['volgende', '2 accounts getoond. Er zijn er meer.'],
])(
  'typografie-en-layout/AC-9: statusregel met aria-live="polite" en tekst via Text (cursor %s)',
  async (cursor, text) => {
    show(cursor);
    const line = await screen.findByText(text, {}, { timeout: 5000 });
    expect(line.tagName).toBe('P');
    expect(line.getAttribute('aria-live')).toBe('polite');
    // Text size="sm" tone="muted" levert naast deze twee ook font-normal uit het recept; de oude utility-klassen niet.
    expect([...line.classList]).toEqual(expect.arrayContaining(['text-sm', 'text-muted-foreground', 'font-normal']));
  },
);
