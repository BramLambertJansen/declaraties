import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { EditableDetailsExample } from './editable-details-example.tsx';
import { InputUtilitiesExamples } from './input-utilities-examples.tsx';

// jsdom mist native dialogmethoden; de router en de navigatieblokkering blijven echt.
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
afterAll(() => {
  if (originalShow === undefined) Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  else Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow);
  if (originalClose === undefined) Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  else Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
});
afterEach(cleanup);

function Catalogue() {
  return (
    <>
      <EditableDetailsExample />
      <InputUtilitiesExamples />
    </>
  );
}

async function show() {
  const root = createRootRoute({ component: Outlet });
  const catalogue = createRoute({ getParentRoute: () => root, path: '/design-system', component: Catalogue });
  const accounts = createRoute({
    getParentRoute: () => root,
    path: '/admin/accounts',
    component: () => <h1>Accountbeheerbestemming</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([catalogue, accounts]),
    history: createMemoryHistory({ initialEntries: ['/design-system'] }),
  });
  await act(async () => {
    await router.load();
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('link', { name: 'Terug naar accounts' });
  return router;
}

test.each(['Terug naar accounts', 'Accounts'])('%s bereikt de bestaande accountbeheerroute', async (name) => {
  const router = await show();
  const link = screen.getByRole('link', { name });
  expect(link.getAttribute('href')).toBe('/admin/accounts');
  fireEvent.click(link);
  await screen.findByRole('heading', { name: 'Accountbeheerbestemming' });
  expect(router.state.location.pathname).toBe('/admin/accounts');
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('gewijzigde invoer blijft na annuleren; verwerpen vervolgt de accountlink', async () => {
  const router = await show();
  fireEvent.click(screen.getByRole('button', { name: 'Contactgegevens bewerken' }));
  const details = within(screen.getByRole('region', { name: 'Contactgegevens' }));
  fireEvent.change(details.getByRole('textbox', { name: 'Naam' }), { target: { value: 'Gewijzigde naam' } });
  const link = screen.getByRole('link', { name: 'Terug naar accounts' });
  fireEvent.click(link);
  const dialog = within(await screen.findByRole('alertdialog', { name: 'Pagina verlaten?' }));
  expect(router.state.location.pathname).toBe('/design-system');
  fireEvent.click(dialog.getByRole('button', { name: 'Annuleren' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  expect(router.state.location.pathname).toBe('/design-system');
  expect(details.getByDisplayValue('Gewijzigde naam')).toBe(details.getByRole('textbox', { name: 'Naam' }));
  fireEvent.click(link);
  const reopened = within(await screen.findByRole('alertdialog', { name: 'Pagina verlaten?' }));
  fireEvent.click(reopened.getByRole('button', { name: 'Wijzigingen verwerpen en verlaten' }));
  await waitFor(() => {
    expect(router.state.location.pathname).toBe('/admin/accounts');
  });
  expect(screen.getByRole('heading', { name: 'Accountbeheerbestemming' })).toBeDefined();
});
