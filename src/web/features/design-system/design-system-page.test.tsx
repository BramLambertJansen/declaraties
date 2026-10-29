import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRouter, createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { afterEach, expect, test } from 'vitest';
import { Toaster, ToastProvider } from '#core/web/ui/toast.tsx';
import { DesignSystemPage } from './design-system-page.tsx';

// Catalogus: de sectie Toast toont de kit-toasts met twee knoppen. In de app staat de Toaster in de AppShell; hier renderen we hem zelf.
afterEach(cleanup);

function setup() {
  const route = createRootRoute({ component: DesignSystemPage });
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/'] }) });
  return render(
    <ToastProvider>
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
      <Toaster />
    </ToastProvider>,
  );
}

test('de sectie Toast heeft de knoppen "Toon succes-toast" en "Toon fout-toast"', async () => {
  setup();
  expect(await screen.findByRole('heading', { name: 'Toast' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Toon succes-toast' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Toon fout-toast' })).toBeTruthy();
});

test('"Toon succes-toast" voegt een toast met sluitknop toe aan de status-meldingen', async () => {
  setup();
  await screen.findByRole('heading', { name: 'Toast' });
  // De Notice-voorbeeldsectie heeft zelf al een role=status; de toast komt erbij.
  const before = screen.getAllByRole('status').length;
  expect(screen.queryByRole('button', { name: 'Sluiten' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Toon succes-toast' }));
  expect(screen.getAllByRole('status')).toHaveLength(before + 1);
  expect(screen.getByText('Wijziging opgeslagen.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sluiten' })).toBeTruthy();
});

test('"Toon fout-toast" voegt een toast in role=alert toe', async () => {
  setup();
  await screen.findByRole('heading', { name: 'Toast' });
  // De Notice-voorbeeldsectie heeft zelf al een role=alert; de toast komt erbij.
  const before = screen.getAllByRole('alert').length;
  fireEvent.click(screen.getByRole('button', { name: 'Toon fout-toast' }));
  expect(screen.getAllByRole('alert')).toHaveLength(before + 1);
  expect(screen.getByText('Opslaan mislukt. Probeer het later opnieuw.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sluiten' })).toBeTruthy();
});
