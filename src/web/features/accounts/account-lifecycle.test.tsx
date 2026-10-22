import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { z } from 'zod';
import type { accountItem } from '#shared/contracts/accounts.ts';
import { Table, TableBody } from '#web/ui/index.ts';
import { AccountRow, accountStatusText } from './account-row.tsx';
import { itemsFor } from './row-actions.tsx';

type Account = z.output<typeof accountItem>;

const ACTIVE: Account = {
  id: 'account-1',
  naam: 'Anna',
  email: 'anna@example.test',
  rol: 'user',
  status: 'actief',
  aangemaakt: '2026-10-21T08:00:00Z',
  laatstIngelogd: null,
  gedeactiveerd: false,
  geblokkeerd: false,
};

afterEach(cleanup);

function handlers() {
  return { askBlock: vi.fn(), unblock: vi.fn(), askDeactivate: vi.fn(), activate: vi.fn() };
}

describe('afzonderlijke accountmaatregelen', () => {
  test('biedt beide maatregelen voor een actief ander account', () => {
    const actions = handlers();
    const items = itemsFor(ACTIVE, false, actions);
    expect(items.map((item) => item.label)).toStrictEqual(['Blokkeren', 'Deactiveren']);
    items[0]?.onSelect();
    items[1]?.onSelect();
    expect(actions.askBlock).toHaveBeenCalledOnce();
    expect(actions.askDeactivate).toHaveBeenCalledOnce();
    expect(actions.unblock).not.toHaveBeenCalled();
    expect(actions.activate).not.toHaveBeenCalled();
  });

  test('biedt bij twee maatregelen beide herstelacties afzonderlijk', () => {
    const account: Account = { ...ACTIVE, status: 'geblokkeerd', geblokkeerd: true, gedeactiveerd: true };
    const actions = handlers();
    const items = itemsFor(account, false, actions);
    expect(items.map((item) => item.label)).toStrictEqual(['Deblokkeren', 'Activeren']);
    items[0]?.onSelect();
    expect(actions.unblock).toHaveBeenCalledOnce();
    expect(actions.activate).not.toHaveBeenCalled();
    items[1]?.onSelect();
    expect(actions.activate).toHaveBeenCalledOnce();
    expect(accountStatusText(account)).toBe('Geblokkeerd, Gedeactiveerd');
  });

  test('deactiveren en blokkeren blijven afzonderlijk beschikbaar', () => {
    const blocked: Account = { ...ACTIVE, status: 'geblokkeerd', geblokkeerd: true };
    const deactivated: Account = { ...ACTIVE, status: 'gedeactiveerd', gedeactiveerd: true };
    expect(itemsFor(blocked, false, handlers()).map((item) => item.label)).toStrictEqual([
      'Deblokkeren',
      'Deactiveren',
    ]);
    expect(itemsFor(deactivated, false, handlers()).map((item) => item.label)).toStrictEqual([
      'Blokkeren',
      'Activeren',
    ]);
    expect(accountStatusText(blocked)).toBe('Geblokkeerd');
    expect(accountStatusText(deactivated)).toBe('Gedeactiveerd');
  });

  test('biedt geen uitschakelacties voor jezelf of een uitnodiging', () => {
    expect(itemsFor(ACTIVE, true, handlers())).toStrictEqual([]);
    expect(itemsFor({ ...ACTIVE, status: 'uitgenodigd' }, false, handlers())).toStrictEqual([]);
    expect(accountStatusText(ACTIVE)).toBe('Actief');
    expect(accountStatusText({ ...ACTIVE, status: 'uitgenodigd' })).toBe('Uitgenodigd');
  });
});

function show(account: Account) {
  render(
    <Table label="Accounts">
      <TableBody>
        <AccountRow account={account} myId={undefined} busy={false} onMessage={vi.fn()} />
      </TableBody>
    </Table>,
  );
}

describe('laatste login in de accountlijst', () => {
  test('toont Onbekend zolang geen geslaagde login geregistreerd is', () => {
    show(ACTIVE);
    expect(screen.getByRole('cell', { name: 'Onbekend' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('toont het tijdstip met de Amsterdamse tijdzone', () => {
    show({ ...ACTIVE, laatstIngelogd: '2026-10-21T08:30:00Z' });
    expect(screen.getByRole('cell', { name: '21 oktober 2026 om 10:30' })).toBeTruthy();
    expect(screen.queryByText('Onbekend')).toBeNull();
  });
});
