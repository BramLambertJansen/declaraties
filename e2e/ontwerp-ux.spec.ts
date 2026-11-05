import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { signIn } from './support/eigen-account.ts';
import { uxScreenshot } from './support/ux.ts';

// Spec ontwerp-overnemen/AC-13: `uxScreenshot` maakt de screenshots die de reviewer in Modus UX met Read bekijkt.
// Draait in de runner van `pnpm ui:check` (Chromium staat niet in de agent-sandbox).
const VIEWPORT = { width: 800, height: 700 };

async function openCatalog(page: Page) {
  await signIn(page, await createAccount('admin', { totp: true }));
  await page.goto('/design-system');
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
}

// Breedte uit de IHDR-chunk van een PNG (bytes 16–19, big-endian), na de vaste signatuur.
function pngWidth(file: Buffer): number {
  expect(file.subarray(1, 4).toString('ascii'), 'PNG-signatuur').toBe('PNG');
  return file.readUInt32BE(16);
}

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

test.describe('UX-screenshots', () => {
  test.use({ viewport: VIEWPORT });

  test('ontwerp-overnemen/AC-13: uxScreenshot schrijft ux-design-system-375.png en -1280.png en herstelt de viewport', async ({
    page,
  }, testInfo) => {
    await openCatalog(page);

    await uxScreenshot(page, testInfo, 'design-system');

    for (const width of [375, 1280]) {
      const file = readFileSync(testInfo.outputPath(`ux-design-system-${String(width)}.png`));
      expect(file.length, `ux-design-system-${String(width)}.png is niet leeg`).toBeGreaterThan(0);
      expect(pngWidth(file), `breedte van ux-design-system-${String(width)}.png`).toBe(width);
    }
    expect(page.viewportSize()).toStrictEqual(VIEWPORT);
  });
});
