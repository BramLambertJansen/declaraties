import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { definePermissions } from '../../shared/can.ts';
import { ApiError } from '../lib/api-client.ts';
import { createGuard } from '../lib/guard.ts';
import { ErrorTextsProvider } from './error-texts.tsx';
import { NotFound, RouteError } from './route-error.tsx';

afterEach(cleanup);

// Een router in het klein: guard in beforeLoad, ErrorBoundary en "niet gevonden" als standaard voor elke route.
const permissions = definePermissions({ 'beheer:read': { roles: ['admin'] } });
const guard = createGuard({
  permissions,
  loadActor: () => Promise.resolve({ role: 'user', sessionStrength: 'password' }),
  loginPath: '/login',
});

function show(path: string, load: () => Promise<void> = () => Promise.resolve()) {
  const root = createRootRoute({ component: Outlet });
  const routes = [
    createRoute({
      getParentRoute: () => root,
      path: '/beheer',
      beforeLoad: guard('beheer:read'),
      component: () => 'beheer',
    }),
    createRoute({ getParentRoute: () => root, path: '/lijst', loader: load, component: () => 'lijst geladen' }),
  ];
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: NotFound,
  });
  render(
    <ErrorTextsProvider
      texts={{ FORBIDDEN: 'Je hebt geen toegang tot deze pagina.', INTERNAL_ERROR: 'Er ging iets mis.' }}
    >
      <RouterProvider router={router} />
    </ErrorTextsProvider>,
  );
}

describe('RouteError en NotFound', () => {
  test('geen rechten: de vaste tekst uit de spec, zonder "opnieuw proberen"', async () => {
    show('/beheer');

    expect((await screen.findByRole('alert')).textContent).toBe('Je hebt geen toegang tot deze pagina.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('een fout in een route: de tekst bij de code; opnieuw proberen laadt de route opnieuw', async () => {
    let calls = 0;
    show('/lijst', () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new ApiError('INTERNAL_ERROR', 500)) : Promise.resolve();
    });

    expect((await screen.findByRole('alert')).textContent).toBe('Er ging iets mis.');
    fireEvent.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));
    expect(await screen.findByText('lijst geladen')).toBeDefined();
  });

  test('een onbekend pad: "Pagina niet gevonden"', async () => {
    show('/bestaat-niet');

    expect((await screen.findByRole('heading')).textContent).toBe('Pagina niet gevonden');
  });

  test('elke uitkomst zet een eigen paginatitel (WCAG 2.4.2), ook geen rechten zonder h1', async () => {
    document.title = 'Home';
    show('/beheer');
    await screen.findByRole('alert');
    expect(document.title).toBe('Geen toegang');
    cleanup();

    show('/bestaat-niet');
    await screen.findByRole('heading');
    expect(document.title).toBe('Pagina niet gevonden');
  });
});
