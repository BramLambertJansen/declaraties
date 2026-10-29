import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { useState } from 'react';
import { ComponentIndex } from './component-index.tsx';

afterEach(cleanup);

function ControlledIndex() {
  const [search, setSearch] = useState('');
  return <ComponentIndex search={search} onSearchChange={setSearch} />;
}

test('de echte bronindex toont ook RouteError, NotFound en interne ToastCard', () => {
  render(<ControlledIndex />);
  const table = screen.getByRole('table');
  for (const name of ['Button', 'RouteError', 'NotFound', 'ToastCard']) {
    expect(within(table).getByText(name)).toBeTruthy();
  }
  expect(
    within(table).getByText('variant: destructive, ghost, outline, primary, secondary; size: icon, md'),
  ).toBeTruthy();
});

test('zoeken op een variant vindt het herbruikbare component', () => {
  render(<ControlledIndex />);
  fireEvent.change(screen.getByLabelText('Component zoeken'), { target: { value: 'destructive' } });
  expect(screen.getByRole('row', { name: /^Button / })).toBeTruthy();
});

test('zoeken toont bronpad en hergebruik van het gevonden component', () => {
  render(<ControlledIndex />);
  fireEvent.change(screen.getByLabelText('Component zoeken'), { target: { value: 'routeerror' } });
  const row = screen.getByRole('row', { name: /RouteError/ });
  expect(within(row).getByText('src/core/web/ui/route-error.tsx')).toBeTruthy();
  expect(within(row).getByText('Publiek: RouteError')).toBeTruthy();
  expect(screen.queryByRole('row', { name: /^Button / })).toBeNull();
  expect(screen.getByRole('status').textContent).toMatch(/^1 van \d+ componenten$/);
});
