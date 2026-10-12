import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount, PASSWORD, totpFor, type TestAccount } from './support/accounts.ts';
import { collectCspViolations, scanAxe } from './support/axe.ts';

// Account blokkeren en deblokkeren in de UI (spec accountbeheer-uitbreiding, AC-11, AC-12 en AC-14; ADR 0026) tegen de
// echte stack: CSP aan, axe op 375 en 1280 px. De rest van de acceptatiecriteria staat in test/api/account-blocking.int.test.ts.

async function axeAtBothWidths(page: Page): Promise<void> {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await scanAxe(page);
  }
}

async function signIn(page: Page, account: { email: string }): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(account.email);
  await page.getByLabel('Wachtwoord').fill(PASSWORD);
  await page.getByRole('button', { name: 'Inloggen' }).click();
}

async function signInAsAdmin(page: Page, admin: TestAccount): Promise<void> {
  await signIn(page, admin);
  await page.getByLabel('Code', { exact: true }).fill(totpFor(admin.totpSecret ?? ''));
  await page.getByRole('button', { name: 'Bevestigen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

test('AC-11 en AC-12: blokkeren met bevestiging, de user is uitgelogd en ziet de gewone inlogfout; deblokkeren zonder dialoog', async ({
  browser,
  page,
}) => {
  const csp = collectCspViolations(page);
  const admin = await createAccount('admin', { totp: true });
  const user = await createAccount('user', { name: 'Bea Blokkade' });
  const userPage = await (await browser.newContext({ extraHTTPHeaders: clientIpHeaders() })).newPage();
  await signIn(userPage, user);
  await expect(userPage.getByRole('heading', { level: 1 })).toHaveText('Home');

  await signInAsAdmin(page, admin);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin/accounts');
  const row = page.getByRole('row').filter({ hasText: user.email });
  await expect(row).toContainText('Actief');
  await row.getByRole('button', { name: 'Acties voor Bea Blokkade' }).click();
  await expect(page.getByRole('menuitem', { name: 'Deblokkeren', exact: true })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Blokkeren', exact: true }).click();

  const dialog = page.getByRole('alertdialog', { name: 'Bea Blokkade blokkeren?' });
  await expect(dialog).toContainText(
    'Bea Blokkade wordt direct overal uitgelogd en kan niet meer inloggen tot je het account deblokkeert.',
  );
  await expect(dialog.getByRole('button', { name: 'Annuleren' })).toBeFocused();
  await axeAtBothWidths(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await dialog.getByRole('button', { name: 'Blokkeren' }).click();

  await expect(page.getByRole('status')).toHaveText('Bea Blokkade is geblokkeerd.');
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('Geblokkeerd');
  expect((await userPage.request.get('/api/me')).status()).toBe(401);
  await signIn(userPage, user);
  await expect(userPage.getByRole('alert')).toHaveText('E-mailadres of wachtwoord klopt niet.');

  await row.getByRole('button', { name: 'Acties voor Bea Blokkade' }).click();
  await expect(page.getByRole('menuitem', { name: 'Blokkeren', exact: true })).toHaveCount(0);
  await axeAtBothWidths(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('menuitem', { name: 'Deblokkeren', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Bea Blokkade is gedeblokkeerd.');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(row).toContainText('Actief');

  await signIn(userPage, user);
  await expect(userPage.getByRole('heading', { level: 1 })).toHaveText('Home');
  expect(csp).toStrictEqual([]);
});

test('AC-11: annuleren in de dialoog blokkeert niet', async ({ page }) => {
  const admin = await createAccount('admin', { totp: true });
  const user = await createAccount('user', { name: 'Cor Annuleer' });
  await signInAsAdmin(page, admin);
  await page.goto('/admin/accounts');
  const row = page.getByRole('row').filter({ hasText: user.email });
  await row.getByRole('button', { name: 'Acties voor Cor Annuleer' }).click();
  await page.getByRole('menuitem', { name: 'Blokkeren', exact: true }).click();
  await page
    .getByRole('alertdialog', { name: 'Cor Annuleer blokkeren?' })
    .getByRole('button', { name: 'Annuleren' })
    .click();

  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(row).toContainText('Actief');
});

test('AC-14: de eigen actieve rij heeft geen menuknop, andere actieve rijen wel', async ({ page }) => {
  const admin = await createAccount('admin', { totp: true, name: 'Dirk Eigen' });
  const other = await createAccount('user', { name: 'Eva Ander' });
  await signInAsAdmin(page, admin);
  await page.goto('/admin/accounts');
  const ownRow = page.getByRole('row').filter({ hasText: admin.email });
  const otherRow = page.getByRole('row').filter({ hasText: other.email });

  await expect(ownRow).toContainText('Actief');
  await expect(otherRow.getByRole('button', { name: 'Acties voor Eva Ander' })).toBeVisible();
  await expect(ownRow.getByRole('button', { name: /^Acties voor/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Acties voor Dirk Eigen' })).toHaveCount(0);
  await axeAtBothWidths(page);
});
