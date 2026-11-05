import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { DataTable, type DataTableColumn } from './data-table.tsx';

const rows = [
  { id: '__proto__', name: 'Anna' },
  { id: 'constructor', name: 'Bert' },
];
const columns: readonly DataTableColumn<(typeof rows)[number]>[] = [
  { id: 'name', header: 'Naam', cell: (row) => row.name, sortable: true },
];
const base = { rows, columns, getRowId: (row: (typeof rows)[number]) => row.id, label: 'Personen' };
afterEach(cleanup);

test('sortering meldt richting zonder lokale herschikking en markeert alleen actieve kop', () => {
  const onSortChange = vi.fn();
  const { rerender } = render(<DataTable {...base} sort={null} onSortChange={onSortChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Naam' }));
  expect(onSortChange).toHaveBeenLastCalledWith({ columnId: 'name', direction: 'asc' });
  rerender(<DataTable {...base} sort={{ columnId: 'name', direction: 'asc' }} onSortChange={onSortChange} />);
  expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe('ascending');
  fireEvent.click(screen.getByRole('button', { name: /Naam/ }));
  expect(onSortChange).toHaveBeenLastCalledWith({ columnId: 'name', direction: 'desc' });
  expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Anna', 'Bert']);
  rerender(<DataTable {...base} sort={{ columnId: 'missing', direction: 'asc' }} onSortChange={onSortChange} />);
  expect(screen.getByRole('columnheader').hasAttribute('aria-sort')).toBe(false);
});

test('select-all is gedeeltelijk en behoudt selectie buiten de zichtbare pagina', () => {
  const onSelectionChange = vi.fn();
  const selection = {
    selectedIds: ['elsewhere', '__proto__'],
    onSelectionChange,
    selectionLabel: (row: (typeof rows)[number]) => `Selecteer ${row.name}`,
    selectAllLabel: 'Alles',
  };
  const { rerender } = render(<DataTable {...base} selection={selection} />);
  const all = screen.getByRole('checkbox', { name: 'Alles' });
  expect(all instanceof HTMLInputElement && all.indeterminate).toBe(true);
  fireEvent.click(all);
  expect(onSelectionChange).toHaveBeenLastCalledWith(['elsewhere', '__proto__', 'constructor']);
  rerender(
    <DataTable {...base} selection={{ ...selection, selectedIds: ['elsewhere', '__proto__', 'constructor'] }} />,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Alles' }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(['elsewhere']);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Selecteer Anna' }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(['elsewhere', 'constructor']);
});

test('busy en loading blokkeren acties; lege tabel heeft correcte colspan en disabled selectie', () => {
  const onSortChange = vi.fn();
  const onLoadMore = vi.fn();
  const selection = {
    selectedIds: [],
    onSelectionChange: vi.fn(),
    selectionLabel: () => 'Rij',
    selectAllLabel: 'Alles',
  };
  const loadMore = { hasMore: true, loading: false, onLoadMore, label: 'Meer', loadingLabel: 'Laden' };
  const { rerender } = render(
    <DataTable {...base} busy selection={selection} sort={null} onSortChange={onSortChange} loadMore={loadMore} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Naam' }));
  fireEvent.click(screen.getByRole('button', { name: 'Meer' }));
  expect(onSortChange).not.toHaveBeenCalled();
  expect(onLoadMore).not.toHaveBeenCalled();
  rerender(<DataTable {...base} loadMore={loadMore} />);
  fireEvent.click(screen.getByRole('button', { name: 'Meer' }));
  expect(onLoadMore).toHaveBeenCalledTimes(1);
  rerender(
    <DataTable
      {...base}
      rows={[]}
      selection={selection}
      rowActions={() => null}
      actionsLabel="Acties"
      emptyContent="Leeg"
      loadMore={{ ...loadMore, loading: true }}
    />,
  );
  expect(screen.getByRole('cell').getAttribute('colspan')).toBe('3');
  expect(screen.getByRole('checkbox', { name: 'Alles' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Laden' }));
  expect(onLoadMore).toHaveBeenCalledTimes(1);
});

test('lege en dubbele rij- en kolomids worden geweigerd', () => {
  expect(() => render(<DataTable {...base} rows={[...rows.slice(0, 1), ...rows.slice(0, 1)]} />)).toThrow();
  expect(() => render(<DataTable {...base} rows={[{ id: '', name: 'Leeg' }]} />)).toThrow();
  expect(() => render(<DataTable {...base} columns={[...columns, ...columns]} />)).toThrow();
  expect(() => render(<DataTable {...base} columns={[{ id: '', header: 'Naam', cell: () => null }]} />)).toThrow();
});
