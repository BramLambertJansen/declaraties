import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount, PASSWORD, totpFor } from './support/accounts.ts';
import { collectCspViolations, scanAxe } from './support/axe.ts';

async function openCatalogue(page: Page) {
  const admin = await createAccount('admin', { totp: true });
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(admin.email);
  await page.getByLabel('Wachtwoord').fill(PASSWORD);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await page.getByLabel('Code', { exact: true }).fill(totpFor(admin.totpSecret ?? ''));
  await page.getByRole('button', { name: 'Bevestigen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await page.goto('/design-system');
  // De catalogus laadt lazy; hetzelfde gereedheidspatroon als de bestaande UI-basics-tests.
  await page.getByRole('region', { name: 'Componentenindex' }).waitFor();
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
}

for (const width of [375, 1280]) {
  test.describe(`catalogusdekking op ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test.beforeEach(async ({ context }) => {
      await context.setExtraHTTPHeaders(clientIpHeaders());
    });

    test('ieder indexitem heeft een werkend, focusbaar voorbeeld; zoeken blijft behouden', async ({ page }) => {
      await openCatalogue(page);
      const index = page.getByRole('region', { name: 'Componentenindex' });
      const rows = index.getByRole('row');
      const controls = index.getByRole('button', { name: /^Toon / });
      const count = await controls.count();
      expect(count).toBeGreaterThan(0);
      expect(count).toBe((await rows.count()) - 1);
      for (let i = 0; i < count; i++) {
        const button = controls.nth(i);
        const target = await button.getAttribute('aria-controls');
        expect(target).not.toBeNull();
        await button.click();
        await expect(page.locator(`[id="${target ?? ''}"]`)).toBeFocused();
      }
      await index.getByLabel('Component zoeken').fill('FormRadioGroupField');
      await expect(index.getByRole('button', { name: 'Toon FormRadioGroupField', exact: true })).toBeVisible();
      await index.getByRole('button', { name: 'Toon FormRadioGroupField', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Formulier: toestanden' })).toBeFocused();
      await expect(page).toHaveURL(/q=FormRadioGroupField/);
    });

    test('lokale toestanden, adaptervalidatie en pending blijven bedienbaar in licht en donker', async ({ page }) => {
      const csp = collectCspViolations(page);
      await openCatalogue(page);
      const asyncSection = page.getByRole('region', { name: 'AsyncView', exact: true });
      await asyncSection.getByLabel('AsyncView-toestand').selectOption('loading');
      await expect(asyncSection.getByRole('status')).toHaveText('Laden…');
      await asyncSection.getByLabel('AsyncView-toestand').selectOption('error');
      await expect(asyncSection.getByRole('alert')).toBeVisible();
      await scanAxe(page);
      await asyncSection.getByRole('button', { name: 'Opnieuw proberen' }).click();
      await expect(asyncSection.getByText('Voorbeeld geladen.')).toBeVisible();
      await asyncSection.getByLabel('AsyncView-toestand').selectOption('empty');
      await expect(asyncSection.getByText('Er is nog niets om te tonen.')).toBeVisible();
      const form = page.getByRole('region', { name: 'Formulier: toestanden' });
      await form.getByRole('button', { name: 'Voorbeeld versturen' }).click();
      await expect(form.getByLabel('Meldingen')).toHaveAttribute('aria-invalid', 'true');
      await expect(form.getByText('Kies een voorkeur.')).toBeVisible();
      await form.getByLabel('Naam', { exact: true }).fill('Ada');
      await form.getByLabel('Rol', { exact: true }).selectOption('user');
      await form.getByLabel('Meldingen').check();
      await form.getByRole('radio', { name: 'Gebruiker' }).check();
      await form.getByLabel('Uitkomst versturen').selectOption('field');
      await form.getByRole('button', { name: 'Voorbeeld versturen' }).click();
      await expect(form.getByText('Dit bestaat al.')).toBeVisible();
      await form.getByLabel('Uitkomst versturen').selectOption('server');
      await form.getByRole('button', { name: 'Voorbeeld versturen' }).click();
      await expect(form.getByRole('alert')).toBeFocused();
      await form.getByLabel('Uitkomst versturen').selectOption('pending');
      await form.getByRole('button', { name: 'Voorbeeld versturen' }).click();
      await expect(form.getByRole('button', { name: 'Bezig…' })).toBeDisabled();
      await page.getByRole('button', { name: 'Donker thema' }).click();
      await scanAxe(page);
      await form.getByRole('button', { name: 'Afronden' }).click();
      await expect(form.getByRole('status')).toHaveText('Voorbeeld verstuurd.');
      await form.getByRole('button', { name: 'Velden uitschakelen' }).click();
      await expect(form.getByLabel('Naam', { exact: true })).toBeDisabled();
      await expect(form.getByLabel('Meldingen')).toBeDisabled();
      await expect(form.getByRole('radio', { name: 'Gebruiker' })).toBeDisabled();
      const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth');
      expect(overflow).toBeLessThanOrEqual(0);
      expect(csp).toStrictEqual([]);
    });
  });
}
