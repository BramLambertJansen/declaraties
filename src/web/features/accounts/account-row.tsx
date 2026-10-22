import type { z } from 'zod';
import type { accountItem } from '#shared/contracts/accounts.ts';
import { format } from '#core/web/lib/format.ts';
import { copy } from '#web/copy/ui.ts';
import { TableCell, TableRow } from '#web/ui/index.ts';
import { AccountActions, type AccountMessage } from './row-actions.tsx';

type Account = z.output<typeof accountItem>;

export function accountStatusText(account: Account): string {
  const labels = [
    ...(account.geblokkeerd ? [copy.accounts.statuses.geblokkeerd] : []),
    ...(account.gedeactiveerd ? [copy.accounts.statuses.gedeactiveerd] : []),
  ];
  return labels.length === 0 ? copy.accounts.statuses[account.status] : labels.join(', ');
}

export function AccountRow({
  account,
  myId,
  busy,
  onMessage,
}: {
  account: Account;
  myId: string | undefined;
  busy: boolean;
  onMessage: (message: AccountMessage) => void;
}) {
  return (
    <TableRow>
      <TableCell>{account.naam}</TableCell>
      <TableCell>{account.email}</TableCell>
      <TableCell>{copy.accounts.roles[account.rol]}</TableCell>
      <TableCell>{accountStatusText(account)}</TableCell>
      <TableCell>
        {account.laatstIngelogd === null ? copy.accounts.unknownLogin : format.dateTime(account.laatstIngelogd)}
      </TableCell>
      <TableCell>
        {myId === undefined ? null : (
          <AccountActions account={account} isOwn={account.id === myId} busy={busy} onMessage={onMessage} />
        )}
      </TableCell>
    </TableRow>
  );
}
