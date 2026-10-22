import { expect, test } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { collectCspViolations, scanAxe } from './support/axe.ts';
import { signIn } from './support/eigen-account.ts';

for (const width of [375, 1280]) {
  test(`invoer, klembord en kruimelpad op ${String(width)} px`, async ({ page, context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
    await page.setViewportSize({ width, height: 900 });
    const csp = collectCspViolations(page);
    await signIn(page, await createAccount('admin', { totp: true }));
    await page.goto('/design-system');
    const inputs = page.getByRole('region', { name: 'PasswordInput en DateInput' });
    const password = inputs.getByLabel('Voorbeeldwachtwoord', { exact: true });
    const date = inputs.getByLabel('Voorbeelddatum', { exact: true });
    await inputs.getByRole('button', { name: 'Voorbeeld versturen' }).click();
    await expect(password).toBeFocused();
    await expect(date).toHaveAttribute('aria-invalid', 'true');
    await expect(date).toHaveAttribute('type', 'date');
    await password.fill('voorbeeld');
    await date.fill('2026-10-20');
    const toggle = inputs.getByRole('button', { name: 'Wachtwoord tonen', exact: true }).first();
    await toggle.press('Space');
    await expect(password).toHaveAttribute('type', 'text');
    await expect(toggle).toBeFocused();
    await toggle.press('Enter');
    await expect(password).toHaveAttribute('type', 'password');
    await inputs.getByRole('button', { name: 'Voorbeeld versturen' }).click();
    await expect(inputs.getByRole('status')).toHaveText('Voorbeeld verstuurd.');
    await inputs.getByRole('button', { name: 'Wissen' }).click();
    await expect(password).toHaveValue('');
    await expect(date).toHaveValue('');
    await expect(inputs.getByLabel('Uitgeschakelde datum')).toBeDisabled();
    await expect(inputs.getByLabel('Uitgeschakeld wachtwoord')).toBeDisabled();
    const copy = page.getByRole('region', { name: 'CopyButton', exact: true });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const copyButton = copy.getByRole('button', { name: 'E-mailadres kopiëren' });
    await copyButton.press('Enter');
    await expect(copy.getByRole('status').first()).toHaveText('Gekopieerd.');
    expect(await page.evaluate<string>('navigator.clipboard.readText()')).toBe('anna@example.test');
    await expect(copyButton).toBeFocused();
    const breadcrumbs = page.getByRole('navigation', { name: 'Voorbeeldkruimelpad' });
    await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText('Accountgegevens met een lange beschrijving');
    await scanAxe(page);
    await page.getByRole('button', { name: 'Donker thema' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await scanAxe(page);
    expect(await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(
      0,
    );
    await breadcrumbs.getByRole('link', { name: 'Accounts', exact: true }).click();
    await expect(page).toHaveURL(/\/accounts$/);
    expect(csp).toStrictEqual([]);
  });
}
