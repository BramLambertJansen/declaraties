import { createFileRoute } from '@tanstack/react-router';
import { accountsSearch } from '#shared/contracts/accounts.ts';
import { AccountsPage } from '#web/features/accounts/accounts-page.tsx';
import { guard } from '#web/lib/session.ts';

export const Route = createFileRoute('/_app/admin/accounts')({
  // Ongeldige waarden worden de standaardwaarde, geen foutpagina (spec lijstpagina); de API valideert opnieuw.
  validateSearch: accountsSearch.web,
  beforeLoad: guard('accounts:read'),
  component: AccountsPage,
});
