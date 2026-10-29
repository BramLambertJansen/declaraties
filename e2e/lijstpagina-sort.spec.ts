import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount, PASSWORD, totpFor, type TestAccount } from './support/accounts.ts';

// Lijstpagina op /admin/accounts tegen de echte stack (spec lijstpagina): AC-3, de UI-flow. De API-kant staat in
// test/api/accounts-sort.int.test.ts.

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

async function names(page: Page): Promise<string[]> {
  const cells = page.getByRole('region', { name: 'Accounts' }).getByRole('row').locator('td:first-child');
  return (await cells.allTextContents()).map((text) => text.trim());
}

// lijstpagina/AC-3
test('AC-3: Naam A–Z en "Meer laden" vullen de lijst aan, in volgorde en zonder dubbele of ontbrekende rijen', async ({
  page,
}) => {
  const admin = await createAccount('admin', { totp: true });
  const prefix = `Sorteer${Date.now().toString(36)}`;
  // Bewust niet alfabetisch aangemaakt: de volgorde moet van de sortering komen.
  const expected = Array.from({ length: 30 }, (_, i) => `${prefix} ${String((i * 7) % 30).padStart(2, '0')}`);
  for (const name of expected) await createAccount('user', { name });
  await signInAsAdmin(page, admin);
  await page.goto('/admin/accounts');

  await page.getByLabel('Sorteren').selectOption('naam-az');
  await expect(page).toHaveURL(/sort=naam-az/);
  await page.getByLabel('Zoeken').fill(prefix);
  const more = page.getByRole('button', { name: 'Meer laden' });
  // Zonder deze wachtstap zou de ongefilterde pagina (ook 25 rijen) al aan de telling voldoen.
  await expect(page).toHaveURL(new RegExp(`q=${prefix}`));
  await expect(page.getByRole('region', { name: 'Accounts' }).getByRole('cell', { name: prefix }).last()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Accounts' }).getByRole('row')).toHaveCount(26);
  const first = await names(page);
  expect(first).toHaveLength(25);

  await more.click();
  await expect(page.getByRole('region', { name: 'Accounts' }).getByRole('row')).toHaveCount(31);
  const all = await names(page);

  expect(all.slice(0, first.length)).toStrictEqual(first);
  expect(all).toStrictEqual([...expected].sort());
  expect(new Set(all).size).toBe(all.length);
  await expect(more).toHaveCount(0);
});
