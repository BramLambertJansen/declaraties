import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, beforeAll, afterEach, expect, test, vi } from 'vitest';
import { Combobox } from './combobox.tsx';

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true });
});
afterAll(() => {
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});
afterEach(cleanup);

const options = [
  { value: 'user', label: 'Gebruiker' },
  { value: 'off', label: 'Uitgeschakeld', disabled: true },
  { value: 'admin', label: 'Beheerder' },
];

function Example() {
  const [value, setValue] = useState('user');
  return (
    <Combobox
      aria-label="Rol"
      value={value}
      onValueChange={setValue}
      options={options}
      clearable
      clearLabel="Keuze wissen"
      emptyText="Geen resultaten."
    />
  );
}

// ui-collections/AC-2, ui-collections/AC-3
test('AC-2/3: filteren en annuleren behouden keuze; expliciet kiezen en wissen wijzigen haar', () => {
  render(<Example />);
  const input = screen.getByRole('combobox', { name: 'Rol' });
  fireEvent.focus(input);
  expect(screen.getAllByRole('option')).toHaveLength(3);
  fireEvent.change(input, { target: { value: '  BEHEER  ' } });
  expect(screen.getAllByRole('option')).toHaveLength(1);
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.getByDisplayValue('Gebruiker')).toBe(input);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'beheer' } });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByDisplayValue('Beheerder')).toBe(input);
  expect(input.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Keuze wissen' }));
  expect(screen.getByDisplayValue('')).toBe(input);
  expect(document.activeElement).toBe(input);
});

// ui-collections/AC-3, ui-collections/AC-4
test('AC-3/4: pijlen slaan disabled over, blijven aan randen en behouden inputfocus', () => {
  render(<Example />);
  const input = screen.getByRole('combobox');
  input.focus();
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  const active = input.getAttribute('aria-activedescendant');
  expect(active).toBe(screen.getByRole('option', { name: 'Beheerder' }).id);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(input.getAttribute('aria-activedescendant')).toBe(active);
  expect(document.activeElement).toBe(input);
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Gebruiker' }).id);
});

// ui-collections/AC-3
test('AC-3: Enter tijdens IME kiest niet en expliciet kiezen submit niet', () => {
  const change = vi.fn();
  const submit = vi.fn((event: React.SubmitEvent) => {
    event.preventDefault();
  });
  render(
    <form onSubmit={submit}>
      <Combobox aria-label="Rol" value="" onValueChange={change} options={options} />
    </form>,
  );
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(change).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(change).toHaveBeenCalledWith('user');
  expect(submit).not.toHaveBeenCalled();
});

// ui-collections/AC-2, ui-collections/AC-3
test.each(['Tab', 'Escape'])('AC-2/3: %s verwerpt zoektekst zonder commit', (key) => {
  const change = vi.fn();
  render(<Combobox aria-label="Rol" value="user" onValueChange={change} options={options} />);
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'beheer' } });
  fireEvent.keyDown(input, { key });
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue('Gebruiker')).toBe(input);
});

// ui-collections/AC-3
test('AC-3: pointer kiest enabled optie en disabled control opent of wist niet', () => {
  const change = vi.fn();
  const { rerender } = render(<Combobox aria-label="Rol" value="user" onValueChange={change} options={options} />);
  fireEvent.focus(screen.getByRole('combobox'));
  fireEvent.click(screen.getByRole('option', { name: 'Uitgeschakeld' }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.pointerDown(screen.getByRole('option', { name: 'Beheerder' }), { pointerType: 'touch' });
  fireEvent.click(screen.getByRole('option', { name: 'Beheerder' }));
  expect(change).toHaveBeenCalledWith('admin');
  change.mockClear();
  rerender(
    <Combobox
      aria-label="Rol"
      value="user"
      onValueChange={change}
      options={options}
      disabled
      clearable
      clearLabel="Keuze wissen"
    />,
  );
  expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(true);
  fireEvent.focus(screen.getByRole('combobox'));
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
  expect(screen.queryByRole('listbox')).toBeNull();
  const clear = screen.queryByRole('button', { name: 'Keuze wissen' });
  if (clear) fireEvent.click(clear);
  expect(change).not.toHaveBeenCalled();
});

// ui-collections/AC-4
test('AC-4: opties wijzigen verwijdert actieve ids zonder een vervangende keuze', () => {
  const change = vi.fn();
  const { rerender } = render(
    <Combobox
      aria-label="Rol"
      value="user"
      onValueChange={change}
      options={options}
      placeholder="Kies"
      emptyText="Geen resultaten."
    />,
  );
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  rerender(
    <Combobox
      aria-label="Rol"
      value="user"
      onValueChange={change}
      options={[]}
      placeholder="Kies"
      emptyText="Geen resultaten."
    />,
  );
  expect(screen.queryByRole('option')).toBeNull();
  expect(input.getAttribute('aria-activedescendant') || null).toBeNull();
  expect(screen.getByText('Geen resultaten.')).toBeDefined();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByPlaceholderText('Kies')).toBe(input);
  expect(screen.getByDisplayValue('')).toBe(input);
});

// ui-collections/AC-4
test('AC-4: twee instanties hebben unieke popupids en benoemde listbox', () => {
  render(
    <>
      <Example />
      <Example />
    </>,
  );
  const inputs = screen.getAllByRole('combobox');
  const ids = inputs.map((input) => {
    fireEvent.focus(input);
    const popup = screen.getByRole('listbox', { name: 'Rol' });
    expect(input.getAttribute('aria-controls')).toBe(popup.id);
    expect(screen.getByRole('option', { name: 'Gebruiker' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'Escape' });
    return popup.id;
  });
  expect(new Set(ids).size).toBe(2);
});

// ui-collections/AC-2, ui-collections/AC-4
test('AC-2/4: buitenklik herstelt het gekozen label zonder commit; geen matches krijgt geen actieve optie', () => {
  const change = vi.fn();
  render(
    <Combobox aria-label="Rol" value="user" onValueChange={change} options={options} emptyText="Geen resultaten." />,
  );
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'onbekend' } });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(input.getAttribute('aria-activedescendant')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('Geen resultaten.');
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(screen.getByDisplayValue('Gebruiker')).toBe(input);
  expect(change).not.toHaveBeenCalled();
});

// ui-collections/AC-3, ui-collections/AC-4
test('AC-3/4: uitsluitend disabled opties blijven niet selecteerbaar, ook na pijlen en Enter', () => {
  const change = vi.fn();
  render(
    <Combobox
      aria-label="Rol"
      value=""
      onValueChange={change}
      options={[{ value: 'off', label: 'Uitgeschakeld', disabled: true }]}
    />,
  );
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input.getAttribute('aria-activedescendant')).toBeNull();
  expect(change).not.toHaveBeenCalled();
});

test.each([
  { invalid: [{ value: '', label: 'Leeg' }] },
  {
    invalid: [
      { value: 'same', label: 'Eén' },
      { value: 'same', label: 'Twee' },
    ],
  },
])('AC-4: lege of dubbele optionvalues worden expliciet geweigerd', ({ invalid }) => {
  expect(() =>
    render(<Combobox aria-label="Rol" value="" options={invalid} onValueChange={() => undefined} />),
  ).toThrow('Combobox option values must be unique and non-empty');
});
