import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Accordion } from './accordion.tsx';

afterEach(cleanup);

const items = [
  { id: 'general', title: 'Algemeen', content: <input aria-label="Naam" /> },
  { id: 'alerts', title: 'Meldingen', content: 'Meldinginhoud' },
  { id: 'off', title: 'Uitgeschakeld', content: 'Niet beschikbaar', disabled: true },
];

function expanded(name: string) {
  return screen.getByRole('button', { name }).getAttribute('aria-expanded');
}

// ui-collections/AC-6
test('AC-6: single sluit vorige sectie en laat alle secties sluiten', () => {
  render(<Accordion items={items} mode="single" defaultValue={['general']} />);
  expect(expanded('Algemeen')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Meldingen' }));
  expect(expanded('Algemeen')).toBe('false');
  expect(expanded('Meldingen')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Meldingen' }));
  expect(expanded('Meldingen')).toBe('false');
  expect(screen.queryByRole('textbox', { name: 'Naam' })).toBeNull();
  expect(screen.getByLabelText('Naam')).toBeDefined();
});

// ui-collections/AC-6
test('AC-6: multiple houdt andere secties open; disabled toggle doet niets', () => {
  render(<Accordion items={items} mode="multiple" defaultValue={['general']} />);
  fireEvent.click(screen.getByRole('button', { name: 'Meldingen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Uitgeschakeld' }));
  expect(expanded('Algemeen')).toBe('true');
  expect(expanded('Meldingen')).toBe('true');
  expect(expanded('Uitgeschakeld')).toBe('false');
});

// ui-collections/AC-6
test('AC-6: controlled wacht op ouder en herstelt focus wanneer ouder paneel sluit', () => {
  const change = vi.fn();
  const { rerender } = render(<Accordion items={items} mode="single" value={['general']} onValueChange={change} />);
  fireEvent.click(screen.getByRole('button', { name: 'Meldingen' }));
  expect(change).toHaveBeenCalledWith(['alerts']);
  expect(expanded('Algemeen')).toBe('true');
  screen.getByRole('textbox', { name: 'Naam' }).focus();
  rerender(<Accordion items={items} mode="single" value={[]} onValueChange={change} />);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Algemeen' }));
});

// ui-collections/AC-6
test('AC-6: headings en panelen zijn gekoppeld, ids uniek en onbekende ids openen niets', () => {
  render(
    <>
      <Accordion items={items} mode="single" defaultValue={['missing']} headingLevel={2} />
      <Accordion items={items} mode="single" />
    </>,
  );
  expect(screen.getByRole('heading', { level: 2, name: 'Algemeen' })).toBeDefined();
  expect(screen.getByRole('heading', { level: 3, name: 'Algemeen' })).toBeDefined();
  const triggers = screen.getAllByRole('button', { name: 'Algemeen' });
  const ids = triggers.map((trigger) => {
    const id = trigger.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    const panel = document.getElementById(id ?? '');
    expect(panel?.getAttribute('aria-labelledby')).toBe(trigger.id);
    expect(panel?.hasAttribute('hidden')).toBe(true);
    expect(panel?.getAttribute('role')).not.toBe('region');
    return id;
  });
  expect(new Set(ids).size).toBe(2);
});

// ui-collections/AC-6
test.each([true, false])(
  'AC-6: een gesloten disabled trigger kan focus uit het verborgen paneel terugnemen (eerder disabled: %s)',
  (disabled) => {
    const content = <input aria-label="Naam" />;
    const { rerender } = render(
      <Accordion
        mode="single"
        items={[{ id: 'general', title: 'Algemeen', content, disabled }]}
        value={['general']}
        onValueChange={() => undefined}
      />,
    );
    screen.getByRole('textbox', { name: 'Naam' }).focus();
    rerender(
      <Accordion
        mode="single"
        items={[{ id: 'general', title: 'Algemeen', content, disabled: true }]}
        value={[]}
        onValueChange={() => undefined}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Algemeen' });
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  },
);
