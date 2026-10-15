import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { ListToolbar, type ListToolbarProps } from './list-toolbar.tsx';

function props(): ListToolbarProps {
  return {
    searchLabel: 'Zoeken',
    query: '',
    onQueryChange: vi.fn(),
    sortLabel: 'Sorteren',
    sort: 'naam',
    sortOptions: [{ value: 'naam', label: 'Naam' }],
    onSortChange: vi.fn(),
    onClear: vi.fn(),
    showActiveFilters: true,
    filters: [
      {
        id: 'zoeken',
        label: 'Rol',
        value: '',
        searchable: true,
        onChange: vi.fn(),
        options: [
          { value: '', label: 'Alle rollen' },
          { value: 'admin', label: 'Beheerder' },
          { value: 'off', label: 'Uitgeschakeld', disabled: true },
        ],
      },
    ],
  };
}
const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  if (scroll === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  else Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scroll);
});
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test('searchable adapter gebruikt lege optie als placeholder en respecteert disabled opties', () => {
  const base = props();
  const onChange = vi.fn();
  render(<ListToolbar {...base} filters={(base.filters ?? []).map((filter) => ({ ...filter, onChange }))} />);
  const field = screen.getByRole('combobox', { name: 'Rol' });
  expect(field.getAttribute('placeholder')).toBe('Alle rollen');
  fireEvent.keyDown(field, { key: 'ArrowDown' });
  expect(screen.queryByRole('option', { name: 'Alle rollen' })).toBeNull();
  expect(screen.getByRole('option', { name: 'Uitgeschakeld' }).getAttribute('aria-disabled')).toBe('true');
  fireEvent.keyDown(field, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith('admin');
});

test('filterchip wist alleen eigen waarde, onbekende waarden blijven leesbaar en focus keert terug', () => {
  const base = props();
  const onChange = vi.fn();
  render(
    <ListToolbar
      {...base}
      filters={(base.filters ?? []).map((filter) => ({ ...filter, value: 'onbekend', onChange }))}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Verwijder Rol: onbekend' }));
  expect(onChange).toHaveBeenCalledWith('');
  expect(base.onQueryChange).not.toHaveBeenCalled();
  expect(base.onSortChange).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Rol' }));
});

test('zoekchip annuleert pending debounce en roept eenmaal de lege waarde aan', async () => {
  const base = props();
  const onQueryChange = vi.fn();
  const { rerender } = render(<ListToolbar {...base} query="Anna" onQueryChange={onQueryChange} />);
  fireEvent.change(screen.getByLabelText('Zoeken'), { target: { value: 'Anna nieuw' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verwijder Zoeken: Anna' }));
  rerender(<ListToolbar {...base} query="" onQueryChange={onQueryChange} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(onQueryChange).toHaveBeenCalledExactlyOnceWith('');
  expect(document.activeElement).toBe(screen.getByLabelText('Zoeken'));
  const input = screen.getByLabelText('Zoeken');
  expect(input instanceof HTMLInputElement && input.value).toBe('');
});

test('filter ids botsen niet met zoek/sorteerveld; lege/dubbele filterids falen', () => {
  const base = props();
  const { unmount } = render(
    <ListToolbar
      {...base}
      filters={[
        { id: 'zoeken', label: 'Zoekfilter', value: '', options: [], onChange: vi.fn() },
        { id: 'sorteren', label: 'Sorteerfilter', value: '', options: [], onChange: vi.fn() },
      ]}
    />,
  );
  const ids = Array.from(document.querySelectorAll('[id]'), (node) => node.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(screen.getByLabelText('Zoeken')).not.toBe(screen.getByLabelText('Zoekfilter'));
  unmount();
  const filter = { id: '', label: 'Leeg', value: '', options: [], onChange: vi.fn() };
  expect(() => render(<ListToolbar {...base} filters={[filter]} />)).toThrow();
  expect(() =>
    render(
      <ListToolbar
        {...base}
        filters={[
          { ...filter, id: 'dubbel' },
          { ...filter, id: 'dubbel' },
        ]}
      />,
    ),
  ).toThrow();
});
