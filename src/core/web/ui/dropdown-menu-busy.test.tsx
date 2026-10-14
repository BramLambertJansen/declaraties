import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Button } from './button.tsx';
import { DropdownMenu } from './dropdown-menu.tsx';

afterEach(cleanup);

test('AC-8: busy/disabled selecteren en sluiten niet; herstel maakt de actie bruikbaar', async () => {
  const action = vi.fn();
  const show = (busy: boolean) => (
    <DropdownMenu
      trigger={<Button>Meldingen</Button>}
      items={[
        { label: 'Versturen', busy, busyLabel: 'Bezig…', onSelect: action },
        { label: 'Geblokkeerd', disabled: true, onSelect: action },
      ]}
    />
  );
  const view = render(show(true));
  fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
  const item = await screen.findByRole('menuitem', { name: 'Bezig…' });
  item.focus();
  fireEvent.click(item);
  fireEvent.keyDown(item, { key: 'Enter' });
  fireEvent.keyDown(item, { key: ' ' });
  expect(action).not.toHaveBeenCalled();
  expect(screen.getByRole('menu')).toBeDefined();
  expect(item.getAttribute('aria-busy')).toBe('true');
  expect(item.getAttribute('aria-disabled')).toBe('true');
  expect(document.activeElement).toBe(item);
  const disabled = screen.getByRole('menuitem', { name: 'Geblokkeerd' });
  fireEvent.click(disabled);
  expect(action).not.toHaveBeenCalled();
  expect(screen.getByRole('menu')).toBeDefined();
  view.rerender(show(false));
  expect(screen.getByRole('menuitem', { name: 'Versturen' })).toBe(item);
  expect(document.activeElement).toBe(item);
  fireEvent.click(item);
  await waitFor(() => {
    expect(screen.queryByRole('menu')).toBeNull();
  });
  expect(action).toHaveBeenCalledTimes(1);
});
