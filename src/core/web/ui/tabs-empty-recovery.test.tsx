import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Tabs } from './tabs.tsx';

afterEach(cleanup);

const items = [
  { id: 'disabled', label: 'Uit', content: 'Uitgeschakeld', disabled: true },
  { id: 'first', label: 'Eerste', content: 'Eerste inhoud' },
  { id: 'second', label: 'Tweede', content: 'Tweede inhoud' },
];

function expectSelected(label: string, content: string) {
  expect(screen.getByRole('tab', { name: label }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tabpanel').textContent).toBe(content);
}

test('later geladen tabs kiezen de eerste enabled tab en behouden die bij herschikken', () => {
  const { rerender } = render(<Tabs label="Dossier" items={[]} />);
  expect(screen.queryByRole('tabpanel')).toBeNull();
  rerender(<Tabs label="Dossier" items={items} />);
  expectSelected('Eerste', 'Eerste inhoud');
  rerender(<Tabs label="Dossier" items={items.toReversed()} />);
  expectSelected('Eerste', 'Eerste inhoud');
});

test('een aanvankelijk volledig disabled verzameling activeert de eerste tab die beschikbaar komt', () => {
  const { rerender } = render(<Tabs label="Dossier" items={items.map((item) => ({ ...item, disabled: true }))} />);
  expect(screen.queryByRole('tabpanel')).toBeNull();
  rerender(<Tabs label="Dossier" items={items} />);
  expectSelected('Eerste', 'Eerste inhoud');
});

test('een lege tussenstand verhindert selectieherstel niet wanneer nieuwe tabs verschijnen', () => {
  const { rerender } = render(<Tabs label="Dossier" items={items} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Tweede' }));
  expectSelected('Tweede', 'Tweede inhoud');
  rerender(<Tabs label="Dossier" items={[]} />);
  expect(screen.queryByRole('tabpanel')).toBeNull();
  rerender(<Tabs label="Dossier" items={items} />);
  expectSelected('Eerste', 'Eerste inhoud');
});

test('na tijdelijk alle tabs uitschakelen herstelt selectie zonder focus buiten de tabs te stelen', () => {
  const view = (disabled: boolean) => (
    <>
      <button type="button">Buiten</button>
      <Tabs label="Dossier" items={disabled ? items.map((item) => ({ ...item, disabled: true })) : items} />
    </>
  );
  const { rerender } = render(view(false));
  fireEvent.click(screen.getByRole('tab', { name: 'Tweede' }));
  const outside = screen.getByRole('button', { name: 'Buiten' });
  outside.focus();
  rerender(view(true));
  expect(screen.queryByRole('tabpanel')).toBeNull();
  rerender(view(false));
  expectSelected('Eerste', 'Eerste inhoud');
  expect(document.activeElement).toBe(outside);
});

test('een expliciete onbekende defaultValue blijft onbekend na laden en leegmaken', () => {
  const view = (loaded: boolean) => <Tabs label="Dossier" items={loaded ? items : []} defaultValue="missing" />;
  const { rerender } = render(view(false));
  rerender(view(true));
  expect(screen.queryByRole('tabpanel')).toBeNull();
  expect(screen.getByRole('tab', { name: 'Eerste' }).tabIndex).toBe(0);
  rerender(view(false));
  rerender(view(true));
  expect(screen.queryByRole('tabpanel')).toBeNull();
});

test('een controlled waarde blijft leidend en laden triggert geen keuzecallback', () => {
  const onValueChange = vi.fn();
  const view = (value: string, loaded: boolean) => (
    <Tabs label="Dossier" items={loaded ? items : []} value={value} onValueChange={onValueChange} />
  );
  const { rerender } = render(view('missing', false));
  rerender(view('missing', true));
  expect(screen.queryByRole('tabpanel')).toBeNull();
  rerender(view('second', true));
  expectSelected('Tweede', 'Tweede inhoud');
  rerender(view('second', false));
  rerender(view('second', true));
  expectSelected('Tweede', 'Tweede inhoud');
  expect(onValueChange).not.toHaveBeenCalled();
});
