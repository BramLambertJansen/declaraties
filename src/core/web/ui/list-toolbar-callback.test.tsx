import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ListToolbar, type ListToolbarProps } from './list-toolbar.tsx';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function props(overrides: Partial<ListToolbarProps> = {}): ListToolbarProps {
  return {
    searchLabel: 'Zoeken',
    query: '',
    onQueryChange: vi.fn(),
    sortLabel: 'Sorteren',
    sort: 'nieuwste',
    sortOptions: [
      { value: 'nieuwste', label: 'Nieuwste eerst' },
      { value: 'naam-az', label: 'Naam A–Z' },
    ],
    onSortChange: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
}

async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

// De ouder beheert de lijststaat; callbacks bewaren de overige waarden uit hun render.
function ControlledList() {
  const [search, setSearch] = useState({ query: '', sort: 'nieuwste' });
  return (
    <>
      <ListToolbar
        {...props()}
        {...search}
        onQueryChange={(query) => {
          setSearch({ ...search, query });
        }}
        onSortChange={(sort) => {
          setSearch({ ...search, sort });
        }}
      />
      <output aria-label="Lijststatus">{`${search.query} | ${search.sort}`}</output>
    </>
  );
}

test('zoeken behoudt de sortering die de ouder tijdens de debounce heeft gewijzigd', async () => {
  render(<ControlledList />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Ada' } });
  await advance(250);
  fireEvent.change(screen.getByLabelText('Sorteren'), { target: { value: 'naam-az' } });
  expect(screen.getByLabelText('Lijststatus').textContent).toBe(' | naam-az');

  await advance(50);

  expect(screen.getByLabelText('Lijststatus').textContent).toBe('Ada | naam-az');
  expect(screen.getByDisplayValue('Naam A–Z')).toBe(screen.getByLabelText('Sorteren'));
});

test('de laatste callback krijgt de invoer op de oorspronkelijke deadline van 300 ms', async () => {
  const previous = vi.fn();
  const latest = vi.fn();
  const view = render(<ListToolbar {...props({ onQueryChange: previous })} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Ada ' } });
  await advance(250);
  view.rerender(<ListToolbar {...props({ onQueryChange: latest })} />);
  await advance(49);
  expect(previous).not.toHaveBeenCalled();
  expect(latest).not.toHaveBeenCalled();

  await advance(1);
  expect(latest).toHaveBeenCalledExactlyOnceWith('Ada ');
  await advance(1000);
  expect(previous).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledTimes(1);
});

test('verder typen verstuurt alleen de laatste invoer naar de laatste callback', async () => {
  const previous = vi.fn();
  const latest = vi.fn();
  const view = render(<ListToolbar {...props({ onQueryChange: previous })} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'A' } });
  await advance(200);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Ada' } });
  await advance(250);
  view.rerender(<ListToolbar {...props({ onQueryChange: latest })} />);
  await advance(49);
  expect(previous).not.toHaveBeenCalled();
  expect(latest).not.toHaveBeenCalled();

  await advance(1);
  expect(latest).toHaveBeenCalledExactlyOnceWith('Ada');
  expect(previous).not.toHaveBeenCalled();
});

test('een externe querywijziging annuleert de invoer ook met een nieuwe callback', async () => {
  const previous = vi.fn();
  const latest = vi.fn();
  const view = render(<ListToolbar {...props({ onQueryChange: previous })} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Ada' } });
  await advance(250);
  view.rerender(<ListToolbar {...props({ query: 'Terug', onQueryChange: latest })} />);
  await advance(1000);

  expect(screen.getByDisplayValue('Terug')).toBe(screen.getByRole('searchbox'));
  expect(previous).not.toHaveBeenCalled();
  expect(latest).not.toHaveBeenCalled();
});

test('unmount annuleert de invoer na een callbackwijziging', async () => {
  const previous = vi.fn();
  const latest = vi.fn();
  const view = render(<ListToolbar {...props({ onQueryChange: previous })} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Ada' } });
  await advance(250);
  view.rerender(<ListToolbar {...props({ onQueryChange: latest })} />);
  view.unmount();
  await advance(1000);

  expect(previous).not.toHaveBeenCalled();
  expect(latest).not.toHaveBeenCalled();
});

test('alleen een callbackwijziging verstuurt geen zoekopdracht', async () => {
  const previous = vi.fn();
  const latest = vi.fn();
  const view = render(<ListToolbar {...props({ query: 'Ada', onQueryChange: previous })} />);
  await advance(250);
  view.rerender(<ListToolbar {...props({ query: 'Ada', onQueryChange: latest })} />);
  await advance(1000);

  expect(screen.getByDisplayValue('Ada')).toBe(screen.getByRole('searchbox'));
  expect(previous).not.toHaveBeenCalled();
  expect(latest).not.toHaveBeenCalled();
});
