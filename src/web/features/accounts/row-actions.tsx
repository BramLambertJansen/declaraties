import { useState } from 'react';
import type { z } from 'zod';
import type { accountItem } from '#shared/contracts/accounts.ts';
import { copy } from '#web/copy/ui.ts';
import { Button, DropdownMenu, useErrorText, type MenuItem } from '#web/ui/index.ts';
import { useActivate, useReinvite, useUnblock } from './queries.ts';
import { AccountStatusDialog } from './account-status-dialog.tsx';

type Account = z.output<typeof accountItem>;
export type AccountMessage = { readonly tone: 'info' | 'error'; readonly text: string } | null;

export interface AccountHandlers {
  readonly unblock: () => void;
  readonly activate: () => void;
  readonly askBlock: () => void;
  readonly askDeactivate: () => void;
}

export function itemsFor(account: Account, isOwn: boolean, handlers: AccountHandlers): readonly MenuItem[] {
  if (account.status === 'uitgenodigd' || isOwn) return [];
  return [
    account.geblokkeerd
      ? { label: copy.accounts.unblock, onSelect: handlers.unblock }
      : { label: copy.accounts.block, onSelect: handlers.askBlock },
    account.gedeactiveerd
      ? { label: copy.accounts.activate, onSelect: handlers.activate }
      : { label: copy.accounts.deactivate, onSelect: handlers.askDeactivate },
  ];
}

export function AccountActions({
  account,
  isOwn,
  busy,
  onMessage,
}: {
  account: Account;
  isOwn: boolean;
  busy: boolean;
  onMessage: (message: AccountMessage) => void;
}) {
  const unblock = useUnblock();
  const activate = useActivate();
  const reinvite = useReinvite();
  const [confirming, setConfirming] = useState<'block' | 'deactivate' | null>(null);
  const errorText = useErrorText();
  const pending = unblock.isPending || activate.isPending || reinvite.isPending;
  const succeed = (text: string) => {
    setConfirming(null);
    onMessage({ tone: 'info', text });
  };
  const fail = (error: unknown) => {
    onMessage({ tone: 'error', text: errorText(error) });
  };
  const ask = (action: 'block' | 'deactivate') => {
    onMessage(null);
    setConfirming(action);
  };
  const items = itemsFor(account, isOwn, {
    unblock: () => {
      onMessage(null);
      unblock.mutateAsync(account.id).then(() => {
        succeed(copy.accounts.unblocked(account.naam));
      }, fail);
    },
    activate: () => {
      onMessage(null);
      activate.mutateAsync(account.id).then(() => {
        succeed(copy.accounts.activated(account.naam));
      }, fail);
    },
    askBlock: () => {
      ask('block');
    },
    askDeactivate: () => {
      ask('deactivate');
    },
  });
  if (account.status === 'uitgenodigd') {
    return (
      <Button
        variant="outline"
        disabled={busy || pending}
        onClick={() => {
          onMessage(null);
          reinvite.mutateAsync(account.id).then(() => {
            succeed(copy.inviteDialog.sent(account.email));
          }, fail);
        }}
      >
        {copy.accounts.reinvite}
      </Button>
    );
  }
  if (items.length === 0) return null;
  return (
    <>
      <DropdownMenu
        trigger={
          <Button variant="outline" disabled={busy || pending}>
            {copy.accounts.rowActions(account.naam)}
          </Button>
        }
        items={items.map((item) => ({ ...item, disabled: busy || pending }))}
      />
      <AccountStatusDialog
        account={account}
        action={confirming}
        onClose={() => {
          setConfirming(null);
        }}
        onChanged={succeed}
      />
    </>
  );
}
