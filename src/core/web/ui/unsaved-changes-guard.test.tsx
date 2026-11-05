import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { useState } from 'react';
import { UnsavedChangesGuard } from './unsaved-changes-guard.tsx';
import { Button } from './button.tsx';

// jsdom mist native dialogmethoden; modaliteit, Escape en focusherstel worden in de echte-stack-e2e gecontroleerd.
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

function Editor() {
  const [dirty, setDirty] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setDirty(false);
        }}
      >
        Opgeslagen
      </Button>
      <Button
        onClick={() => {
          setBusy(true);
        }}
      >
        Start opslaan
      </Button>
      <UnsavedChangesGuard
        when={dirty}
        busy={busy}
        title="Verlaten?"
        description="Niet opgeslagen."
        discardLabel="Verwerpen"
      />
    </>
  );
}
async function show() {
  const root = createRootRoute({ component: Outlet });
  const edit = createRoute({ getParentRoute: () => root, path: '/edit', component: Editor });
  const done = createRoute({ getParentRoute: () => root, path: '/done', component: () => <p>Bestemming</p> });
  const router = createRouter({
    routeTree: root.addChildren([edit, done]),
    history: createMemoryHistory({ initialEntries: ['/edit'] }),
  });
  await act(async () => {
    await router.load();
  });
  render(<RouterProvider router={router} />);
  return router;
}

test('annuleren behoudt route; verwerpen hervat oorspronkelijke navigatie inclusief search', async () => {
  const router = await show();
  await screen.findByRole('button', { name: 'Opgeslagen' });
  act(() => {
    void router.navigate({ href: '/done?q=Anna' });
  });
  await screen.findByRole('alertdialog', { name: 'Verlaten?' });
  expect(router.state.location.pathname).toBe('/edit');
  fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  expect(router.state.location.pathname).toBe('/edit');
  act(() => {
    void router.navigate({ href: '/done?q=Anna' });
  });
  await screen.findByRole('alertdialog');
  fireEvent.click(screen.getByRole('button', { name: 'Verwerpen' }));
  await screen.findByText('Bestemming');
  expect(router.state.location.searchStr).toBe('?q=Anna');
});

test('opgeslagen formulier blokkeert niet; lopende opslag kan niet worden verworpen', async () => {
  const router = await show();
  fireEvent.click(await screen.findByRole('button', { name: 'Start opslaan' }));
  act(() => {
    void router.navigate({ href: '/done' });
  });
  await screen.findByRole('alertdialog');
  fireEvent.click(screen.getByRole('button', { name: 'Bezig…' }));
  expect(router.state.location.pathname).toBe('/edit');
  expect(screen.getByRole('button', { name: 'Annuleren' }).hasAttribute('disabled')).toBe(true);
  cleanup();
  const cleanRouter = await show();
  fireEvent.click(await screen.findByRole('button', { name: 'Opgeslagen' }));
  act(() => {
    void cleanRouter.navigate({ href: '/done' });
  });
  await waitFor(() => {
    expect(cleanRouter.state.location.pathname).toBe('/done');
  });
  expect(screen.queryByRole('alertdialog')).toBeNull();
});
