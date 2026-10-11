import { useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import type { z } from 'zod';
import { ACCOUNT_SORTS, ROLLEN, accountsSearch, STATUSSEN, type accountItem } from '#shared/contracts/accounts.ts';
import { useListSearch } from '#core/web/lib/list-search.ts';
import { copy } from '#web/copy/ui.ts';
import {
  AsyncView,
  Button,
  ListToolbar,
  Notice,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useErrorText,
  type SelectOption,
} from '#web/ui/index.ts';
import { InviteDialog } from './invite-dialog.tsx';
import { useAccounts, useReinvite } from './queries.ts';

type Account = z.output<typeof accountItem>;
type Message = { readonly tone: 'info' | 'error'; readonly text: string } | null;

const roleOptions: readonly SelectOption[] = [
  { value: '', label: copy.accounts.allRoles },
  ...ROLLEN.map((rol) => ({ value: rol, label: copy.accounts.roles[rol] })),
];
const statusOptions: readonly SelectOption[] = [
  { value: '', label: copy.accounts.allStatuses },
  ...STATUSSEN.map((status) => ({ value: status, label: copy.accounts.statuses[status] })),
];
const sortOptions: readonly SelectOption[] = ACCOUNT_SORTS.map((sort) => ({
  value: sort,
  label: copy.accounts.sorts[sort],
}));

// Eerste voorkomen wint: keyset-paginering kan een rij op een volgende pagina terugbrengen (spec lijstpagina).
function uniqueById(items: readonly Account[]): Account[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && seen.add(item.id));
}

function AccountsTable({
  items,
  busy,
  onMessage,
}: {
  items: readonly Account[];
  busy: boolean;
  onMessage: (message: Message) => void;
}) {
  const reinvite = useReinvite();
  const errorText = useErrorText();
  const again = (account: Account) => {
    reinvite.mutateAsync(account.id).then(
      () => {
        onMessage({ tone: 'info', text: copy.inviteDialog.sent(account.email) });
      },
      (error: unknown) => {
        onMessage({ tone: 'error', text: errorText(error) });
      },
    );
  };
  return (
    <Table label={copy.accounts.title} aria-busy={busy}>
      <TableHeader>
        <TableRow>
          <TableHead>{copy.accounts.name}</TableHead>
          <TableHead>{copy.accounts.email}</TableHead>
          <TableHead>{copy.accounts.role}</TableHead>
          <TableHead>{copy.accounts.status}</TableHead>
          <TableHead>
            <span className="sr-only">{copy.accounts.actions}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((account) => (
          <TableRow key={account.id}>
            <TableCell>{account.naam}</TableCell>
            <TableCell>{account.email}</TableCell>
            <TableCell>{copy.accounts.roles[account.rol]}</TableCell>
            <TableCell>{copy.accounts.statuses[account.status]}</TableCell>
            <TableCell>
              {account.status === 'uitgenodigd' ? (
                <Button
                  variant="outline"
                  disabled={reinvite.isPending}
                  onClick={() => {
                    again(account);
                  }}
                >
                  {copy.accounts.reinvite}
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Accountlijst (spec accountbeheer): laden, leeg en fout via AsyncView; "Meer laden" met de cursor; uitnodigen in een dialoog.
export function AccountsPage() {
  const list = useListSearch();
  // De router laat ongeldige sleutels uit de URL staan (hij voegt de search van de ouder samen): opnieuw schonen vóór gebruik.
  const route = accountsSearch.web.parse(useSearch({ from: '/_app/admin/accounts' }));
  const accounts = useAccounts(route);
  const filtered = route.q !== undefined || route.rol !== undefined || route.status !== undefined;
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={copy.accounts.title}
        actions={
          <Button
            onClick={() => {
              setMessage(null);
              setInviting(true);
            }}
          >
            {copy.accounts.invite}
          </Button>
        }
      />
      {message === null ? null : <Notice tone={message.tone}>{message.text}</Notice>}
      <ListToolbar
        searchLabel={copy.accounts.search}
        searchHint={copy.accounts.searchHint}
        query={route.q ?? ''}
        onQueryChange={list.setQuery}
        filters={[
          {
            id: 'rol',
            label: copy.accounts.role,
            value: route.rol ?? '',
            options: roleOptions,
            onChange: (value) => {
              list.setFilter('rol', value);
            },
          },
          {
            id: 'status',
            label: copy.accounts.status,
            value: route.status ?? '',
            options: statusOptions,
            onChange: (value) => {
              list.setFilter('status', value);
            },
          },
        ]}
        sortLabel={copy.accounts.sort}
        sort={route.sort ?? accountsSearch.defaultSort}
        sortOptions={sortOptions}
        onSortChange={list.setSort}
        onClear={list.clear}
      />
      <AsyncView
        query={accounts}
        isEmpty={(data) => data.pages.every((page) => page.items.length === 0)}
        emptyText={filtered ? copy.accounts.emptyFiltered : copy.accounts.empty}
      >
        {(data) => {
          const rows = uniqueById(data.pages.flatMap((page) => page.items));
          return (
            <div className="flex min-w-0 flex-col gap-4">
              <p aria-live="polite" className="text-sm text-muted-foreground">
                {accounts.isPlaceholderData
                  ? copy.accounts.loading
                  : copy.accounts.shown(rows.length, accounts.hasNextPage)}
              </p>
              <AccountsTable items={rows} busy={accounts.isPlaceholderData} onMessage={setMessage} />
              {accounts.hasNextPage ? (
                <div>
                  <Button
                    variant="outline"
                    disabled={accounts.isFetchingNextPage}
                    onClick={() => void accounts.fetchNextPage()}
                  >
                    {copy.accounts.more}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        }}
      </AsyncView>
      <InviteDialog
        open={inviting}
        onOpenChange={setInviting}
        onInvited={(email) => {
          setMessage({ tone: 'info', text: copy.inviteDialog.sent(email) });
        }}
      />
    </div>
  );
}
