import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useLayoutEffect, useRef } from 'react';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { Combobox, type ComboboxProps } from './combobox.tsx';

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true });
});
afterAll(() => {
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});
afterEach(cleanup);

const options = [
  { value: 'user', label: 'Gebruiker' },
  { value: 'admin', label: 'Beheerder' },
];

function ParentFocusCombobox(props: ComboboxProps) {
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    input.current?.focus();
  }, []);
  return <Combobox {...props} ref={input} />;
}

// ui-collections/AC-2, ui-collections/AC-4: focus opent zonder een keuze te wijzigen.
test.each([false, true])('autofocus bij mount houdt de popup open (StrictMode: %s)', (strict) => {
  const change = vi.fn();
  const combobox = <Combobox autoFocus aria-label="Rol" value="user" onValueChange={change} options={options} />;
  render(strict ? <StrictMode>{combobox}</StrictMode> : combobox);

  const input = screen.getByRole('combobox', { name: 'Rol' });
  expect(document.activeElement).toBe(input);
  expect(change).not.toHaveBeenCalled();
  expect(input.getAttribute('aria-expanded')).toBe('true');
  expect(input.getAttribute('aria-controls')).toBe(screen.getByRole('listbox', { name: 'Rol' }).id);
  expect(screen.getAllByRole('option')).toHaveLength(2);
  expect(screen.getByRole('option', { name: 'Gebruiker' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByDisplayValue('Gebruiker')).toBe(input);
});

test('focus vanuit het layout-effect van de ouder opent bij mount in StrictMode', () => {
  const change = vi.fn();
  render(
    <StrictMode>
      <ParentFocusCombobox aria-label="Rol" value="user" onValueChange={change} options={options} />
    </StrictMode>,
  );

  const input = screen.getByRole('combobox', { name: 'Rol' });
  expect(document.activeElement).toBe(input);
  expect(change).not.toHaveBeenCalled();
  expect(input.getAttribute('aria-expanded')).toBe('true');
  expect(input.getAttribute('aria-controls')).toBe(screen.getByRole('listbox', { name: 'Rol' }).id);
  expect(screen.getAllByRole('option')).toHaveLength(2);
});

// ui-collections/AC-2, ui-collections/AC-3: annuleren blijft geldig zolang de input focus houdt.
test('Escape houdt de popup dicht na een rerender met dezelfde props', () => {
  const change = vi.fn();
  const props = { 'aria-label': 'Rol', value: 'user', onValueChange: change, options };
  const view = render(<Combobox {...props} />);
  const input = screen.getByRole('combobox');
  act(() => {
    input.focus();
  });
  expect(screen.getByRole('listbox')).toBeDefined();
  fireEvent.change(input, { target: { value: 'beheer' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  view.rerender(<Combobox {...props} />);

  expect(document.activeElement).toBe(input);
  expect(input.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(screen.getByDisplayValue('Gebruiker')).toBe(input);
  expect(change).not.toHaveBeenCalled();
});

// ui-collections/AC-2, ui-collections/AC-3, ui-collections/AC-4: oudersynchronisatie sluit en annuleert.
test.each([
  { name: 'value', update: { value: 'admin' }, label: 'Beheerder' },
  { name: 'resetKey', update: { resetKey: 1 }, label: 'Gebruiker' },
  { name: 'disabled', update: { disabled: true }, label: 'Gebruiker' },
  { name: 'readOnly', update: { readOnly: true }, label: 'Gebruiker' },
])('een latere $name-wijziging sluit de popup en verwerpt zoektekst', ({ update, label }) => {
  const change = vi.fn();
  const props = { 'aria-label': 'Rol', value: 'user', onValueChange: change, options };
  const view = render(<Combobox {...props} />);
  const input = screen.getByRole('combobox');
  act(() => {
    input.focus();
  });
  fireEvent.change(input, { target: { value: 'beheer' } });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(screen.getByRole('listbox')).toBeDefined();
  expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Beheerder' }).id);

  view.rerender(<Combobox {...props} {...update} />);

  expect(input.getAttribute('aria-expanded')).toBe('false');
  expect(input.getAttribute('aria-activedescendant')).toBeNull();
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(screen.getByDisplayValue(label)).toBe(input);
  expect(change).not.toHaveBeenCalled();
});
