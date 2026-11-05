import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ListToolbar } from './list-toolbar.tsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function toolbar(query: string, onQueryChange: (query: string) => void) {
  return (
    <ListToolbar
      searchLabel="Zoeken"
      query={query}
      onQueryChange={onQueryChange}
      sortLabel="Sortering"
      sort="naam"
      sortOptions={[{ value: 'naam', label: 'Naam' }]}
      onSortChange={vi.fn()}
      onClear={vi.fn()}
    />
  );
}

test('Terug tijdens de debounce herstelt de query en annuleert achterhaalde invoer', async () => {
  vi.useFakeTimers();
  const change = vi.fn();
  const view = render(toolbar('eerste', change));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'tweede' } });
  view.rerender(toolbar('terug', change));
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue('terug')).toBeTruthy();
});

test('bevestiging van de vorige invoer annuleert verder typen niet', async () => {
  vi.useFakeTimers();
  const change = vi.fn();
  const view = render(toolbar('', change));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ada ' } });
  await act(() => vi.advanceTimersByTimeAsync(300));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ada l' } });
  view.rerender(toolbar('ada', change));
  await act(() => vi.advanceTimersByTimeAsync(300));
  expect(change.mock.calls).toEqual([['ada '], ['ada l']]);
  expect(screen.getByDisplayValue('ada l')).toBeTruthy();
});
