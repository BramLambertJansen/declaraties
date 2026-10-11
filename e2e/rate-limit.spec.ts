import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount, PASSWORD, totpFor, type TestAccount } from './support/accounts.ts';
import { collectCspViolations, scanAxe } from './support/axe.ts';
import { createInvitedAccount, mailCount } from './support/rate-limit.ts';

// Rate limit tegen de echte stack (spec rate-limit/AC-6): de echte grens van `duur` (10 per 60 s), geen testknop of
// aparte e2e-grens. CSP aan, axe op 375 en 1280 px met de melding van RATE_LIMITED zichtbaar.
const DUUR = 10;
const TOO_MANY = 'Te veel pogingen. Probeer het over een paar minuten opnieuw.';

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

test('AC-6: na 10 keer "Opnieuw uitnodigen" geeft de 11e de melding, en er staan precies 10 mails in Mailpit', async ({
  page,
}) => {
  const csp = collectCspViolations(page);
  // Een nieuwe admin: een eigen teller, los van andere tests.
  const admin = await createAccount('admin', { totp: true });
  const invited = await createInvitedAccount();
  await signInAsAdmin(page, admin);
  await page.goto('/admin/accounts');
  const again = page
    .getByRole('row')
    .filter({ hasText: invited.email })
    .getByRole('button', { name: 'Opnieuw uitnodigen' });

  const statuses: number[] = [];
  for (let i = 0; i <= DUUR; i += 1) {
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/reinvite')),
      again.click(),
    ]);
    statuses.push(response.status());
    await expect(again).toBeEnabled();
  }

  expect(statuses).toStrictEqual([...Array.from({ length: DUUR }, () => 200), 429]);
  await expect(page.getByRole('alert')).toHaveText(TOO_MANY);
  await expect.poll(() => mailCount(invited.email)).toBe(DUUR);
  // Geen late mail na de geweigerde poging.
  await page.waitForTimeout(500);
  expect(await mailCount(invited.email)).toBe(DUUR);

  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('alert')).toHaveText(TOO_MANY);
    await scanAxe(page);
  }
  expect(csp).toStrictEqual([]);
});
