import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { ROLES } from '#core/shared/can.ts';
import { roleLabels } from '#web/copy/ui.ts';
import { meQuery } from '#web/lib/session.ts';
import { DevRoleSwitcher } from './role-switcher.tsx';

afterEach(cleanup);

// De dev-rolwisselaar (besluit eigenaar 2026-10-10): tabje rechts, paneel met een knop per rol uit ROLES.
async function show(current: 'user' | 'admin' | null) {
  const queryClient = new QueryClient();
  if (current !== null) queryClient.setQueryData(meQuery.queryKey, { id: 'x', naam: 'X', email: 'x@x', rol: current });
  const root = createRootRoute({ component: DevRoleSwitcher });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return screen.findByRole('button', { name: 'Rol wisselen (alleen lokaal)' });
}

describe('DevRoleSwitcher', () => {
  test('dicht: alleen het tabje; het paneel is onbereikbaar (inert)', async () => {
    const tab = await show('user');

    expect(tab.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('complementary', { hidden: true }).hasAttribute('inert')).toBe(true);
  });

  test('open: een knop per rol uit ROLES, met de naam uit roleLabels; de huidige rol is gemarkeerd', async () => {
    fireEvent.click(await show('admin'));

    const buttons = ROLES.map((role) => screen.getByRole('button', { name: roleLabels[role] }));
    expect(buttons).toHaveLength(ROLES.length);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toStrictEqual(
      ROLES.map((role) => String(role === 'admin')),
    );
    expect(document.activeElement).toBe(buttons[0]);
  });

  test('Esc sluit het paneel en zet de focus terug op het tabje', async () => {
    const tab = await show(null);
    fireEvent.click(tab);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(tab.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(tab);
  });
});
