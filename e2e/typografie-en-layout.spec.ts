import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { scanAxe } from './support/axe.ts';
import { signIn } from './support/eigen-account.ts';

// Spec typografie-en-layout/AC-11: de voorbeelden van Text, Heading, Stack en Inline op /design-system zijn axe-schoon in
// licht en donker. Deze suite draait in `pnpm ui:check`.
async function openCatalog(page: Page) {
  await signIn(page, await createAccount('admin', { totp: true }));
  await page.goto('/design-system?vak=layout');
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Text, Heading, Stack en Inline' })).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

test('typografie-en-layout/AC-11: typografie- en layoutvoorbeelden zijn axe-schoon in licht en donker', async ({
  page,
}) => {
  await openCatalog(page);
  await scanAxe(page);

  await page.getByRole('button', { name: 'Donker thema' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await scanAxe(page);
});
