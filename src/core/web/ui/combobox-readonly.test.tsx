import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { Combobox } from './combobox.tsx';

beforeAll(() => Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }));
afterAll(() => {
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});
afterEach(cleanup);

test('readOnly blijft focusbaar maar kiezen, typen en wissen wijzigen niets', () => {
  const change = vi.fn();
  render(
    <Combobox
      readOnly
      aria-label="Keuze"
      value="a"
      onValueChange={change}
      options={[
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
      ]}
      clearable
      clearLabel="Wissen"
    />,
  );
  const input = screen.getByRole('combobox');
  input.focus();
  fireEvent.click(input);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.change(input, { target: { value: 'Beta' } });
  fireEvent.click(screen.getByRole('button', { name: 'Wissen' }));
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue('Alpha')).toBe(input);
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(document.activeElement).toBe(input);
});

test('readOnly aanzetten sluit een open keuzelijst', () => {
  const props = {
    'aria-label': 'Keuze',
    value: 'a',
    onValueChange: vi.fn(),
    options: [{ value: 'a', label: 'Alpha' }],
  };
  const view = render(<Combobox {...props} />);
  fireEvent.focus(screen.getByRole('combobox'));
  expect(screen.getByRole('listbox')).toBeTruthy();
  view.rerender(<Combobox {...props} readOnly />);
  expect(screen.queryByRole('listbox')).toBeNull();
});
