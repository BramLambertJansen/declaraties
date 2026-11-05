import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, expect, test } from 'vitest';
import { Breadcrumbs } from './breadcrumbs.tsx';

afterEach(cleanup);

function Example() {
  return (
    <Breadcrumbs
      items={[
        { id: 'home', label: 'Start', href: '/' },
        { id: 'accounts', label: 'Accounts', href: '/accounts' },
      ]}
      currentPage="Details"
    />
  );
}

test('alleen de huidige pagina is current; voorouders navigeren via de router en behouden native linkgedrag', async () => {
  const route = createRootRoute({ component: Example });
  const router = createRouter({
    routeTree: route,
    history: createMemoryHistory({ initialEntries: ['/accounts/details'] }),
  });
  render(<RouterProvider router={router} />);
  const nav = await screen.findByRole('navigation', { name: 'Kruimelpad' });
  expect(within(nav).getByRole('list')).toBeDefined();
  expect(within(nav).getAllByRole('listitem')).toHaveLength(3);
  expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  expect(within(nav).getByText('Details').getAttribute('aria-current')).toBe('page');
  expect(within(nav).queryByRole('link', { name: 'Details' })).toBeNull();
  const accounts = within(nav).getByRole('link', { name: 'Accounts' });
  expect(accounts.getAttribute('href')).toBe('/accounts');
  expect(accounts.hasAttribute('aria-current')).toBe(false);
  // De preventDefault voorkomt alleen jsdom-navigatie, nadat de component native modifiers heeft gerespecteerd.
  accounts.addEventListener(
    'click',
    (event) => {
      expect(event.defaultPrevented).toBe(false);
      event.preventDefault();
    },
    { once: true },
  );
  fireEvent.click(accounts, { ctrlKey: true });
  expect(router.state.location.pathname).toBe('/accounts/details');
  fireEvent.click(accounts);
  await waitFor(() => {
    expect(router.state.location.pathname).toBe('/accounts');
  });
});

test('zonder voorouders is de huidige pagina een benoemd kruimelpad zonder links of scheidingstekens', () => {
  render(<Breadcrumbs label="Locatie" items={[]} currentPage="Start" />);
  const nav = screen.getByRole('navigation', { name: 'Locatie' });
  expect(within(nav).getAllByRole('listitem')).toHaveLength(1);
  expect(within(nav).queryByRole('link')).toBeNull();
  expect(nav.querySelector('svg')).toBeNull();
});
