import { expect, test } from '@playwright/test';
import { clientIpHeaders, createAccount, PASSWORD } from './support/accounts.ts';
import { collectCspViolations } from './support/axe.ts';
import { axeAtBothWidths, openAccount, secondDevice, signIn } from './support/eigen-account.ts';

// Spec eigen-account: naam en wachtwoord tegen de echte stack (CSP aan, axe op 375 en 1280 px). /change-password heeft een
// rate limit per IP en pad (3 per 10 s): elke test heeft een eigen IP (clientIpHeaders).
const NEW_PASSWORD = 'nieuw-'.repeat(3);

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

test('AC-1 en AC-2: via het profielmenu naar /account; naam wijzigen werkt door in het menu en /api/me', async ({
  page,
}) => {
  const csp = collectCspViolations(page);
  const user = await createAccount('user', { name: 'Gert Gebruiker' });
  await signIn(page, user);
  await openAccount(page);
  await expect(page).toHaveURL(/\/account$/);
  await axeAtBothWidths(page);

  const naam = page.getByRole('textbox', { name: 'Naam' });
  await expect(naam).toHaveValue('Gert Gebruiker');
  await naam.fill('Nieuwe Naam');
  await naam.press('Enter');

  await expect(page.getByRole('status')).toHaveText('Je naam is opgeslagen.');
  await expect(page.getByRole('button', { name: 'Profielmenu' })).toHaveText('NN');
  expect(await (await page.request.get('/api/me')).json()).toMatchObject({ naam: 'Nieuwe Naam' });
  expect(csp).toStrictEqual([]);
});

test('naam leeg: veldfout uit de spec, geen request', async ({ page }) => {
  const user = await createAccount('user');
  await signIn(page, user);
  await page.goto('/account');
  await page.getByRole('textbox', { name: 'Naam' }).fill('  ');
  await page.getByRole('button', { name: 'Naam opslaan' }).click();

  await expect(page.getByText('Vul een naam in.')).toBeVisible();
});

test('AC-3: wachtwoord wijzigen beëindigt de andere sessie; alleen het nieuwe wachtwoord werkt', async ({
  browser,
  page,
}) => {
  const csp = collectCspViolations(page);
  const user = await createAccount('user');
  await signIn(page, user);
  const other = await secondDevice(browser, user);
  await page.goto('/account');

  await page.getByLabel('Huidig wachtwoord').fill(PASSWORD);
  await page.getByLabel('Nieuw wachtwoord', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Nieuw wachtwoord herhalen').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Wachtwoord wijzigen' }).click();

  await expect(page.getByRole('status')).toHaveText('Je wachtwoord is gewijzigd. Je andere sessies zijn beëindigd.');
  expect((await other.request.get('/api/me')).status()).toBe(401);
  expect((await page.request.get('/api/me')).status()).toBe(200);
  const fresh = await secondDevice(browser, user, NEW_PASSWORD);
  expect((await fresh.request.get('/api/me')).status()).toBe(200);
  expect(csp).toStrictEqual([]);
});

test('AC-4: een admin met MFA wijzigt zijn wachtwoord en houdt /admin/accounts zonder nieuwe code', async ({
  page,
}) => {
  const admin = await createAccount('admin', { totp: true });
  await signIn(page, admin);
  await page.goto('/account');
  await page.getByLabel('Huidig wachtwoord').fill(PASSWORD);
  await page.getByLabel('Nieuw wachtwoord', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Nieuw wachtwoord herhalen').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Wachtwoord wijzigen' }).click();
  await expect(page.getByRole('status')).toHaveText('Je wachtwoord is gewijzigd. Je andere sessies zijn beëindigd.');

  await page.goto('/admin/accounts');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Accounts');
  expect((await page.request.get('/api/accounts')).status()).toBe(200);
});

test('AC-5: fout huidig wachtwoord: de spectekst met de focus erop, en niets gewijzigd', async ({ browser, page }) => {
  const user = await createAccount('user');
  await signIn(page, user);
  const other = await secondDevice(browser, user);
  await page.goto('/account');
  await page.getByLabel('Huidig wachtwoord').fill(NEW_PASSWORD);
  await page.getByLabel('Nieuw wachtwoord', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Nieuw wachtwoord herhalen').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Wachtwoord wijzigen' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toHaveText('Je huidige wachtwoord klopt niet.');
  await expect(alert).toBeFocused();
  expect((await other.request.get('/api/me')).status()).toBe(200);
});
