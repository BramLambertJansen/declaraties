import { expect, test } from '@playwright/test';
import { clientIpHeaders, createAccount, PASSWORD, totpFor } from './support/accounts.ts';

// Schil toegankelijk (roadmap 3f) tegen de echte stack: paginatitel per scherm (WCAG 2.4.2), skip-link als eerste
// Tab-stop (2.4.1) en de focus naar de h1 na een routewissel (2.4.3).

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

test('titel per scherm, skip-link en focus na navigeren', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveTitle(/^Inloggen · /);

  const admin = await createAccount('admin', { totp: true });
  await page.getByLabel('E-mailadres').fill(admin.email);
  await page.getByLabel('Wachtwoord').fill(PASSWORD);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await page.getByLabel('Code', { exact: true }).fill(totpFor(admin.totpSecret ?? ''));
  await page.getByRole('button', { name: 'Bevestigen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page).toHaveTitle(/^Dashboard · /);

  // Vers geladen pagina: de eerste Tab komt op de skip-link, Enter zet de focus in de inhoud.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Naar de inhoud' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();

  await expect(page).not.toHaveURL(/#/);

  // De links naar Accounts en Design system staan op het dashboard; terug via het hoofdmenu.
  const main = page.getByRole('main');
  await main.getByRole('link', { name: 'Accounts' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeFocused();
  await expect(page).toHaveTitle(/^Accounts · /);

  await page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeFocused();

  // Een lazy route (/design-system): titel klopt; de focus op de h1 is daar nog een open punt (roadmap 3f).
  await main.getByRole('link', { name: 'Design system' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
  await expect(page).toHaveTitle(/^Design system · /);
});
