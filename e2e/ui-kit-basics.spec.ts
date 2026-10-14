import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { collectCspViolations, scanAxe } from './support/axe.ts';
import { signIn } from './support/eigen-account.ts';

async function openCatalog(page: Page) {
  await signIn(page, await createAccount('admin', { totp: true }));
  await page.goto('/design-system');
  // De route laadt zijn cataloguschunk lazy; wacht op de echte scherminhoud binnen de bestaande test-timeout.
  await page.getByRole('region', { name: 'Textarea, Checkbox en RadioGroup' }).waitFor();
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

for (const width of [375, 1280]) {
  test.describe(`UI-basics op ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test('AC-2/3/4/9/10: native bediening, payload, reset en alle staten met CSP en axe', async ({ page }) => {
      const csp = collectCspViolations(page);
      await openCatalog(page);
      const controls = page.getByRole('region', { name: 'Textarea, Checkbox en RadioGroup' });
      const name = controls.getByLabel('Naam', { exact: true });
      const checkbox = controls.getByRole('checkbox', { name: 'Meldingen' });
      const user = controls.getByRole('radio', { name: 'Gebruiker' });
      const admin = controls.getByRole('radio', { name: 'Beheerder' });
      await controls.getByRole('button', { name: 'Versturen' }).click();
      await expect(name).toBeFocused();
      await expect(name).toHaveAttribute('aria-invalid', 'true');
      await expect(controls.getByText('Vul een naam in.')).toBeVisible();
      await checkbox.focus();
      await page.keyboard.press('Space');
      await expect(checkbox).toBeChecked();
      // Eén licht-scan met zowel de veldfout als een actieve checkbox; disabled/invalid voorbeelden staan op dezelfde pagina.
      await scanAxe(page);
      await name.fill('Ada\nLovelace');
      await user.focus();
      await page.keyboard.press('ArrowRight');
      await expect(admin).toBeChecked();
      await expect(user).not.toBeChecked();
      await expect(admin).toBeFocused();
      await controls.getByRole('button', { name: 'Versturen' }).click();
      await expect(controls.locator('output')).toHaveText(
        JSON.stringify({ name: 'Ada\nLovelace', notifications: true, role: 'admin' }),
      );
      await controls.getByRole('button', { name: 'Annuleren' }).click();
      await expect(name).toHaveValue('');
      await expect(checkbox).not.toBeChecked();
      await expect(user).toBeChecked();
      await checkbox.locator('..').click();
      await expect(checkbox).toBeChecked();
      const disabled = page.getByRole('region', { name: 'Invoervelden: disabled' });
      await expect(disabled.getByRole('checkbox')).toBeDisabled();
      const label = disabled.getByRole('checkbox').locator('..');
      await label.scrollIntoViewIfNeeded();
      const bounds = await label.boundingBox();
      if (bounds === null) throw new Error('Het checkboxlabel is niet zichtbaar.');
      // Een echte muisklik: locator.click weigert al vóór de browser een label van een disabled input te activeren.
      await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await expect(disabled.getByRole('checkbox')).toBeChecked();
      await expect(disabled.getByRole('textbox')).toBeDisabled();
      await expect(disabled.getByRole('radio', { name: 'Beheerder' })).toBeDisabled();
      await page.getByRole('button', { name: 'Donker thema' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await scanAxe(page);
      expect(
        await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth'),
      ).toBeLessThanOrEqual(0);
      expect(csp).toStrictEqual([]);
    });

    test('AC-6/7/8: badge, lege actie en busy-herstel zonder dubbele activering', async ({ page }) => {
      const csp = collectCspViolations(page);
      await openCatalog(page);
      const badges = page.getByRole('region', { name: 'StatusBadge' });
      await expect(badges.getByText('Actief', { exact: true })).toBeVisible();
      await expect(badges.getByText('Uitgenodigd', { exact: true })).toBeVisible();
      await expect(badges.getByText('Geblokkeerd', { exact: true })).toBeVisible();
      const empty = page.getByRole('region', { name: 'EmptyState en AsyncView' });
      await empty.getByRole('button', { name: 'Versturen' }).click();
      await expect(empty.getByRole('status')).toHaveText('Actief');
      const buttons = page.getByRole('region', { name: 'Button: busy' });
      const action = buttons.getByRole('button', { name: 'Versturen' });
      await action.click();
      const busy = buttons.getByRole('button', { name: 'Bezig…' }).first();
      await expect(busy).toBeFocused();
      await expect(busy).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      await expect(busy).toBeFocused();
      await expect(busy).toHaveAttribute('aria-busy', 'true');
      await buttons.getByRole('button', { name: 'Annuleren' }).click();
      await expect(action).not.toHaveAttribute('aria-busy', 'true');
      await action.click();
      await expect(busy).toHaveAttribute('aria-busy', 'true');
      const menuExample = page.getByRole('region', { name: 'DropdownMenu: busy' });
      const trigger = menuExample.getByRole('button', { name: 'Meldingen' });
      await trigger.click();
      await page.getByRole('menuitem', { name: 'Versturen' }).click();
      await trigger.click();
      const menuBusy = page.getByRole('menuitem', { name: 'Bezig…' }).first();
      await menuBusy.focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      await expect(page.getByRole('menu')).toBeVisible();
      await expect(menuBusy).toBeFocused();
      await expect(page.getByRole('menuitem', { name: 'Geblokkeerd' })).toHaveAttribute('aria-disabled', 'true');
      await scanAxe(page);
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.getByRole('menuitem', { name: 'Annuleren' }).click();
      await trigger.click();
      await expect(page.getByRole('menuitem', { name: 'Versturen' })).not.toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Donker thema' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await scanAxe(page);
      expect(csp).toStrictEqual([]);
    });
  });
}
