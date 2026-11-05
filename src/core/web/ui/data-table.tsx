import type { ReactNode } from 'react';
import { assert } from '#core/shared/assert.ts';
import { Button } from './button.tsx';
import { Checkbox } from './checkbox.tsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './table.tsx';

export interface DataTableColumn<Row> {
  readonly id: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  readonly sortable?: boolean;
}
export interface DataTableSort {
  readonly columnId: string;
  readonly direction: 'asc' | 'desc';
}
export interface DataTableSelection<Row> {
  readonly selectedIds: readonly string[];
  readonly onSelectionChange: (ids: readonly string[]) => void;
  readonly selectionLabel: (row: Row) => string;
  readonly selectAllLabel: string;
}
export interface DataTableLoadMore {
  readonly hasMore: boolean;
  readonly loading: boolean;
  readonly onLoadMore: () => void;
  readonly label: string;
  readonly loadingLabel: string;
}
type Sorting =
  | { readonly sort: DataTableSort | null; readonly onSortChange: (sort: DataTableSort) => void }
  | { readonly sort?: never; readonly onSortChange?: never };
type Actions<Row> =
  | { readonly rowActions: (row: Row) => ReactNode; readonly actionsLabel: string }
  | { readonly rowActions?: never; readonly actionsLabel?: never };
export type DataTableProps<Row> = Sorting &
  Actions<Row> & {
    readonly rows: readonly Row[];
    readonly getRowId: (row: Row) => string;
    readonly columns: readonly DataTableColumn<Row>[];
    readonly label: string;
    readonly caption?: string;
    readonly emptyContent?: ReactNode;
    readonly busy?: boolean;
    readonly selection?: DataTableSelection<Row>;
    readonly loadMore?: DataTableLoadMore;
  };

// Alleen de zichtbare pagina verandert; selectie uit andere pagina's blijft van de ouder.
function selectVisible<Row>(props: DataTableProps<Row>, checked: boolean) {
  const selection = props.selection;
  if (selection === undefined || props.busy === true) return;
  const visible = new Set(props.rows.map(props.getRowId));
  const retained = selection.selectedIds.filter((id) => !visible.has(id));
  selection.onSelectionChange(checked ? [...retained, ...visible] : retained);
}

function DataTableHeading<Row>({ table }: { readonly table: DataTableProps<Row> }) {
  const selection = table.selection;
  const selected = table.rows.filter((row) => selection?.selectedIds.includes(table.getRowId(row))).length;
  return (
    <TableHeader>
      <TableRow>
        {selection === undefined ? null : (
          <TableHead>
            <Checkbox
              label={selection.selectAllLabel}
              checked={table.rows.length > 0 && selected === table.rows.length}
              disabled={table.busy === true || table.rows.length === 0}
              ref={(input) => {
                if (input !== null) input.indeterminate = selected > 0 && selected < table.rows.length;
              }}
              onChange={(event) => {
                selectVisible(table, event.target.checked);
              }}
            />
          </TableHead>
        )}
        {table.columns.map((column) => {
          const active = column.sortable === true && table.sort?.columnId === column.id;
          return (
            <TableHead
              key={column.id}
              aria-sort={active ? (table.sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
            >
              {column.sortable === true && table.onSortChange !== undefined ? (
                <Button
                  variant="ghost"
                  disabled={table.busy}
                  onClick={() => {
                    table.onSortChange({
                      columnId: column.id,
                      direction: active && table.sort.direction === 'asc' ? 'desc' : 'asc',
                    });
                  }}
                >
                  {column.header}
                  {active ? (table.sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                </Button>
              ) : (
                column.header
              )}
            </TableHead>
          );
        })}
        {table.rowActions === undefined ? null : <TableHead>{table.actionsLabel}</TableHead>}
      </TableRow>
    </TableHeader>
  );
}

export function DataTable<Row>(props: DataTableProps<Row>) {
  const ids = props.rows.map(props.getRowId);
  assert(ids.every((id) => id !== '') && new Set(ids).size === ids.length, 'DataTable rows need unique non-empty ids');
  const columnIds = props.columns.map((column) => column.id);
  assert(
    columnIds.length > 0 && columnIds.every((id) => id !== '') && new Set(columnIds).size === columnIds.length,
    'DataTable columns need unique non-empty ids',
  );
  const colspan = props.columns.length + Number(props.selection !== undefined) + Number(props.rowActions !== undefined);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Table label={props.label} aria-busy={props.busy}>
        {props.caption === undefined ? null : <caption className="p-3 text-start">{props.caption}</caption>}
        <DataTableHeading table={props} />
        <TableBody>
          {props.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colspan}>{props.emptyContent ?? 'Geen resultaten.'}</TableCell>
            </TableRow>
          ) : (
            props.rows.map((row) => {
              const id = props.getRowId(row);
              const selection = props.selection;
              return (
                <TableRow key={id}>
                  {selection === undefined ? null : (
                    <TableCell>
                      <Checkbox
                        label={selection.selectionLabel(row)}
                        checked={selection.selectedIds.includes(id)}
                        disabled={props.busy}
                        onChange={(event) => {
                          if (props.busy !== true)
                            selection.onSelectionChange(
                              event.target.checked
                                ? [...new Set([...selection.selectedIds, id])]
                                : selection.selectedIds.filter((selected) => selected !== id),
                            );
                        }}
                      />
                    </TableCell>
                  )}
                  {props.columns.map((column) => (
                    <TableCell key={column.id}>{column.cell(row)}</TableCell>
                  ))}
                  {props.rowActions === undefined ? null : <TableCell>{props.rowActions(row)}</TableCell>}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      {props.loadMore?.hasMore === true ? (
        <Button
          variant="outline"
          disabled={props.busy === true || props.loadMore.loading}
          aria-busy={props.loadMore.loading}
          onClick={() => {
            if (props.busy !== true && props.loadMore?.loading === false) props.loadMore.onLoadMore();
          }}
        >
          {props.loadMore.loading ? props.loadMore.loadingLabel : props.loadMore.label}
        </Button>
      ) : null}
    </div>
  );
}
