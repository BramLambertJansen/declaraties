import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, expect, test } from 'vitest';
import { CenteredCard } from './centered-card.tsx';
import { PageTitle } from './page-title.tsx';
import { NotFound, RouteError } from './route-error.tsx';

afterEach(cleanup);

test('schermvoorbeelden houden één main en h1 en behouden de echte documenttitel', () => {
  document.title = 'Design system';
  render(
    <main>
      <h1>Design system</h1>
      <CenteredCard preview title="Inloggen">
        <p>Voorbeeld</p>
      </CenteredCard>
      <NotFound preview />
      <PageTitle preview title="Voorbeeldtitel" />
    </main>,
  );
  expect(screen.getAllByRole('main')).toHaveLength(1);
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Inloggen', level: 3 })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Pagina niet gevonden', level: 3 })).toBeTruthy();
  expect(document.title).toBe('Design system');
});

test('de foutpreview gebruikt reset en wijzigt de echte documenttitel niet', async () => {
  document.title = 'Design system';
  let resets = 0;
  function Preview() {
    return (
      <RouteError
        preview
        error={new Error('Voorbeeld')}
        reset={() => {
          resets += 1;
        }}
      />
    );
  }
  const root = createRootRoute({ component: Preview });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) });
  render(<RouterProvider router={router} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Opnieuw proberen' }));
  expect(resets).toBe(1);
  expect(screen.queryByRole('main')).toBeNull();
  expect(document.title).toBe('Design system');
});
