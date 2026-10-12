import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Toaster, ToastProvider, useToast } from './toast.tsx';

// Toast (roadmap "Toasts standaard in de basiskit"): context zonder globale store, success beleefd (status), error direct (alert),
// sluitknop 'Sluiten', automatisch weg na 5 s (succes) of 8 s (fout), maximaal 3 tegelijk.
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function Trigger() {
  const toast = useToast();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          toast.success('Opgeslagen');
        }}
      >
        succes
      </button>
      <button
        type="button"
        onClick={() => {
          toast.error('Opslaan mislukt');
        }}
      >
        fout
      </button>
    </>
  );
}

function setup() {
  return render(
    <ToastProvider>
      <Trigger />
      <Toaster />
    </ToastProvider>,
  );
}

function fire(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

test('useToast buiten een ToastProvider gooit een duidelijke fout', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(() => render(<Trigger />)).toThrow(/ToastProvider/);
});

test('een succes-toast toont de tekst in role=status met aria-live polite', () => {
  setup();
  fire('succes');
  const toast = screen.getByRole('status');
  expect(toast.textContent).toContain('Opgeslagen');
  expect(toast.closest('[aria-live]')?.getAttribute('aria-live')).toBe('polite');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('een fout-toast toont de tekst in role=alert met aria-live assertive', () => {
  setup();
  fire('fout');
  const toast = screen.getByRole('alert');
  expect(toast.textContent).toContain('Opslaan mislukt');
  expect(toast.closest('[aria-live]')?.getAttribute('aria-live')).toBe('assertive');
  expect(screen.queryByRole('status')).toBeNull();
});

test('zonder toast is er geen melding in de regio', () => {
  setup();
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('elke toast heeft een sluitknop "Sluiten" die alleen die toast verwijdert', () => {
  setup();
  fire('succes');
  fire('fout');
  const status = screen.getByRole('status');
  const close = status.querySelector('button');
  expect(close?.getAttribute('aria-label') ?? close?.textContent).toBe('Sluiten');
  expect(screen.getAllByRole('button', { name: 'Sluiten' })).toHaveLength(2);

  fireEvent.click(screen.getAllByRole('button', { name: 'Sluiten' })[0] ?? status);
  expect(screen.queryByText('Opgeslagen')).toBeNull();
  expect(screen.getByText('Opslaan mislukt')).toBeTruthy();
});

test('een succes-toast verdwijnt na 5 s, niet eerder', () => {
  setup();
  fire('succes');
  act(() => {
    vi.advanceTimersByTime(4999);
  });
  expect(screen.getByText('Opgeslagen')).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.queryByText('Opgeslagen')).toBeNull();
});

test('een fout-toast verdwijnt na 8 s, niet eerder', () => {
  setup();
  fire('fout');
  act(() => {
    vi.advanceTimersByTime(7999);
  });
  expect(screen.getByText('Opslaan mislukt')).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.queryByText('Opslaan mislukt')).toBeNull();
});

test('meerdere toasts stapelen', () => {
  setup();
  fire('succes');
  fire('fout');
  expect(screen.getByText('Opgeslagen')).toBeTruthy();
  expect(screen.getByText('Opslaan mislukt')).toBeTruthy();
});

function Burst() {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast.success('een');
        toast.success('twee');
        toast.error('drie');
        toast.success('vier');
      }}
    >
      burst
    </button>
  );
}

test('maximaal 3 toasts tegelijk: de oudste valt weg', () => {
  render(
    <ToastProvider>
      <Burst />
      <Toaster />
    </ToastProvider>,
  );
  fire('burst');
  expect(screen.queryByText('een')).toBeNull();
  expect(screen.getByText('twee')).toBeTruthy();
  expect(screen.getByText('drie')).toBeTruthy();
  expect(screen.getByText('vier')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Sluiten' })).toHaveLength(3);
});
