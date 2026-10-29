import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { ApiError } from '../lib/api-client.ts';
import { AsyncView } from './async-view.tsx';
import { ErrorTextsProvider } from './error-texts.tsx';

afterEach(cleanup);

function List({ load }: { load: () => Promise<string[]> }) {
  const query = useQuery({ queryKey: ['lijst'], queryFn: load, retry: false });
  return (
    <AsyncView query={query} isEmpty={(items) => items.length === 0} emptyText="Nog geen accounts.">
      {(items) => (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </AsyncView>
  );
}

function show(load: () => Promise<string[]>) {
  render(
    <ErrorTextsProvider texts={{ INTERNAL_ERROR: 'Er ging iets mis.', FORBIDDEN: 'Geen toegang.' }}>
      <QueryClientProvider client={new QueryClient()}>
        <List load={load} />
      </QueryClientProvider>
    </ErrorTextsProvider>,
  );
}

describe('AsyncView', () => {
  test('laden, daarna de data', async () => {
    show(() => Promise.resolve(['Anna', 'Bert']));

    expect(screen.getByRole('status').textContent).toBe('Laden…');
    expect((await screen.findAllByRole('listitem')).map((item) => item.textContent)).toStrictEqual(['Anna', 'Bert']);
  });

  test('leeg: de lege tekst in plaats van de lijst', async () => {
    show(() => Promise.resolve([]));

    expect(await screen.findByText('Nog geen accounts.')).toBeDefined();
    expect(screen.queryByRole('list')).toBeNull();
  });

  test('fout: de tekst bij de code, nooit de code zelf; opnieuw proberen haalt opnieuw op', async () => {
    let calls = 0;
    show(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new ApiError('FORBIDDEN', 403)) : Promise.resolve(['Anna']);
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Geen toegang.');
    expect(alert.textContent).not.toContain('FORBIDDEN');
    fireEvent.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));
    expect((await screen.findByRole('listitem')).textContent).toBe('Anna');
  });

  test('een onbekende fout krijgt de algemene tekst', async () => {
    show(() => Promise.reject(new Error('SELECT * FROM geheim')));

    expect((await screen.findByRole('alert')).textContent).toContain('Er ging iets mis.');
  });
});
