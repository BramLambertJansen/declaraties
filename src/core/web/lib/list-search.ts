import { useNavigate, useSearch } from '@tanstack/react-router';

// Lezen en bijwerken van de search params van een lijstpagina (spec lijstpagina). Zoeken vervangt de history-stap (elke toets
// is er één te veel); een filter of sortering is een nieuwe stap, zodat Terug het vorige filter terugbrengt. De cursor hoort
// nooit bij een andere zoekopdracht en gaat bij elke wijziging weg.
export interface ListSearchState {
  readonly search: Readonly<Record<string, string | undefined>>;
  readonly setQuery: (q: string) => void;
  readonly setFilter: (key: string, value: string | undefined) => void;
  readonly setSort: (sort: string) => void;
  readonly clear: () => void;
}

type Params = Record<string, unknown>;

function without(params: Params, keys: readonly string[]): Params {
  return Object.fromEntries(Object.entries(params).filter(([key]) => !keys.includes(key) && key !== 'cursor'));
}

function strings(params: Params): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

export function useListSearch(): ListSearchState {
  const current: Params = useSearch({ strict: false });
  const navigate = useNavigate();
  const update = (change: (prev: Params) => Params, replace: boolean) => {
    void navigate({ to: '.', search: (prev: Params) => change(prev), replace });
  };
  const set = (key: string, value: string | undefined, replace: boolean) => {
    update(
      (prev) => ({ ...without(prev, [key]), ...(value === undefined || value === '' ? {} : { [key]: value }) }),
      replace,
    );
  };
  return {
    search: strings(current),
    setQuery: (q) => {
      set('q', q.trim(), true);
    },
    setFilter: (key, value) => {
      set(key, value, false);
    },
    setSort: (sort) => {
      set('sort', sort, false);
    },
    clear: () => {
      update((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key === 'sort')), false);
    },
  };
}

// Eerste voorkomen wint: keyset-paginering kan een rij op een volgende pagina terugbrengen (spec lijstpagina).
export function uniqueById<Row extends { readonly id: string }>(items: readonly Row[]): Row[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && seen.add(item.id));
}
