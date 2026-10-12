import type { z } from 'zod';
import type { accountItem } from '#shared/contracts/accounts.ts';
import { copy } from '#web/copy/ui.ts';
import { Button, ConfirmDialog, DropdownMenu, Notice, useErrorText, type MenuItem } from '#web/ui/index.ts';
import { useBlock } from './queries.ts';

type Account = z.output<typeof accountItem>;

// Menu "Acties voor {naam}" van een rij (spec accountbeheer-uitbreiding): een actief account heeft "Blokkeren", een
// geblokkeerd account "Deblokkeren". Op de eigen rij ontbreekt "Blokkeren" (AC-14); een rij zonder acties krijgt geen leeg menu.
export function itemsFor(account: Account, isOwn: boolean, handlers: BlockHandlers): readonly MenuItem[] {
  if (account.status === 'geblokkeerd') {
    return [
      {
        label: copy.accounts.unblock,
        onSelect: () => {
          handlers.unblock(account);
        },
      },
    ];
  }
  if (account.status === 'actief' && !isOwn) {
    return [
      {
        label: copy.accounts.block,
        onSelect: () => {
          handlers.askBlock(account);
        },
      },
    ];
  }
  return [];
}

export interface BlockHandlers {
  readonly unblock: (account: Account) => void;
  readonly askBlock: (account: Account) => void;
}

export function RowMenu({ account, items }: { account: Account; items: readonly MenuItem[] }) {
  if (items.length === 0) return null;
  return (
    <DropdownMenu trigger={<Button variant="outline">{copy.accounts.rowActions(account.naam)}</Button>} items={items} />
  );
}

// Blokkeren vraagt bevestiging (ConfirmDialog, focus op "Annuleren"); een fout staat in de dialoog, gelukt sluit hem.
export function BlockDialog({
  target,
  onClose,
  onBlocked,
}: {
  target: Account | null;
  onClose: () => void;
  onBlocked: (account: Account) => void;
}) {
  const block = useBlock();
  const errorText = useErrorText();
  const confirm = () => {
    if (target === null) return;
    block.mutateAsync(target.id).then(
      () => {
        onBlocked(target);
      },
      () => undefined,
    );
  };
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          block.reset();
          onClose();
        }
      }}
      title={copy.accounts.blockDialog.title(target?.naam ?? '')}
      description={copy.accounts.blockDialog.description(target?.naam ?? '')}
      confirmLabel={copy.accounts.block}
      busy={block.isPending}
      onConfirm={confirm}
    >
      {block.isError ? <Notice tone="error">{errorText(block.error)}</Notice> : null}
    </ConfirmDialog>
  );
}
