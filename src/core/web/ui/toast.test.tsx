import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Toaster, ToastProvider, useToast } from './toast.tsx';

// Toast (roadmap "Toasts standaard in de basiskit"): context zonder globale store, success beleefd (status), error direct (alert),
// sluitknop 'Sluiten', succes verdwijnt na 5 s, een fout blijft tot de gebruiker sluit (WCAG 2.2.1), de timer pauzeert bij hover en
// focus, maximaal 3 tegelijk.
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

test('een succes-toast toont de tekst in role=status (impliciet polite)', () => {
  setup();
  fire('succes');
  const toast = screen.getByRole('status');
  expect(toast.textContent).toContain('Opgeslagen');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('een fout-toast toont de tekst in role=alert (impliciet assertive)', () => {
  setup();
  fire('fout');
  const toast = screen.getByRole('alert');
  expect(toast.textContent).toContain('Opslaan mislukt');
  expect(screen.queryByRole('status')).toBeNull();
});

// NVDA kondigt een melding dubbel aan als een role=status/alert binnen een aria-live-container staat (de rol is zelf al een
// live-regio). De rol zit daarom alleen op de kaart; geen container, voorouder of kind erboven of eronder heeft aria-live.
test('geen aria-live rond of in een toast: de rol van de kaart is de enige live-regio (geen dubbele aankondiging)', () => {
  const { container } = setup();
  fire('succes');
  fire('fout');
  expect(container.querySelectorAll('[aria-live]')).toHaveLength(0);
  expect(screen.getByRole('status').closest('[aria-live]')).toBeNull();
  expect(screen.getByRole('alert').closest('[aria-live]')).toBeNull();
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

test('een fout-toast verdwijnt niet vanzelf: hij blijft tot de gebruiker hem sluit', () => {
  setup();
  fire('fout');
  act(() => {
    vi.advanceTimersByTime(10 * 60 * 1000);
  });
  expect(screen.getByText('Opslaan mislukt')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }));
  expect(screen.queryByText('Opslaan mislukt')).toBeNull();
});

test('een succes-toast pauzeert zolang de muis erboven staat en loopt daarna verder met de rest van de tijd', () => {
  setup();
  fire('succes');
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  const toast = screen.getByRole('status');
  fireEvent.mouseEnter(toast);
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(screen.getByText('Opgeslagen')).toBeTruthy();

  fireEvent.mouseLeave(toast);
  act(() => {
    vi.advanceTimersByTime(1999);
  });
  expect(screen.getByText('Opgeslagen')).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.queryByText('Opgeslagen')).toBeNull();
});

test('een succes-toast pauzeert zolang er focus in staat en loopt daarna verder', () => {
  setup();
  fire('succes');
  act(() => {
    vi.advanceTimersByTime(4000);
  });
  const close = screen.getByRole('button', { name: 'Sluiten' });
  fireEvent.focus(close);
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(screen.getByText('Opgeslagen')).toBeTruthy();

  fireEvent.blur(close);
  act(() => {
    vi.advanceTimersByTime(999);
  });
  expect(screen.getByText('Opgeslagen')).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.queryByText('Opgeslagen')).toBeNull();
});

test('pauze door hover én focus: pas als beide weg zijn loopt de tijd verder', () => {
  setup();
  fire('succes');
  const toast = screen.getByRole('status');
  const close = screen.getByRole('button', { name: 'Sluiten' });
  fireEvent.mouseEnter(toast);
  fireEvent.focus(close);
  fireEvent.mouseLeave(toast);
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(screen.getByText('Opgeslagen')).toBeTruthy();

  fireEvent.blur(close);
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(screen.queryByText('Opgeslagen')).toBeNull();
});

test('een toast die tijdens de pauze sluit, houdt de andere toasts niet vast', () => {
  setup();
  fire('succes');
  fire('fout');
  const [closeSuccess] = screen.getAllByRole('button', { name: 'Sluiten' });
  if (closeSuccess === undefined) throw new Error('sluitknop ontbreekt');
  fireEvent.focus(closeSuccess);
  fireEvent.click(closeSuccess);
  expect(screen.queryByText('Opgeslagen')).toBeNull();

  fire('succes');
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(screen.queryByText('Opgeslagen')).toBeNull();
});

test('een toast die door het maximum wegvalt terwijl de muis erop staat, houdt de timers niet vast', () => {
  setup();
  fire('succes');
  fireEvent.mouseEnter(screen.getByRole('status'));
  fire('fout');
  fire('fout');
  fire('fout');
  expect(screen.queryByRole('status')).toBeNull();

  fire('succes');
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(screen.queryByRole('status')).toBeNull();
});

test('focus die binnen dezelfde toast blijft, geeft de pauze niet vrij', () => {
  setup();
  fire('succes');
  const toast = screen.getByRole('status');
  const close = screen.getByRole('button', { name: 'Sluiten' });
  fireEvent.focus(close);
  fireEvent.blur(close, { relatedTarget: toast });
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(screen.getByText('Opgeslagen')).toBeTruthy();

  fireEvent.blur(close, { relatedTarget: null });
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(screen.queryByText('Opgeslagen')).toBeNull();
});

test('een nieuwe succes-toast tijdens een pauze start pas als de pauze eindigt', () => {
  setup();
  fire('succes');
  const toast = screen.getByRole('status');
  fireEvent.mouseEnter(toast);
  fire('succes');
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(screen.getAllByText('Opgeslagen')).toHaveLength(2);

  fireEvent.mouseLeave(toast);
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(screen.queryByText('Opgeslagen')).toBeNull();
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
