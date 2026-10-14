import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { DescriptionList } from './description-list.tsx';
import { List, ListItem } from './list.tsx';
import { Button } from './button.tsx';

afterEach(cleanup);

test('AC-7: lijstitems houden titel, beschrijving, decoratie en zelfstandige actie uit elkaar', () => {
  const action = vi.fn();
  render(
    <List aria-label="Gebruikers">
      <ListItem
        title="Anna"
        description="Gebruiker"
        leading={<span>Decoratie</span>}
        actions={<Button onClick={action}>Bekijken Anna</Button>}
      />
      <ListItem title="Bert" />
    </List>,
  );
  const list = screen.getByRole('list', { name: 'Gebruikers' });
  expect(list.tagName).toBe('UL');
  expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByText('Decoratie').closest('[aria-hidden="true"]')).toBeTruthy();
  fireEvent.click(screen.getByText('Anna'));
  expect(action).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Bekijken Anna' }));
  expect(action).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button').parentElement?.closest('button')).toBeNull();
});

test('AC-7: metadata gebruikt native term/waarde en bewaart de bijbehorende inhoud bij herschikken', () => {
  const { rerender } = render(
    <DescriptionList
      items={[
        { id: 'name', term: 'Naam', value: 'Anna' },
        { id: 'role', term: 'Rol', value: 'Beheerder' },
      ]}
    />,
  );
  expect(screen.getByText('Naam').tagName).toBe('DT');
  expect(screen.getByText('Anna').tagName).toBe('DD');
  const name = screen.getByText('Naam');
  rerender(
    <DescriptionList
      items={[
        { id: 'role', term: 'Rol', value: 'Gebruiker' },
        { id: 'name', term: 'Naam', value: 'Bert' },
      ]}
    />,
  );
  expect(screen.getByText('Naam')).toBe(name);
  expect(name.nextElementSibling?.textContent).toBe('Bert');
  expect(screen.getByText('Rol').nextElementSibling?.textContent).toBe('Gebruiker');
});

test('AC-7: lege collecties verzinnen geen items, gegevens of selecteerbare controls', () => {
  const { container } = render(
    <>
      <List aria-label="Leeg">{null}</List>
      <DescriptionList items={[]} />
    </>,
  );
  expect(screen.queryByRole('listitem')).toBeNull();
  expect(container.querySelector('dl')?.childElementCount).toBe(0);
  expect(screen.queryByRole('button')).toBeNull();
});
