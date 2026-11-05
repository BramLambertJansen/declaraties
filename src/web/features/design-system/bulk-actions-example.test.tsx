import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { BulkActionsExample } from './bulk-actions-example.tsx';

afterEach(cleanup);
test('gedeeltelijk succes behoudt alleen mislukte selectie; opnieuw proberen verwerkt die selectie', () => {
  render(<BulkActionsExample />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Selecteer alle zichtbare voorbeeldaccounts' }));
  expect(screen.getByText('2 geselecteerd')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Verwerken' }));
  expect(screen.getByRole('checkbox', { name: 'Selecteer Anna de Vries' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Afronden' }));
  expect(screen.getByRole('alert').textContent).toBe('1 verwerkt; 1 mislukt.');
  const table = screen.getByRole('table');
  const selected = within(table).getAllByRole('checkbox', { checked: true });
  expect(selected).toHaveLength(1);
  expect(selected[0]).toBe(screen.getByLabelText('Selecteer Bert Jansen'));
  fireEvent.click(screen.getByRole('button', { name: 'Verwerken' }));
  fireEvent.click(screen.getByRole('button', { name: 'Afronden' }));
  expect(screen.getByText('1 verwerkt; 0 mislukt.')).toBeDefined();
  expect(screen.getByText('0 geselecteerd')).toBeDefined();
  expect(within(table).queryAllByRole('checkbox', { checked: true })).toHaveLength(0);
});
