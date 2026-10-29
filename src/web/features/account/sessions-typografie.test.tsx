import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { ErrorTextsProvider } from '#core/web/ui/error-texts.tsx';
import { SessionsSection } from './sessions-section.tsx';

afterEach(cleanup);

const SESSIONS = [
  {
    id: 's1',
    apparaat: 'Chrome op Windows',
    aangemaakt: '2026-10-11T08:00:00Z',
    laatstActief: '2026-10-11T09:00:00Z',
    huidig: true,
  },
  {
    id: 's2',
    apparaat: 'Safari op iOS',
    aangemaakt: '2026-10-11T08:00:00Z',
    laatstActief: '2026-10-11T09:00:00Z',
    huidig: false,
  },
];

function Sessions() {
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => Promise.resolve({ items: SESSIONS }) });
  return <SessionsSection sessions={sessions} />;
}

function show() {
  render(
    <ErrorTextsProvider texts={{}}>
      <QueryClientProvider client={new QueryClient()}>
        <Sessions />
      </QueryClientProvider>
    </ErrorTextsProvider>,
  );
}

// typografie-en-layout/AC-8 (de bron-eis zonder font-/text-/ml-klassen staat in test/ui/typografie-en-layout.test.ts)
test('typografie-en-layout/AC-8: apparaatnaam en "Dit apparaat" zijn afzonderlijke spans in een Inline met gap-2', async () => {
  show();
  const device = await screen.findByText('Chrome op Windows');
  const row = device.closest('tr');
  expect(row).not.toBeNull();
  const label = within(row ?? document.body).getByText('Dit apparaat');

  expect(device).not.toBe(label);
  expect(device.tagName).toBe('SPAN');
  expect(label.tagName).toBe('SPAN');
  expect(device.classList.contains('font-medium')).toBe(true);
  expect(label.classList.contains('text-muted-foreground')).toBe(true);
  expect(label.classList.contains('ml-2')).toBe(false);
  const inline = device.parentElement;
  expect(label.parentElement).toBe(inline);
  expect(inline?.tagName).toBe('DIV');
  expect([...(inline?.classList ?? [])]).toEqual(expect.arrayContaining(['flex', 'flex-row', 'flex-wrap', 'gap-2']));
});

// typografie-en-layout/AC-8
test('typografie-en-layout/AC-8: een andere sessie toont alleen de apparaatnaam, zonder "Dit apparaat"', async () => {
  show();
  const device = await screen.findByText('Safari op iOS');
  const row = device.closest('tr');
  expect(within(row ?? document.body).queryByText('Dit apparaat')).toBeNull();
  expect(device.parentElement?.classList.contains('flex-wrap')).toBe(true);
  expect(screen.getAllByText('Dit apparaat')).toHaveLength(1);
});
