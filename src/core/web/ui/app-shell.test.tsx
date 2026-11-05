import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AppShell } from './app-shell.tsx';
import { PageHeader } from './page-header.tsx';
import { ToastProvider, useToast } from './toast.tsx';

// Schil toegankelijk (roadmap 3f): skip-link als eerste Tab-stop, paginatitel per scherm, focus naar de h1 na een routewissel.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function shell(routeKey: string, title: string) {
  return (
    <AppShell nav={[]} userName="Ada Admin" menuItems={[]} routeKey={routeKey}>
      <PageHeader title={title} />
    </AppShell>
  );
}

async function nextFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

test('de skip-link is het eerste focusbare element en wijst naar main', () => {
  const { container } = render(shell('/', 'Home'));
  const first = container.querySelector('a, button, input, [tabindex]:not([tabindex="-1"])');
  expect(first?.textContent).toBe('Naar de inhoud');
  expect(first?.getAttribute('href')).toBe('#inhoud');
  expect(screen.getByRole('main').id).toBe('inhoud');
});

test('de h1 zet de paginatitel', () => {
  render(shell('/', 'Accounts'));
  expect(document.title).toBe('Accounts');
});

test('na een routewissel staat de focus op de nieuwe h1; bij het eerste scherm niet', async () => {
  const { rerender } = render(shell('/', 'Home'));
  await nextFrame();
  expect(document.activeElement).toBe(document.body);

  rerender(shell('/admin/accounts', 'Accounts'));
  await nextFrame();
  expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Accounts' }));
});

test('een h1 die later verschijnt (lazy onderdeel) krijgt alsnog de focus', async () => {
  const { rerender } = render(shell('/', 'Home'));
  rerender(
    <AppShell nav={[]} userName="Ada Admin" menuItems={[]} routeKey="/b">
      <p>laden</p>
    </AppShell>,
  );
  await nextFrame();
  expect(document.activeElement).toBe(document.body);
  rerender(shell('/b', 'Later'));
  await act(async () => {
    await Promise.resolve();
  });
  expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Later' }));
});

test('een verborgen h1 van het oude scherm (Suspense, display: none) krijgt de focus niet', async () => {
  const { rerender } = render(shell('/', 'Home'));
  rerender(
    <AppShell nav={[]} userName="Ada Admin" menuItems={[]} routeKey="/b">
      <div style={{ display: 'none' }}>
        <PageHeader title="Home" />
      </div>
    </AppShell>,
  );
  await nextFrame();
  expect(document.activeElement).toBe(document.body);
  rerender(shell('/b', 'Later'));
  await act(async () => {
    await Promise.resolve();
  });
  expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Later' }));
});

test('wordt de gefocuste h1 vervangen (opnieuw renderen), dan krijgt de nieuwe h1 de focus', async () => {
  const { rerender } = render(shell('/', 'Home'));
  rerender(shell('/b', 'Later'));
  await nextFrame();
  expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Later' }));
  rerender(
    <AppShell nav={[]} userName="Ada Admin" menuItems={[]} routeKey="/b">
      <section>
        <PageHeader title="Later" />
      </section>
    </AppShell>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Later' }));
});

test('zonder h1 gaat de focus na het wachten naar main', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const { rerender } = render(
      <AppShell nav={[]} userName="Ada Admin" menuItems={[]} routeKey="/">
        <p>laden</p>
      </AppShell>,
    );
    rerender(
      <AppShell nav={[]} userName="Ada Admin" menuItems={[]} routeKey="/b">
        <p>laden</p>
      </AppShell>,
    );
    await nextFrame();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(document.activeElement).toBe(screen.getByRole('main'));
  } finally {
    vi.useRealTimers();
  }
});

test('de skip-link zet de focus op main, zonder fragment in de URL', () => {
  render(shell('/', 'Home'));
  const before = window.location.href;
  fireEvent.click(screen.getByRole('link', { name: 'Naar de inhoud' }));
  expect(document.activeElement).toBe(screen.getByRole('main'));
  expect(window.location.href).toBe(before);
});

test('een voorbeeld-PageHeader met documentTitle={false} laat de paginatitel staan', () => {
  render(
    <AppShell nav={[]} userName="Ada Admin" menuItems={[]} routeKey="/">
      <PageHeader title="Design system" />
      <PageHeader title="Accounts" documentTitle={false} />
    </AppShell>,
  );
  expect(document.title).toBe('Design system');
});

// Toasts: de schil rendert de Toaster zelf; een toast die binnen de schil via useToast wordt aangeroepen is zichtbaar.
function ToastButton() {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast.success('Wijziging opgeslagen');
      }}
    >
      Opslaan
    </button>
  );
}

test('een toast die binnen de schil via useToast wordt aangeroepen is zichtbaar', () => {
  render(
    <ToastProvider>
      <AppShell nav={[]} userName="Ada Admin" menuItems={[]} routeKey="/">
        <ToastButton />
      </AppShell>
    </ToastProvider>,
  );
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
  expect(screen.getByRole('status').textContent).toContain('Wijziging opgeslagen');
});
