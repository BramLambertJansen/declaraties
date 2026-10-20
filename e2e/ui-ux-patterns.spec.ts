import { expect, test } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { collectCspViolations, scanAxe } from './support/axe.ts';
import { signIn } from './support/eigen-account.ts';

for (const width of [375, 1280]) {
  test(`formulier-, ververs- en bulkpatronen op ${String(width)} px`, async ({ page, context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
    await page.setViewportSize({ width, height: 900 });
    const csp = collectCspViolations(page);
    await signIn(page, await createAccount('admin', { totp: true }));
    await page.goto('/design-system?q=patronen');
    const detail = page.getByRole('region', { name: 'Detail bekijken en bewerken' });
    const edit = detail.getByRole('button', { name: 'Contactgegevens bewerken' });
    await edit.press('Enter');
    await expect(detail.getByRole('heading', { name: 'Contactgegevens', exact: true })).toBeFocused();
    const name = detail.getByRole('textbox', { name: 'Naam', exact: true });
    await name.fill('');
    await detail.getByRole('textbox', { name: 'E-mailadres', exact: true }).fill('ongeldig');
    await detail.getByRole('button', { name: 'Contactgegevens opslaan' }).click();
    const summary = detail.getByRole('heading', { name: 'Controleer de invoer' }).locator('..');
    await expect(summary).toBeFocused();
    await detail.getByRole('button', { name: 'Naam: Vul een naam in.' }).press('Enter');
    await expect(name).toBeFocused();
    await scanAxe(page);
    await detail.getByRole('button', { name: 'Wijzigingen wissen' }).click();
    await expect(name).toHaveValue('Anna de Vries');
    await name.fill('Bert');
    await detail.getByRole('link', { name: 'Terug naar accounts' }).click();
    const leave = page.getByRole('alertdialog', { name: 'Pagina verlaten?' });
    await expect(leave.getByRole('button', { name: 'Annuleren' })).toBeFocused();
    await leave.press('Escape');
    await expect(leave).not.toBeVisible();
    await expect(page).toHaveURL(/design-system\?q=patronen$/);
    await expect(detail.getByRole('link', { name: 'Terug naar accounts' })).toBeFocused();
    await detail.getByRole('button', { name: 'Annuleren' }).click();
    const discard = page.getByRole('alertdialog', { name: 'Wijzigingen verwerpen?' });
    await discard.getByRole('button', { name: 'Wijzigingen verwerpen', exact: true }).click();
    await expect(edit).toBeFocused();
    await edit.click();
    await name.fill('Carla');
    await detail.getByRole('button', { name: 'Contactgegevens opslaan' }).click();
    await expect(edit).toBeFocused();
    await expect(detail.getByText('Wijziging opgeslagen.')).toBeVisible();
    await expect(page).toHaveURL(/design-system\?q=patronen$/);
    const refresh = page.getByRole('region', { name: 'Verversen met behoud van inhoud' });
    await refresh.getByRole('button', { name: 'Verversen', exact: true }).click();
    await expect(refresh.getByText('Gegevens verversen…')).toBeVisible();
    await expect(refresh.getByText('Bestaande gegevens')).toBeVisible();
    await refresh.getByRole('button', { name: 'Verversen laten mislukken' }).click();
    await expect(refresh.getByRole('alert')).toContainText('mogelijk verouderd');
    await refresh.getByRole('button', { name: 'Opnieuw proberen' }).click();
    await refresh.getByRole('button', { name: 'Verversen afronden' }).click();
    await expect(refresh.getByText('Vernieuwde gegevens')).toBeVisible();
    const bulk = page.getByRole('region', { name: 'Selectie en bulkacties' });
    await expect(bulk.getByRole('button', { name: 'Verwerken' })).toBeDisabled();
    await bulk.getByRole('checkbox', { name: 'Selecteer alle zichtbare voorbeeldaccounts' }).check();
    await bulk.getByRole('button', { name: 'Verwerken' }).click();
    await expect(bulk.getByRole('button', { name: 'Selectie wissen' })).toBeDisabled();
    await bulk.getByRole('button', { name: 'Afronden' }).click();
    await expect(bulk.getByRole('alert')).toHaveText('1 verwerkt; 1 mislukt.');
    await expect(bulk.getByRole('checkbox', { name: 'Selecteer Bert Jansen' })).toBeChecked();
    await bulk.getByRole('button', { name: 'Verwerken' }).click();
    await bulk.getByRole('button', { name: 'Afronden' }).click();
    await expect(bulk.getByText('0 geselecteerd')).toBeVisible();
    await scanAxe(page);
    await page.getByRole('button', { name: 'Donker thema' }).click();
    await scanAxe(page);
    expect(await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(
      0,
    );
    await edit.click();
    await name.fill('Niet opgeslagen');
    await detail.getByRole('link', { name: 'Terug naar accounts' }).click();
    await page
      .getByRole('alertdialog', { name: 'Pagina verlaten?' })
      .getByRole('button', { name: 'Wijzigingen verwerpen en verlaten' })
      .click();
    await expect(page).toHaveURL(/\/accounts$/);
    expect(csp).toStrictEqual([]);
  });
}
