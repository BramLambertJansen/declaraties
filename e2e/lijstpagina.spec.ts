import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount, PASSWORD, totpFor, type TestAccount } from './support/accounts.ts';

// Lijstpagina op /admin/accounts tegen de echte stack (spec lijstpagina): AC-1, AC-2, AC-4, AC-5 en AC-6.

async function signInAsAdmin(page: Page, admin: TestAccount): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(admin.email);
  await page.getByLabel('Wachtwoord').fill(PASSWORD);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await page.getByLabel('Code', { exact: true }).fill(totpFor(admin.totpSecret ?? ''));
  await page.getByRole('button', { name: 'Bevestigen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

test('AC-1 en AC-2: zoeken en filteren staan in de URL en overleven herladen', async ({ page }) => {
  const admin = await createAccount('admin', { totp: true });
  const gezocht = await createAccount('user', { name: 'Zoekbaar Lijstje' });
  await createAccount('user', { name: 'Andere Persoon' });
  await signInAsAdmin(page, admin);
  await page.goto('/admin/accounts');

  await page.getByLabel('Zoeken').fill('Zoekbaar');
  await expect(page).toHaveURL(/[?&]q=Zoekbaar/);
  const table = page.getByRole('region', { name: 'Accounts' });
  await expect(table.getByText(gezocht.email)).toBeVisible();
  await expect(table.getByText('Andere Persoon')).toHaveCount(0);

  await page.getByLabel('Rol', { exact: true }).selectOption('user');
  await page.reload();
  await expect(page.getByLabel('Zoeken')).toHaveValue('Zoekbaar');
  await expect(page.getByLabel('Rol', { exact: true })).toHaveValue('user');
  await expect(table.getByText(gezocht.email)).toBeVisible();
});

test('AC-4 en AC-5: Terug herstelt het filter; zonder treffers wist "Filters wissen" alles behalve de sortering', async ({
  page,
}) => {
  const admin = await createAccount('admin', { totp: true });
  await signInAsAdmin(page, admin);
  await page.goto('/admin/accounts');

  await page.getByLabel('Sorteren').selectOption('naam-az');
  await page.getByLabel('Rol', { exact: true }).selectOption('admin');
  await page.goBack();
  await expect(page.getByLabel('Rol', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Sorteren')).toHaveValue('naam-az');

  await page.getByLabel('Zoeken').fill('bestaat-echt-niet-xyz');
  await expect(page.getByText('Geen accounts gevonden. Pas je zoekopdracht of filters aan.')).toBeVisible();
  await page.getByRole('button', { name: 'Filters wissen' }).click();
  await expect(page).toHaveURL(/\/admin\/accounts\?sort=naam-az$/);
  await expect(page.getByLabel('Zoeken')).toBeFocused();
});

test('AC-6: een ongeldige URL toont de lijst met standaardwaarden, zonder foutmelding', async ({ page }) => {
  const admin = await createAccount('admin', { totp: true });
  await signInAsAdmin(page, admin);
  await page.goto('/admin/accounts?sort=onzin&rol=koning');

  await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible();
  await expect(page.getByLabel('Sorteren')).toHaveValue('nieuwste');
  await expect(page.getByLabel('Rol', { exact: true })).toHaveValue('');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
