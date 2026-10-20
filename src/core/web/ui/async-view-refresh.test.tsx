import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { ApiError } from '../lib/api-client.ts';
import { AsyncView } from './async-view.tsx';
import { Button } from './button.tsx';
import { Input } from './input.tsx';

afterEach(cleanup);
function Example({ load, retain }: { load: () => Promise<string[]>; retain: boolean }) {
  const query = useQuery({
    queryKey: ['refresh'],
    queryFn: load,
    initialData: ['Anna'],
    staleTime: Infinity,
    retry: false,
  });
  return (
    <>
      <Button onClick={() => void query.refetch()}>Verversen</Button>
      <AsyncView
        query={query}
        {...(retain ? { refresh: { refreshingLabel: 'Verversen…', staleLabel: 'Mogelijk verouderd.' } } : {})}
      >
        {(data) => (
          <div>
            <p>{data.join(', ')}</p>
            <Input aria-label="Notitie" defaultValue="" />
          </div>
        )}
      </AsyncView>
    </>
  );
}
function show(load: () => Promise<string[]>, retain = true) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Example load={load} retain={retain} />
    </QueryClientProvider>,
  );
}

test('verversen en fout behouden dezelfde inhoud en invoer; retry vervangt de gegevens zonder remount', async () => {
  let fail: (error: Error) => void = () => undefined;
  let calls = 0;
  show(() => {
    calls += 1;
    return calls === 1
      ? new Promise<string[]>((_, reject) => {
          fail = reject;
        })
      : Promise.resolve(['Bert']);
  });
  const input = screen.getByLabelText('Notitie');
  fireEvent.change(input, { target: { value: 'Bewaren' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verversen' }));
  await screen.findByText('Verversen…');
  expect(screen.getByText('Anna')).toBeDefined();
  act(() => {
    fail(new Error('SELECT secret'));
  });
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Mogelijk verouderd.');
  expect(alert.textContent).not.toContain('SELECT');
  expect(screen.getByLabelText('Notitie')).toBe(input);
  expect(screen.getByDisplayValue('Bewaren')).toBe(input);
  fireEvent.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));
  await screen.findByText('Bert');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByDisplayValue('Bewaren')).toBe(input);
});

for (const status of [401, 403, 404, 422]) {
  test(`bestaande data verdwijnt bij HTTP ${String(status)}, ook met behoudoptie`, async () => {
    show(() => Promise.reject(new ApiError('FORBIDDEN', status)));
    fireEvent.click(screen.getByRole('button', { name: 'Verversen' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Anna')).toBeNull();
    expect(screen.queryByLabelText('Notitie')).toBeNull();
  });
}

test('zonder opt-in vervangt ook een serverfout de gegevens door de bestaande foutweergave', async () => {
  show(() => Promise.reject(new ApiError('INTERNAL_ERROR', 500)), false);
  fireEvent.click(screen.getByRole('button', { name: 'Verversen' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('Anna')).toBeNull();
});
