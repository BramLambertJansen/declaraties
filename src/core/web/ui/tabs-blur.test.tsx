import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Tabs } from './tabs.tsx';

afterEach(cleanup);

test('een ouderwissel trekt focus niet terug na bewust verlaten van het paneel zonder volgend focusdoel', () => {
  const items = [
    { id: 'first', label: 'Eerste', content: <input aria-label="Invoer" /> },
    { id: 'second', label: 'Tweede', content: 'Tweede inhoud' },
  ];
  const onValueChange = vi.fn();
  const { rerender } = render(<Tabs label="Dossier" items={items} value="first" onValueChange={onValueChange} />);
  const input = screen.getByRole('textbox', { name: 'Invoer' });
  input.focus();
  input.blur();
  expect(document.activeElement).toBe(document.body);
  rerender(<Tabs label="Dossier" items={items} value="second" onValueChange={onValueChange} />);
  expect(screen.getByRole('tab', { name: 'Tweede' }).getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(document.body);
  expect(onValueChange).not.toHaveBeenCalled();
});
