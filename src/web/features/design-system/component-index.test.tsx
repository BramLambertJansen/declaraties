import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { useState } from 'react';
import { ComponentIndex } from './component-index.tsx';

afterEach(cleanup);

function ControlledIndex() {
  const [search, setSearch] = useState('');
  return <ComponentIndex search={search} onSearchChange={setSearch} onShow={() => undefined} />;
}

// Spec designsystem-toolbox/AC-4: de lijst staat dicht tot je zoekt of hem opent.
test('de lijst met alle componenten staat dicht en gaat open bij zoeken', () => {
  render(<ControlledIndex />);
  expect(screen.getByRole('button', { name: 'Lijst met alle componenten' }).getAttribute('aria-expanded')).toBe(
    'false',
  );
  expect(screen.queryByRole('table')).toBeNull();
  fireEvent.change(screen.getByLabelText('Component zoeken'), { target: { value: 'tabs' } });
  expect(screen.getByRole('button', { name: 'Lijst met alle componenten' }).getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('row', { name: /^Tabs Gegevens tonen/ })).toBeTruthy();
});

test('de echte bronindex toont ook RouteError, NotFound en interne ToastCard', () => {
  render(<ControlledIndex />);
  fireEvent.click(screen.getByRole('button', { name: 'Lijst met alle componenten' }));
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

// designsystem-toolbox/AC-9: bronpad en importnaam staan alleen in feiten.mjs componenten (ADR 0048, herzien in #501).
test('designsystem-toolbox/AC-9: zoeken toont het gevonden component zonder bronpad of importnaam', () => {
  render(<ControlledIndex />);
  fireEvent.change(screen.getByLabelText('Component zoeken'), { target: { value: 'routeerror' } });
  const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
  expect(headers).toStrictEqual(['Component', 'Tabblad', 'Varianten', 'Voorbeeld']);
  const row = screen.getByRole('row', { name: /^RouteError Meldingen en status/ });
  expect(within(row).queryByText('src/core/web/ui/route-error.tsx')).toBeNull();
  expect(within(row).queryByText(/Publiek|Intern/)).toBeNull();
  fireEvent.change(screen.getByLabelText('Component zoeken'), { target: { value: 'route-error.tsx' } });
  expect(screen.queryByRole('row', { name: /^RouteError / })).toBeNull();
  // Terug naar de naam, zodat de controles hieronder weer op de gevonden RouteError-rij gelden.
  fireEvent.change(screen.getByLabelText('Component zoeken'), { target: { value: 'routeerror' } });
  expect(screen.queryByRole('row', { name: /^Button / })).toBeNull();
  expect(screen.getByRole('status').textContent).toMatch(/^1 van \d+ componenten$/);
});
