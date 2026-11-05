import type { z } from 'zod';
import type { accountItem } from '#shared/contracts/accounts.ts';
import { copy } from '#web/copy/ui.ts';
import { ConfirmDialog, Notice, useErrorText } from '#web/ui/index.ts';
import { useBlock, useDeactivate } from './queries.ts';

export function AccountStatusDialog({
  account,
  action,
  onClose,
  onChanged,
}: {
  account: z.output<typeof accountItem>;
  action: 'block' | 'deactivate' | null;
  onClose: () => void;
  onChanged: (text: string) => void;
}) {
  const block = useBlock();
  const deactivate = useDeactivate();
  const mutation = action === 'block' ? block : deactivate;
  const errorText = useErrorText();
  return (
    <ConfirmDialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open) {
          block.reset();
          deactivate.reset();
          onClose();
        }
      }}
      title={
        action === 'block'
          ? copy.accounts.blockDialog.title(account.naam)
          : copy.accounts.deactivateDialog.title(account.naam)
      }
      description={
        action === 'block'
          ? copy.accounts.blockDialog.description(account.naam)
          : copy.accounts.deactivateDialog.description
      }
      confirmLabel={action === 'block' ? copy.accounts.block : copy.accounts.deactivate}
      busy={mutation.isPending}
      onConfirm={() => {
        if (action === null) return;
        const text = action === 'block' ? copy.accounts.blocked(account.naam) : copy.accounts.deactivated(account.naam);
        mutation.mutateAsync(account.id).then(
          () => {
            onChanged(text);
          },
          () => undefined,
        );
      }}
    >
      {mutation.isError ? <Notice tone="error">{errorText(mutation.error)}</Notice> : null}
    </ConfirmDialog>
  );
}
