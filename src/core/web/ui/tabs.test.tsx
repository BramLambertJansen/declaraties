import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, expect, test, vi } from 'vitest';
import { Tabs } from './tabs.tsx';

const items = [
  { id: '__proto__', label: 'Overzicht', content: <input aria-label="Bewaard" defaultValue="begin" /> },
  { id: 'off', label: 'Uit', content: 'Uit', disabled: true },
  { id: 'constructor', label: 'Details', content: 'Details inhoud' },
];
const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
  if (scroll === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  else Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scroll);
});
afterEach(cleanup);

test('pijlen verplaatsen focus met wrapping zonder activatie; klikken bewaart gemounte inhoud', () => {
  render(<Tabs label="Dossier" items={items} />);
  const first = screen.getByRole('tab', { name: 'Overzicht' });
  const last = screen.getByRole('tab', { name: 'Details' });
  first.focus();
  fireEvent.keyDown(first, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(last);
  expect(first.getAttribute('aria-selected')).toBe('true');
  fireEvent.keyDown(last, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: 'End' });
  expect(document.activeElement).toBe(last);
  fireEvent.change(screen.getByLabelText('Bewaard'), { target: { value: 'blijft' } });
  fireEvent.click(last);
  expect(screen.getByLabelText('Bewaard').closest('[hidden]')).toBeTruthy();
  fireEvent.click(first);
  const input = screen.getByLabelText('Bewaard');
  expect(input instanceof HTMLInputElement && input.value).toBe('blijft');
  expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(first.id);
  expect(first.getAttribute('aria-controls')).toBe(screen.getByRole('tabpanel').id);
});

test('controlled onbekende waarde vervangt niets en callbacks veranderen de prop niet', () => {
  const onValueChange = vi.fn();
  render(<Tabs label="Dossier" items={items} value="missing" onValueChange={onValueChange} />);
  expect(screen.queryByRole('tabpanel')).toBeNull();
  expect(screen.getByRole('tab', { name: 'Overzicht' }).tabIndex).toBe(0);
  fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
  expect(onValueChange).toHaveBeenCalledWith('constructor');
  expect(screen.queryByRole('tabpanel')).toBeNull();
});

test('verwijderde uncontrolled actieve inhoud herstelt focus zonder focus van elders te stelen', () => {
  const { rerender } = render(<Tabs label="Dossier" items={items} />);
  screen.getByLabelText('Bewaard').focus();
  rerender(<Tabs label="Dossier" items={items.slice(1)} />);
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Details' }));
  expect(screen.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe('true');
});

test('instanties hebben unieke relaties; ongeldige ids worden geweigerd', () => {
  const { unmount } = render(
    <>
      <Tabs label="Een" items={items} />
      <Tabs label="Twee" items={items} />
    </>,
  );
  const ids = Array.from(document.querySelectorAll('[id]'), (node) => node.id);
  expect(new Set(ids).size).toBe(ids.length);
  unmount();
  expect(() => render(<Tabs label="Dubbel" items={[...items.slice(0, 1), ...items.slice(0, 1)]} />)).toThrow();
  expect(() => render(<Tabs label="Leeg" items={[{ id: '', label: 'Leeg', content: null }]} />)).toThrow();
});

test('disable van actieve tab herstelt uncontrolled selectie en verwijderde triggerfocus', () => {
  const { rerender } = render(<Tabs label="Dossier" items={items} />);
  const first = screen.getByRole('tab', { name: 'Overzicht' });
  first.focus();
  rerender(
    <Tabs
      label="Dossier"
      items={items.map((item) => (item.id === '__proto__' ? { ...item, disabled: true } : item))}
    />,
  );
  expect(screen.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Details' }));
  rerender(<Tabs label="Dossier" items={items.slice(0, 2).map((item) => ({ ...item, disabled: true }))} />);
  expect(screen.queryByRole('tabpanel')).toBeNull();
  expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
  expect(document.activeElement?.getAttribute('role')).not.toBe('tab');
});

test('structurele wijzigingen stelen geen focus buiten de tabs en onbekende default kiest niets', () => {
  const { rerender } = render(
    <>
      <button type="button">Buiten</button>
      <Tabs label="Dossier" items={items} />
    </>,
  );
  const outside = screen.getByRole('button', { name: 'Buiten' });
  outside.focus();
  rerender(
    <>
      <button type="button">Buiten</button>
      <Tabs label="Dossier" items={items.slice(1)} />
    </>,
  );
  expect(document.activeElement).toBe(outside);
  rerender(<Tabs key="invalid" label="Dossier" items={items} defaultValue="missing" />);
  expect(screen.queryByRole('tabpanel')).toBeNull();
  expect(screen.getByRole('tab', { name: 'Overzicht' }).tabIndex).toBe(0);
});

test('controlled wissel vanuit paneelinhoud focust nieuwe actieve tab ondanks eerder roving doel', () => {
  const onValueChange = vi.fn();
  const { rerender } = render(<Tabs label="Dossier" items={items} value="__proto__" onValueChange={onValueChange} />);
  screen.getByRole('textbox', { name: 'Bewaard' }).focus();
  rerender(<Tabs label="Dossier" items={items} value="constructor" onValueChange={onValueChange} />);
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Details' }));
  expect(onValueChange).not.toHaveBeenCalled();
});

test('paneel met uitsluitend verborgen of onbereikbare invoer blijft zelf focusbaar', () => {
  const content = (
    <>
      <input type="hidden" />
      <input aria-label="Niet bereikbaar" tabIndex={-1} />
    </>
  );
  render(<Tabs label="Dossier" items={[{ id: 'one', label: 'Een', content }]} />);
  expect(screen.getByRole('tabpanel').tabIndex).toBe(0);
});
