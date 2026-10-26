import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode, useEffect, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Toaster, ToastProvider, useToast } from './toast.tsx';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function EffectToast({ message, error = false }: { readonly message: string; readonly error?: boolean }) {
  const toast = useToast();
  const announced = useRef(false);
  useEffect(() => {
    // De caller voegt dezelfde melding ook bij StrictMode-effectrepetitie maar eenmaal toe.
    if (announced.current) return;
    announced.current = true;
    if (error) toast.error(message);
    else toast.success(message);
  }, [toast, message, error]);
  return null;
}

function Fixture({
  initialSuccess,
  initialError,
}: {
  readonly initialSuccess: boolean;
  readonly initialError: boolean;
}) {
  const [first, setFirst] = useState(initialSuccess);
  const [second, setSecond] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFirst(true);
        }}
      >
        eerste melding
      </button>
      <button
        type="button"
        onClick={() => {
          setSecond(true);
        }}
      >
        latere melding
      </button>
      {first && <EffectToast message="Eerste resultaat" />}
      {second && <EffectToast message="Later resultaat" />}
      {initialError && <EffectToast message="Actie mislukt" error />}
    </>
  );
}

function setup({
  strict,
  initialSuccess = false,
  initialError = false,
}: {
  readonly strict: boolean;
  readonly initialSuccess?: boolean;
  readonly initialError?: boolean;
}) {
  const content = (
    <ToastProvider>
      <Fixture initialSuccess={initialSuccess} initialError={initialError} />
      <Toaster />
    </ToastProvider>
  );
  render(strict ? <StrictMode>{content}</StrictMode> : content);
}

function advance(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

function announce(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}

describe.each([
  { mode: 'zonder StrictMode', strict: false },
  { mode: 'met StrictMode', strict: true },
])('toast vanuit een effect $mode', ({ strict }) => {
  test('succes bij de eerste mount blijft 4999 ms zichtbaar en verdwijnt op 5000 ms', () => {
    setup({ strict, initialSuccess: true });
    expect(screen.getAllByRole('status')).toHaveLength(1);
    advance(4999);
    expect(screen.getByText('Eerste resultaat')).toBeTruthy();
    advance(1);
    expect(screen.queryByText('Eerste resultaat')).toBeNull();
  });

  test('een later gemount effect herstart de afteller van een eerdere effectmelding niet', () => {
    setup({ strict });
    announce('eerste melding');
    advance(2000);
    announce('latere melding');
    advance(2999);
    expect(screen.getByText('Eerste resultaat')).toBeTruthy();
    expect(screen.getByText('Later resultaat')).toBeTruthy();
    advance(1);
    expect(screen.queryByText('Eerste resultaat')).toBeNull();
    expect(screen.getByText('Later resultaat')).toBeTruthy();
    advance(1999);
    expect(screen.getByText('Later resultaat')).toBeTruthy();
    advance(1);
    expect(screen.queryByText('Later resultaat')).toBeNull();
  });

  test('hover en focus bewaren actieve tijd, ook voor een nieuwe effectmelding tijdens de pauze', () => {
    setup({ strict });
    announce('eerste melding');
    advance(2000);
    const first = screen.getByRole('status');
    const close = within(first).getByRole('button', { name: 'Sluiten' });
    fireEvent.mouseEnter(first);
    fireEvent.focus(close);
    announce('latere melding');
    advance(60_000);
    expect(screen.getByText('Eerste resultaat')).toBeTruthy();
    expect(screen.getByText('Later resultaat')).toBeTruthy();
    fireEvent.mouseLeave(first);
    advance(60_000);
    expect(screen.getByText('Eerste resultaat')).toBeTruthy();
    fireEvent.blur(close);
    advance(2999);
    expect(screen.getByText('Eerste resultaat')).toBeTruthy();
    advance(1);
    expect(screen.queryByText('Eerste resultaat')).toBeNull();
    expect(screen.getByText('Later resultaat')).toBeTruthy();
    advance(1999);
    expect(screen.getByText('Later resultaat')).toBeTruthy();
    advance(1);
    expect(screen.queryByText('Later resultaat')).toBeNull();
  });

  test('een fout uit het eerste mount-effect blijft na succesverval tot expliciet sluiten staan', () => {
    setup({ strict, initialError: true });
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    announce('eerste melding');
    advance(5000);
    expect(screen.queryByText('Eerste resultaat')).toBeNull();
    advance(10 * 60 * 1000);
    const error = screen.getByRole('alert');
    expect(error.textContent).toContain('Actie mislukt');
    fireEvent.click(within(error).getByRole('button', { name: 'Sluiten' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
