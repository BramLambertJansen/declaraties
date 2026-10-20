import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { DateInput } from './date-input.tsx';

afterEach(cleanup);

test('de losse kalenderknop opent alleen zijn eigen datumveld en verstuurt het formulier niet', () => {
  const first = createRef<HTMLInputElement>();
  const second = createRef<HTMLInputElement>();
  const submit = vi.fn();
  const firstPicker = vi.fn();
  const secondPicker = vi.fn();
  render(
    <form onSubmit={submit}>
      <DateInput ref={first} aria-label="Begindatum" pickerLabel="Beginkalender openen" />
      <DateInput ref={second} aria-label="Einddatum" pickerLabel="Eindkalender openen" />
    </form>,
  );
  Object.defineProperty(first.current, 'showPicker', { value: firstPicker });
  Object.defineProperty(second.current, 'showPicker', { value: secondPicker });
  const button = screen.getByRole('button', { name: 'Eindkalender openen' });
  expect(button.getAttribute('aria-controls')).toBe(second.current?.id);
  expect(first.current?.id).not.toBe(second.current?.id);
  fireEvent.click(button);
  expect(secondPicker).toHaveBeenCalledOnce();
  expect(firstPicker).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(second.current);
  expect(submit).not.toHaveBeenCalled();
});

test.each([{ disabled: true }, { readOnly: true }])(
  'een vergrendeld datumveld blokkeert de kalenderknop: %o',
  (state) => {
    const ref = createRef<HTMLInputElement>();
    const picker = vi.fn();
    render(<DateInput ref={ref} aria-label="Datum" {...state} />);
    Object.defineProperty(ref.current, 'showPicker', { value: picker });
    const button = screen.getByRole('button', { name: 'Kalender openen' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(picker).not.toHaveBeenCalled();
  },
);

test.each([
  undefined,
  () => {
    throw new DOMException('Picker unavailable', 'NotAllowedError');
  },
])('een ontbrekende of geweigerde browserpicker laat handmatige invoer bruikbaar', (showPicker) => {
  const ref = createRef<HTMLInputElement>();
  const change = vi.fn();
  render(<DateInput ref={ref} aria-label="Datum" onChange={change} />);
  Object.defineProperty(ref.current, 'showPicker', { value: showPicker });
  fireEvent.click(screen.getByRole('button', { name: 'Kalender openen' }));
  expect(document.activeElement).toBe(ref.current);
  fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2026-10-20' } });
  expect(ref.current?.value).toBe('2026-10-20');
  expect(change).toHaveBeenCalledOnce();
});
