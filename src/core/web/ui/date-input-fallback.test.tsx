import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { DateInput } from './date-input.tsx';

const original = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'showPicker');
afterEach(() => {
  cleanup();
  if (original === undefined) Reflect.deleteProperty(HTMLInputElement.prototype, 'showPicker');
  else Object.defineProperty(HTMLInputElement.prototype, 'showPicker', original);
});

test('datumkiezer-fallback/AC-1: zonder showPicker blijft de native kalender beschikbaar zonder loze knop', () => {
  Object.defineProperty(HTMLInputElement.prototype, 'showPicker', { configurable: true, value: undefined });
  render(<DateInput aria-label="Datum" />);
  expect(screen.queryByRole('button', { name: 'Kalender openen' })).toBeNull();
  expect(screen.getByLabelText('Datum').className).not.toContain('calendar-picker-indicator');
});

test('datumkiezer-fallback/AC-2: geweigerde showPicker herstelt native bediening en behoudt waarde en focus', () => {
  const showPicker = vi.fn(() => {
    throw new DOMException('unsupported', 'NotSupportedError');
  });
  Object.defineProperty(HTMLInputElement.prototype, 'showPicker', { configurable: true, value: showPicker });
  render(<DateInput aria-label="Datum" defaultValue="2026-10-20" />);
  fireEvent.click(screen.getByRole('button', { name: 'Kalender openen' }));
  expect(showPicker).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Kalender openen' })).toBeNull();
  const input = screen.getByLabelText('Datum');
  expect(input.className).not.toContain('calendar-picker-indicator');
  expect(input.getAttribute('value')).toBe('2026-10-20');
  expect(document.activeElement).toBe(input);
});
