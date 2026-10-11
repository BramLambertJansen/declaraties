import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { Button } from '../ui/button.tsx';
import { useListSearch } from './list-search.ts';

afterEach(cleanup);

// Echte memory-router, geen nep-API. validateSearch is hier een kale doorgeefluik: het schema zelf test list-search.test.ts.
function Probe() {
  const { search, setQuery, setFilter, setSort, clear } = useListSearch();
  return (
    <div>
      <output aria-label="search">{JSON.stringify(search)}</output>
      <Button
        onClick={() => {
          setQuery('ada');
        }}
      >
        zoek
      </Button>
      <Button
        onClick={() => {
          setQuery('');
        }}
      >
        zoek leeg
      </Button>
      <Button
        onClick={() => {
          setFilter('rol', 'admin');
        }}
      >
        filter admin
      </Button>
      <Button
        onClick={() => {
          setFilter('rol', undefined);
        }}
      >
        filter weg
      </Button>
      <Button
        onClick={() => {
          setSort('naam-az');
        }}
      >
        sorteer
      </Button>
      <Button
        onClick={() => {
          setQuery('  ada  ');
        }}
      >
        zoek spaties
      </Button>
      <Button onClick={clear}>wis</Button>
    </div>
  );
}

async function show(initial: string) {
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: '/lijst',
    validateSearch: (raw: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === 'string')),
    component: Probe,
  });
  const history = createMemoryHistory({ initialEntries: [initial] });
  const router = createRouter({ routeTree: root.addChildren([route]), history });
  render(<RouterProvider router={router} />);
  await screen.findByRole('button', { name: 'zoek' });
  return { router, history };
}

function shown(): unknown {
  return JSON.parse(screen.getByLabelText('search').textContent);
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    await Promise.resolve();
  });
}

describe('useListSearch', () => {
  test('leest de search params van de route', async () => {
    await show('/lijst?q=ada&rol=admin');

    expect(shown()).toStrictEqual({ q: 'ada', rol: 'admin' });
  });

  test('zoeken vervangt de history-stap (replace)', async () => {
    const { history, router } = await show('/lijst');
    const before = history.length;

    await click('zoek');

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ q: 'ada' });
    });
    expect(history.length).toBe(before);
  });

  test('een leeg zoekveld haalt q uit de URL', async () => {
    const { router } = await show('/lijst?q=ada&sort=naam-az');

    await click('zoek leeg');

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ sort: 'naam-az' });
    });
  });

  test.each([
    ['filter admin', { rol: 'admin' }],
    ['sorteer', { sort: 'naam-az' }],
  ])('%s maakt een nieuwe history-stap (AC-4)', async (name, expected) => {
    const { history, router } = await show('/lijst');
    const before = history.length;

    await click(name);

    await waitFor(() => {
      expect(router.state.location.search).toEqual(expected);
    });
    expect(history.length).toBe(before + 1);

    await act(async () => {
      history.back();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
  });

  test('een filter op undefined haalt de sleutel uit de URL', async () => {
    const { router } = await show('/lijst?rol=admin&q=ada');

    await click('filter weg');

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ q: 'ada' });
    });
  });

  test('clear wist q en filters, de sortering blijft staan (AC-5)', async () => {
    const { router } = await show('/lijst?q=niets&rol=admin&status=actief&sort=naam-az');

    await click('wis');

    await waitFor(() => {
      expect(router.state.location.search).toEqual({ sort: 'naam-az' });
    });
  });
});

describe('useListSearch: review PR 1', () => {
  test('setQuery trimt: q=ada', async () => {
    const { router } = await show('/lijst');

    await click('zoek spaties');

    await waitFor(() => {
      expect(router.state.location.searchStr).toBe('?q=ada');
    });
  });

  test.each(['zoek', 'filter admin', 'filter weg', 'sorteer', 'wis'])(
    '%s haalt een bestaande cursor uit de URL',
    async (name) => {
      const { router } = await show('/lijst?cursor=abc&q=x&rol=user');

      await click(name);

      await waitFor(() => {
        expect(router.state.location.searchStr).not.toContain('cursor');
      });
    },
  );
});
