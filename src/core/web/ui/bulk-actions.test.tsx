import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { BulkActions } from './bulk-actions.tsx';
import { Button } from './button.tsx';

afterEach(cleanup);
test('geen selectie en busy blokkeren alle acties; status blijft bereikbaar', () => {
  const onClear = vi.fn();
  const run = vi.fn();
  const props = { selectedCount: 0, summary: '0 geselecteerd', label: 'Selectieacties', clearLabel: 'Wissen', onClear };
  const view = render(
    <BulkActions {...props}>
      <Button onClick={run}>Verwerken</Button>
    </BulkActions>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Wissen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Verwerken' }));
  expect(onClear).not.toHaveBeenCalled();
  expect(run).not.toHaveBeenCalled();
  const status = screen.getByRole('status');
  view.rerender(
    <BulkActions {...props} selectedCount={2} summary="2 geselecteerd" busy>
      <Button onClick={run}>Verwerken</Button>
    </BulkActions>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Verwerken' }));
  expect(run).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toBe(status);
  view.rerender(
    <BulkActions {...props} selectedCount={2} summary="2 geselecteerd">
      <Button onClick={run}>Verwerken</Button>
    </BulkActions>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Verwerken' }));
  fireEvent.click(screen.getByRole('button', { name: 'Wissen' }));
  expect(run).toHaveBeenCalledOnce();
  expect(onClear).toHaveBeenCalledOnce();
});
