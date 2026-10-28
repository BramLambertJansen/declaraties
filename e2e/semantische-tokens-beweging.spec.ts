import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { scanAxe } from './support/axe.ts';
import { signIn } from './support/eigen-account.ts';

// Spec semantische-tokens/AC-16: de open sheet-dialoog (hoofdmenu op een smal scherm) gebruikt --motion-normal (0,2 s);
// met prefers-reduced-motion kort de globale regel elke overgang in tot 0,01 ms. De sheet bestaat alleen onder md, dus
// alleen op 375 px.
async function openSheet(page: Page) {
  await signIn(page, await createAccount('admin', { totp: true }));
  await page.goto('/design-system');
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
  await page.locator('header').getByRole('button', { name: 'Menu openen' }).click();
  const sheet = page.getByRole('dialog', { name: 'Hoofdmenu' });
  await expect(sheet.getByRole('link', { name: 'Home' })).toBeVisible();
  return sheet;
}

// Berekende transition-duration (een lijst, per overgangseigenschap één waarde) met elke waarde ≤ 0,01 ms: Chromium
// schrijft 0.01ms als 1e-05s.
const AT_MOST_HUNDREDTH_MS = /^(?:(?:0|1e-05|0\.00001)s(?:,\s*|$))+$/;

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

test.describe('semantische tokens: beweging op 375 px', () => {
  test.use({ viewport: { width: 375, height: 900 } });

  test('semantische-tokens/AC-16: de open sheet-dialoog duurt 0,2 s', async ({ page }) => {
    // playwright.config.ts zet reducedMotion standaard op reduce; deze test meet de duur zonder die voorkeur.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const sheet = await openSheet(page);
    await expect(sheet).toHaveCSS('transition-duration', '0.2s');
    await scanAxe(page);
  });

  test('semantische-tokens/AC-16: met reducedMotion reduce is de duur ≤ 0,01 ms', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const sheet = await openSheet(page);
    await expect(sheet).toHaveCSS('transition-duration', AT_MOST_HUNDREDTH_MS);
    await scanAxe(page);
  });
});
