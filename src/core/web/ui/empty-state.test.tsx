import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AsyncView } from './async-view.tsx';
import { Button } from './button.tsx';
import { EmptyState } from './empty-state.tsx';
import { ErrorTextsProvider } from './error-texts.tsx';
import { StatusBadge, type StatusBadgeProps } from './status-badge.tsx';

afterEach(cleanup);

function Example({ action, custom }: { action: () => void; custom: boolean }) {
  const query = useQuery({ queryKey: ['empty'], queryFn: () => Promise.resolve<string[]>([]) });
  return (
    <AsyncView
      query={query}
      isEmpty={(items) => items.length === 0}
      emptyText="Geen data."
      emptyContent={
        custom ? (
          <EmptyState title="Leeg" description="Uitleg" action={<Button onClick={action}>Versturen</Button>} />
        ) : undefined
      }
    >
      {(items) => <p>{items.join(',')}</p>}
    </AsyncView>
  );
}

// ui-kit-basics/AC-7
test('AC-7: custom EmptyState vervangt uitsluitend de lege uitkomst en voert alleen de aangeleverde actie uit', async () => {
  const action = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ErrorTextsProvider texts={{}}>
        <Example action={action} custom />
      </ErrorTextsProvider>
    </QueryClientProvider>,
  );
  expect(action).not.toHaveBeenCalled();
  expect(await screen.findByText('Leeg')).toBeDefined();
  expect(screen.getByText('Uitleg')).toBeDefined();
  expect(screen.queryByText('Geen data.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Versturen' }));
  expect(action).toHaveBeenCalledTimes(1);
});

// ui-kit-basics/AC-7
test('AC-7: bestaande lege tekst blijft beschikbaar zonder custom inhoud', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ErrorTextsProvider texts={{}}>
        <Example action={() => undefined} custom={false} />
      </ErrorTextsProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Geen data.')).toBeDefined();
  expect(screen.queryByRole('button')).toBeNull();
});

test('EmptyState zonder actie of uitleg verzint geen tekst of control', () => {
  const view = render(<EmptyState title="Geen data." />);
  expect(view.container.textContent).toBe('Geen data.');
  expect(screen.queryByRole('button')).toBeNull();
});

test.each<NonNullable<StatusBadgeProps['tone']>>(['neutral', 'accent', 'destructive'])(
  'AC-6: badge %s heeft aangeleverde tekst zonder kleurafhankelijke betekenis',
  (tone) => {
    render(<StatusBadge tone={tone}>Aangeleverde status</StatusBadge>);
    expect(screen.getByText('Aangeleverde status').tagName).toBe('SPAN');
    expect(screen.queryByRole('button')).toBeNull();
  },
);
