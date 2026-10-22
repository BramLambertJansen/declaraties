import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount, PASSWORD, totpFor, type TestAccount } from './support/accounts.ts';
import { collectCspViolations } from './support/axe.ts';
import { axeAtBothWidths } from './support/eigen-account.ts';

async function attemptLogin(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(account.email);
  await page.getByLabel('Wachtwoord').fill(PASSWORD);
  await page.getByRole('button', { name: 'Inloggen' }).click();
}

async function adminLogin(page: Page, account: TestAccount): Promise<void> {
  await attemptLogin(page, account);
  await page.getByLabel('Code', { exact: true }).fill(totpFor(account.totpSecret ?? ''));
  await page.getByRole('button', { name: 'Bevestigen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
}

async function filterStatus(page: Page, status: 'geblokkeerd' | 'gedeactiveerd'): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => {
      const url = new URL(candidate.url());
      return url.pathname === '/api/accounts' && url.searchParams.get('status') === status;
    }),
    page.getByRole('combobox', { name: 'Status', exact: true }).selectOption(status),
  ]);
  expect(response.status()).toBe(200);
}

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

test('account-lifecycle: laatste login, afzonderlijk uitschakelen en herstellen, filters en toegankelijkheid', async ({
  browser,
  page,
}) => {
  test.slow();
  const admin = await createAccount('admin', { totp: true });
  const user = await createAccount('user', { name: 'Lifecycle Gebruiker' });
  const userContext = await browser.newContext({ extraHTTPHeaders: clientIpHeaders() });
  const userPage = await userContext.newPage();
  const csp = collectCspViolations(page);
  const userCsp = collectCspViolations(userPage);
  await attemptLogin(userPage, user);
  await expect(userPage.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  const oldCookies = await userContext.cookies();
  await adminLogin(page, admin);
  await page.goto('/admin/accounts');
  await expect(page.getByRole('columnheader', { name: 'Laatst ingelogd' })).toBeVisible();

  const invitedEmail = user.email.replace('user-', 'lifecycle-invited-');
  await page.getByRole('button', { name: 'Account uitnodigen' }).click();
  const invitation = page.getByRole('dialog', { name: 'Account uitnodigen' });
  await invitation.getByLabel('Naam').fill('Lifecycle Uitgenodigd');
  await invitation.getByLabel('E-mailadres').fill(invitedEmail);
  await invitation.getByLabel('Rol').selectOption({ label: 'Gebruiker' });
  await invitation.getByRole('button', { name: 'Uitnodiging versturen' }).click();
  await expect(invitation).toBeHidden();
  await page.goto(`/admin/accounts?q=${encodeURIComponent(invitedEmail)}`);
  const invitedRow = page.getByRole('row').filter({ hasText: invitedEmail });
  await expect(invitedRow).toContainText('Uitgenodigd');
  await expect(invitedRow.getByRole('cell', { name: 'Onbekend', exact: true })).toBeVisible();
  await axeAtBothWidths(page);

  const accountPath = `/admin/accounts?q=${encodeURIComponent(user.email)}`;
  await page.goto(accountPath);
  const row = page.getByRole('row').filter({ hasText: user.email });
  await expect(row).toContainText('Actief');
  await expect(row.getByRole('cell').nth(4)).toHaveText(/\d{1,2} \S+ \d{4} om \d{2}:\d{2}/);
  const lastLogin = await row.getByRole('cell').nth(4).innerText();
  await row.getByRole('button', { name: 'Acties voor Lifecycle Gebruiker' }).click();
  await page.getByRole('menuitem', { name: 'Deactiveren', exact: true }).click();
  const deactivation = page.getByRole('alertdialog', { name: 'Lifecycle Gebruiker deactiveren?' });
  await expect(deactivation.getByRole('button', { name: 'Annuleren' })).toBeFocused();
  await expect(deactivation).toContainText('Activeren heft een eventuele blokkade niet op.');
  await axeAtBothWidths(page);
  await deactivation.getByRole('button', { name: 'Deactiveren', exact: true }).click();
  await expect(deactivation).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('Lifecycle Gebruiker is gedeactiveerd.');
  await expect(row).toContainText('Gedeactiveerd');
  await expect(row.getByRole('cell').nth(4)).toHaveText(lastLogin);
  expect((await userPage.request.get('/api/me')).status()).toBe(401);
  await attemptLogin(userPage, user);
  await expect(userPage.getByRole('alert')).toHaveText('E-mailadres of wachtwoord klopt niet.');

  await row.getByRole('button', { name: 'Acties voor Lifecycle Gebruiker' }).click();
  await page.getByRole('menuitem', { name: 'Blokkeren', exact: true }).click();
  const blocking = page.getByRole('alertdialog', { name: 'Lifecycle Gebruiker blokkeren?' });
  await blocking.getByRole('button', { name: 'Blokkeren', exact: true }).click();
  await expect(blocking).toBeHidden();
  await expect(row).toContainText('Geblokkeerd, Gedeactiveerd');
  await filterStatus(page, 'geblokkeerd');
  await expect(row).toContainText('Geblokkeerd, Gedeactiveerd');
  await filterStatus(page, 'gedeactiveerd');
  await expect(row).toContainText('Geblokkeerd, Gedeactiveerd');

  await page.goto(accountPath);
  await row.getByRole('button', { name: 'Acties voor Lifecycle Gebruiker' }).click();
  await page.getByRole('menuitem', { name: 'Activeren', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Lifecycle Gebruiker is geactiveerd. Een eventuele blokkade blijft gelden.',
  );
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(row).toContainText('Geblokkeerd');
  await expect(row).not.toContainText('Gedeactiveerd');
  await attemptLogin(userPage, user);
  await expect(userPage.getByRole('alert')).toHaveText('E-mailadres of wachtwoord klopt niet.');

  await row.getByRole('button', { name: 'Acties voor Lifecycle Gebruiker' }).click();
  await page.getByRole('menuitem', { name: 'Deblokkeren', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Lifecycle Gebruiker is gedeblokkeerd.');
  await expect(row).toContainText('Actief');
  await userContext.addCookies(oldCookies);
  expect((await userPage.request.get('/api/me')).status()).toBe(401);
  const recoveredContext = await browser.newContext({ extraHTTPHeaders: clientIpHeaders() });
  const recoveredPage = await recoveredContext.newPage();
  const recoveredCsp = collectCspViolations(recoveredPage);
  await attemptLogin(recoveredPage, user);
  await expect(recoveredPage.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  expect((await recoveredPage.request.get('/api/me')).status()).toBe(200);
  await page.reload();
  await expect(row.getByRole('cell').nth(4)).not.toHaveText('Onbekend');
  expect([...csp, ...userCsp, ...recoveredCsp]).toStrictEqual([]);
  await Promise.all([userContext.close(), recoveredContext.close()]);
});
