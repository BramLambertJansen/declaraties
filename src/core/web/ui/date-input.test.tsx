import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { DateInput } from './date-input.tsx';

afterEach(cleanup);

test('native datumveld behoudt YYYY-MM-DD, lege invoer, ref, focus, grenzen en toegankelijkheidsattributen', () => {
  const ref = createRef<HTMLInputElement>();
  const change = vi.fn();
  const blur = vi.fn();
  render(
    <DateInput
      ref={ref}
      aria-label="Datum"
      name="date"
      defaultValue="2026-10-20"
      min="2026-10-01"
      max="2026-10-31"
      step="2"
      onChange={change}
      onBlur={blur}
      aria-invalid
      aria-describedby="error"
    />,
  );
  const input = screen.getByLabelText('Datum');
  expect(ref.current).toBe(input);
  expect(ref.current?.type).toBe('date');
  expect(ref.current?.value).toBe('2026-10-20');
  expect(ref.current?.validity.stepMismatch).toBe(true);
  fireEvent.change(input, { target: { value: '2026-09-30' } });
  expect(change).toHaveBeenCalledOnce();
  expect(ref.current?.validity.rangeUnderflow).toBe(true);
  fireEvent.change(input, { target: { value: '2026-11-01' } });
  expect(ref.current?.validity.rangeOverflow).toBe(true);
  fireEvent.change(input, { target: { value: '' } });
  expect(ref.current?.value).toBe('');
  ref.current?.focus();
  expect(document.activeElement).toBe(input);
  fireEvent.blur(input);
  expect(blur).toHaveBeenCalledOnce();
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(input.getAttribute('aria-describedby')).toBe('error');
});

test('disabled en readOnly blijven native eigenschappen', () => {
  render(<DateInput aria-label="Datum" disabled readOnly />);
  const input = screen.getByLabelText('Datum');
  expect(input.hasAttribute('disabled')).toBe(true);
  expect(input.hasAttribute('readonly')).toBe(true);
});
