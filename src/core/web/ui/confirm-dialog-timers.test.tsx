import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog.tsx';

const originals = new Map(
  ['showModal', 'close'].map((name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)]),
);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
afterAll(() => {
  for (const [name, original] of originals) {
    if (original === undefined) Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    else Object.defineProperty(HTMLDialogElement.prototype, name, original);
  }
});

function show() {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Bevestigen?',
    description: 'Deze actie wordt uitgevoerd.',
    confirmLabel: 'Uitvoeren',
    onConfirm: vi.fn(),
  };
  return { ...render(<ConfirmDialog {...props} />), props };
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}
function confirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Uitvoeren' }));
}

test('de timer van een vorige opening heft de nieuwe dubbelklikbeveiliging niet op', () => {
  const { rerender, props } = show();
  confirm();
  advance(100);
  rerender(<ConfirmDialog {...props} open={false} />);
  advance(100);
  rerender(<ConfirmDialog {...props} />);
  confirm();
  advance(300);
  confirm();
  expect(props.onConfirm).toHaveBeenCalledTimes(2);
  advance(200);
  confirm();
  expect(props.onConfirm).toHaveBeenCalledTimes(3);
});

test('opnieuw proberen na een snelle fout krijgt een eigen volledige wachttijd', () => {
  const { rerender, props } = show();
  confirm();
  advance(100);
  rerender(<ConfirmDialog {...props} busy />);
  advance(100);
  rerender(<ConfirmDialog {...props} busy={false} />);
  confirm();
  advance(300);
  confirm();
  expect(props.onConfirm).toHaveBeenCalledTimes(2);
  advance(200);
  confirm();
  expect(props.onConfirm).toHaveBeenCalledTimes(3);
});

test('verwijderen van de dialoog ruimt de retrytimer op', () => {
  const { unmount } = show();
  const baseline = vi.getTimerCount();
  confirm();
  expect(vi.getTimerCount()).toBe(baseline + 1);
  unmount();
  expect(vi.getTimerCount()).toBe(baseline);
});
