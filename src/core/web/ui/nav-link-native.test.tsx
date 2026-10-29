import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, expect, test } from 'vitest';
import { NavLink } from './nav-link.tsx';

afterEach(cleanup);

async function show(props: Omit<ComponentProps<typeof NavLink>, 'href' | 'children'> = {}) {
  const root = createRootRoute({
    component: () => (
      <>
        <NavLink href="/next" {...props}>
          Volgende
        </NavLink>
        <Outlet />
      </>
    ),
  });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => <p>Start</p> });
  const next = createRoute({ getParentRoute: () => root, path: '/next', component: () => <p>Bestemming</p> });
  const router = createRouter({
    routeTree: root.addChildren([index, next]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await act(async () => {
    await router.load();
  });
  render(<RouterProvider router={router} />);
  return { router, link: await screen.findByRole('link', { name: 'Volgende' }) };
}

function intercepted(link: HTMLElement, options: MouseEventInit = {}): boolean | undefined {
  let prevented: boolean | undefined;
  // Na React observeren en daarna de browseractie tegenhouden: jsdom hoeft geen tabblad of download te openen.
  const observe = (event: MouseEvent) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener('click', observe);
  try {
    fireEvent.click(link, options);
  } finally {
    document.removeEventListener('click', observe);
  }
  return prevented;
}

test.each([
  { target: '_blank' },
  { target: 'rapport' },
  { target: '_parent' },
  { download: true },
  { download: 'rapport.csv' },
])('laat de native linkactie intact: %j', async (props) => {
  const { router, link } = await show(props);
  expect(intercepted(link)).toBe(false);
  expect(router.state.location.pathname).toBe('/');
});

test.each([{}, { target: '_self' }])('een gewone link blijft via de router navigeren: %j', async (props) => {
  const { router, link } = await show(props);
  expect(intercepted(link)).toBe(true);
  await waitFor(() => {
    expect(router.state.location.pathname).toBe('/next');
  });
});

test.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])(
  'een aangepaste klik blijft native: %j',
  async (options) => {
    const { router, link } = await show();
    expect(intercepted(link, options)).toBe(false);
    expect(router.state.location.pathname).toBe('/');
  },
);

test('een eigen onClick kan navigatie nog steeds annuleren', async () => {
  const { router, link } = await show({
    onClick: (event) => {
      event.preventDefault();
    },
  });
  expect(intercepted(link)).toBe(true);
  expect(router.state.location.pathname).toBe('/');
});
