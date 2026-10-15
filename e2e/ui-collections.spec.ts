import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { signIn } from './support/eigen-account.ts';
import { collectCspViolations, scanAxe } from './support/axe.ts';

async function openCatalogue(page: Page) {
  await signIn(page, await createAccount('admin', { totp: true }));
  await page.goto('/design-system');
  await page.getByRole('region', { name: 'Combobox', exact: true }).waitFor();
}

for (const width of [375, 1280]) {
  test.describe(`UI-collecties op ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: true });
    test.beforeEach(async ({ context }) => {
      await context.setExtraHTTPHeaders(clientIpHeaders());
    });

    // ui-collections/AC-2, ui-collections/AC-3, ui-collections/AC-4, ui-collections/AC-9
    test('AC-2/3/4/9: filteren, annuleren, kiezen, wissen en popup binnen Dialog met CSP en axe', async ({ page }) => {
      const csp = collectCspViolations(page);
      await openCatalogue(page);
      const section = page.getByRole('region', { name: 'Combobox', exact: true });
      const input = section.getByRole('combobox', { name: 'Rol', exact: true });
      await expect(input).toHaveValue('Gebruiker');
      await input.fill('  BEHEER ');
      await expect(section.getByRole('option')).toHaveCount(1);
      await input.press('Escape');
      await expect(input).toHaveValue('Gebruiker');
      await input.fill('beheer');
      await input.press('ArrowDown');
      await input.press('Enter');
      await expect(input).toHaveValue('Beheerder');
      await expect(section.getByLabel('Rolwaarde')).toHaveText('admin');
      await expect(input).toBeFocused();
      await section.getByRole('button', { name: 'Keuze wissen', disabled: false }).click();
      await expect(input).toHaveValue('');
      await expect(input).toBeFocused();
      await input.fill('zzzz');
      await expect(section.getByRole('status').filter({ hasText: 'Geen resultaten.' })).toHaveText('Geen resultaten.');
      await input.press('Tab');
      await expect(input).toHaveValue('');
      await input.click();
      await section.getByRole('option', { name: 'Beheerder' }).tap();
      await expect(input).toHaveValue('Beheerder');
      await expect(section.getByRole('combobox', { name: 'Uitgeschakeld', exact: true })).toBeDisabled();
      await scanAxe(page);
      const opener = section.getByRole('button', { name: 'Combobox in dialoog' });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Combobox in dialoog' });
      const inside = dialog.getByRole('combobox', { name: 'Rol' });
      await expect(inside).toBeFocused();
      await inside.fill('beheer');
      await dialog.getByRole('option', { name: 'Beheerder' }).click();
      await expect(inside).toHaveValue('Beheerder');
      await inside.press('ArrowDown');
      await inside.press('Escape');
      await expect(dialog).toBeVisible();
      await expect(inside).toHaveAttribute('aria-expanded', 'false');
      await scanAxe(page);
      await inside.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(opener).toBeFocused();
      expect(csp).toStrictEqual([]);
    });

    // ui-collections/AC-5, ui-collections/AC-9
    test('AC-5/9: echte formulierbinding, serverveldfout en reset van gelijke waarde', async ({ page }) => {
      await openCatalogue(page);
      const section = page.getByRole('region', { name: 'FormComboboxField', exact: true });
      const role = section.getByRole('combobox', { name: 'Rol', exact: true });
      const preference = section.getByRole('combobox', { name: 'Voorkeur', exact: true });
      await section.getByRole('button', { name: 'Versturen', exact: true }).click();
      await expect(role).toBeFocused();
      await expect(role).toHaveAttribute('aria-invalid', 'true');
      await role.fill('beheer');
      await section.getByRole('option', { name: 'Beheerder' }).click();
      await section.getByRole('button', { name: 'Versturen', exact: true }).click();
      await expect(section.locator('output')).toHaveText(JSON.stringify({ role: 'admin', preference: 'user' }));
      await preference.fill('beheer');
      await section.getByRole('button', { name: 'Annuleren', exact: true }).click();
      await expect(role).toHaveValue('');
      await expect(preference).toHaveValue('Gebruiker');
      await section.getByLabel('Uitkomst versturen').selectOption('field');
      await role.click();
      await section.getByRole('option', { name: 'Gebruiker' }).click();
      await section.getByRole('button', { name: 'Versturen', exact: true }).click();
      await expect(section.getByText('Dit bestaat al.')).toBeVisible();
      await expect(role).toBeFocused();
      await expect(role).toHaveValue('Gebruiker');
      await section.getByRole('button', { name: 'Velden uitschakelen' }).click();
      await expect(role).toBeDisabled();
      await expect(preference).toBeDisabled();
    });

    // ui-collections/AC-6, ui-collections/AC-7, ui-collections/AC-8, ui-collections/AC-9
    test('AC-6/7/8/9: accordion behoudt inhoud; lijsten hebben acties en metadata zonder overflow', async ({
      page,
    }) => {
      const csp = collectCspViolations(page);
      await openCatalogue(page);
      const section = page.getByRole('region', { name: 'Accordion', exact: true });
      const general = section.getByRole('button', { name: 'Algemeen', exact: true }).first();
      const name = section.getByRole('textbox', { name: 'Naam' });
      await name.fill('Ada');
      await general.focus();
      await page.keyboard.press('Space');
      await expect(general).toHaveAttribute('aria-expanded', 'false');
      await expect(name).toBeHidden();
      await page.keyboard.press('Enter');
      await expect(name).toHaveValue('Ada');
      const second = section.getByRole('button', { name: 'Algemeen', exact: true }).nth(1);
      await second.click();
      await expect(second).toHaveAttribute('aria-expanded', 'true');
      await expect(section.getByRole('button', { name: 'Meldingen', exact: true }).nth(1)).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await expect(section.getByRole('button', { name: 'Uitgeschakeld', exact: true }).first()).toBeDisabled();
      const list = page.getByRole('region', { name: 'List', exact: true });
      await expect(list.getByRole('list', { name: 'Gebruikers' }).getByRole('listitem')).toHaveCount(3);
      await list.getByRole('button', { name: 'Bekijken Anna de Vries' }).click();
      await expect(list.getByRole('status')).toHaveText('Anna de Vries');
      const descriptions = page.getByRole('region', { name: 'DescriptionList', exact: true });
      await expect(descriptions.getByRole('term').first()).toHaveText('Naam');
      await expect(descriptions.getByRole('definition').first()).toHaveText('Anna de Vries');
      await scanAxe(page);
      await page.getByRole('button', { name: 'Donker thema' }).click();
      await scanAxe(page);
      const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth');
      expect(overflow).toBeLessThanOrEqual(0);
      expect(csp).toStrictEqual([]);
    });
  });
}

test.describe('UI-collecties: alleen lokale data', () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
  });

  // ui-collections/AC-10
  test('AC-10: het bedienen van de voorbeelden stuurt geen enkel /api/-verzoek', async ({ page }) => {
    await openCatalogue(page);
    // Wat de pagina bij het laden zelf ophaalt (sessie, rechten) is er al; meet alleen vanaf nu.
    await page.waitForLoadState('networkidle');
    const requests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(`${request.method()} ${request.url()}`);
    });
    const combobox = page.getByRole('region', { name: 'Combobox', exact: true });
    const role = combobox.getByRole('combobox', { name: 'Rol', exact: true });
    await role.fill('beheer');
    await combobox.getByRole('option', { name: 'Beheerder' }).click();
    await expect(role).toHaveValue('Beheerder');
    const form = page.getByRole('region', { name: 'FormComboboxField', exact: true });
    await form.getByRole('button', { name: 'Versturen', exact: true }).click();
    await form.getByRole('button', { name: 'Annuleren', exact: true }).click();
    const accordion = page.getByRole('region', { name: 'Accordion', exact: true });
    await accordion.getByRole('button', { name: 'Algemeen', exact: true }).first().click();
    const list = page.getByRole('region', { name: 'List', exact: true });
    await list.getByRole('button', { name: 'Bekijken Anna de Vries' }).click();
    await expect(list.getByRole('status')).toHaveText('Anna de Vries');
    // networkidle lost direct op als er op dat moment niets loopt. Een vaste stilteperiode laat de luisteraar echt lopen,
    // zodat ook een vertraagde query of refetch na de laatste interactie wordt opgemerkt.
    await page.waitForTimeout(1500);

    expect(requests).toStrictEqual([]);
  });
});
