import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { scanAxe } from './support/axe.ts';
import { signIn } from './support/eigen-account.ts';

// Spec semantische-tokens/AC-6: met theme.css zonder override blijft de standaard gelijk aan de huidige Tailwind-waarden.
// Een Button is 44 px hoog (--density-control via --control-h) en body heeft 16 px (--type-base), in licht en donker.
async function openCatalog(page: Page) {
  await signIn(page, await createAccount('admin', { totp: true }));
  await page.goto('/design-system');
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
}

async function expectDefaults(page: Page) {
  await expect(page.getByRole('button', { name: 'Dialoog openen' })).toHaveCSS('min-height', '44px');
  await expect(page.locator('body')).toHaveCSS('font-size', '16px');
}

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

for (const width of [375, 1280]) {
  test.describe(`semantische tokens op ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('semantische-tokens/AC-6: Button 44 px hoog en body 16 px, in licht en donker', async ({ page }) => {
      await openCatalog(page);
      await expectDefaults(page);
      await scanAxe(page);

      await page.getByRole('button', { name: 'Donker thema' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expectDefaults(page);
      await scanAxe(page);
    });
  });
}
