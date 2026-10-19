import { type ReactElement, useEffect, useId, useRef, useState } from 'react';
import { MAX_SEARCH_LENGTH } from '#core/shared/limits.ts';
import { Button } from './button.tsx';
import { Field } from './field.tsx';
import { Input } from './input.tsx';
import { Combobox, type ComboboxOption } from './combobox.tsx';
import { assert } from '#core/shared/assert.ts';
import { Select, type SelectOption } from './select.tsx';

export interface ListToolbarFilter {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly ComboboxOption[];
  readonly searchable?: boolean;
  readonly onChange: (value: string) => void;
}

export interface ListToolbarProps {
  readonly searchLabel: string;
  readonly showActiveFilters?: boolean;
  readonly searchHint?: string | undefined;
  readonly query: string;
  readonly onQueryChange: (q: string) => void;
  readonly filters?: readonly ListToolbarFilter[];
  readonly sortLabel: string;
  readonly sort: string;
  readonly sortOptions: readonly SelectOption[];
  readonly onSortChange: (sort: string) => void;
  readonly onClear: () => void;
}

const DEBOUNCE_MS = 300;
const CLEAR_LABEL = 'Filters wissen';

// Het veld toont direct wat de gebruiker typt; de URL volgt na DEBOUNCE_MS stilte. Een nieuwe `query`-prop (wissen, Terug)
// annuleert achterhaalde invoer. De bevestiging van onze eigen invoer laat verder typen en afsluitende spaties staan.
function useDebouncedQuery(query: string, onQueryChange: (q: string) => void) {
  const [value, setValue] = useState(query);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previous = useRef(query);
  const submitted = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (previous.current === query) return;
    previous.current = query;
    if (submitted.current === query) {
      submitted.current = undefined;
      return;
    }
    clearTimeout(timer.current);
    timer.current = undefined;
    submitted.current = undefined;
    setValue((current) => (query === current.trim() ? current : query));
  }, [query]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  const change = (next: string) => {
    setValue(next);
    cancel();
    timer.current = setTimeout(() => {
      timer.current = undefined;
      submitted.current = next.trim();
      onQueryChange(next);
    }, DEBOUNCE_MS);
  };
  const reset = () => {
    cancel();
    submitted.current = undefined;
    setValue('');
  };
  return { value, change, reset };
}

// Layoutblok voor lijstpagina's (spec lijstpagina): zoekveld, filters, sorteren en "Filters wissen"; onder elkaar op 375 px.
export function ListToolbar(props: ListToolbarProps): ReactElement {
  const { value, change, reset } = useDebouncedQuery(props.query, props.onQueryChange);
  const base = useId();
  const searchId = `${base}-zoeken`;
  const sortId = `${base}-sorteren`;
  const searchRef = useRef<HTMLInputElement>(null);
  const filters = props.filters ?? [];
  const filterIds = filters.map((filter) => filter.id);
  assert(
    filterIds.every((id) => id !== '') && new Set(filterIds).size === filterIds.length,
    'Filter ids must be unique and non-empty',
  );
  const active = props.query !== '' || value.trim() !== '' || filters.some((filter) => filter.value !== '');
  const clear = () => {
    reset();
    props.onClear();
    searchRef.current?.focus();
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
        <div className="md:min-w-64 md:flex-1">
          <Field id={searchId} label={props.searchLabel} description={props.searchHint}>
            <Input
              ref={searchRef}
              id={searchId}
              type="search"
              maxLength={MAX_SEARCH_LENGTH}
              value={value}
              aria-describedby={props.searchHint === undefined ? undefined : `${searchId}-hulp`}
              onChange={(event) => {
                change(event.target.value);
              }}
            />
          </Field>
        </div>
        {filters.map((filter) => (
          <Field key={filter.id} id={`${base}-filter-${encodeURIComponent(filter.id)}`} label={filter.label}>
            {filter.searchable === true ? (
              <Combobox
                id={`${base}-filter-${encodeURIComponent(filter.id)}`}
                value={filter.value}
                options={filter.options.filter((option) => option.value !== '')}
                placeholder={filter.options.find((option) => option.value === '')?.label}
                clearable
                clearLabel={`Verwijder ${filter.label}`}
                onValueChange={filter.onChange}
              />
            ) : (
              <Select
                id={`${base}-filter-${encodeURIComponent(filter.id)}`}
                value={filter.value}
                options={filter.options}
                onChange={(event) => {
                  filter.onChange(event.target.value);
                }}
              />
            )}
          </Field>
        ))}
        <Field id={sortId} label={props.sortLabel}>
          <Select
            id={sortId}
            value={props.sort}
            options={props.sortOptions}
            onChange={(event) => {
              props.onSortChange(event.target.value);
            }}
          />
        </Field>
        {active ? (
          <Button variant="secondary" onClick={clear}>
            {CLEAR_LABEL}
          </Button>
        ) : null}
      </div>
      {props.showActiveFilters === true ? (
        <ul aria-label="Actieve filters" className="flex flex-wrap gap-2">
          {props.query === '' ? null : (
            <li>
              <Button
                variant="outline"
                aria-label={`Verwijder ${props.searchLabel}: ${props.query}`}
                onClick={() => {
                  reset();
                  props.onQueryChange('');
                  searchRef.current?.focus();
                }}
              >
                {props.searchLabel}: {props.query}
              </Button>
            </li>
          )}
          {filters
            .filter((filter) => filter.value !== '')
            .map((filter) => {
              const text = `${filter.label}: ${filter.options.find((option) => option.value === filter.value)?.label ?? filter.value}`;
              return (
                <li key={filter.id}>
                  <Button
                    variant="outline"
                    aria-label={`Verwijder ${text}`}
                    onClick={() => {
                      filter.onChange('');
                      document.getElementById(`${base}-filter-${encodeURIComponent(filter.id)}`)?.focus();
                    }}
                  >
                    {text}
                  </Button>
                </li>
              );
            })}
        </ul>
      ) : null}
    </div>
  );
}
