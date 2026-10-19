import { expect, test } from '@playwright/test';
import { clientIpHeaders, createAccount, PASSWORD } from './support/accounts.ts';
import { scanAxe } from './support/axe.ts';

for (const width of [375, 1280]) {
  test(`wachtwoord tonen, verbergen en inloggen op ${String(width)} px`, async ({ page, context }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
    await page.setViewportSize({ width, height: 900 });
    const account = await createAccount('user');
    let submissions = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/auth/sign-in/email') {
        submissions += 1;
      }
    });
    await page.goto('/login');
    const password = page.getByLabel('Wachtwoord');
    const toggle = page.getByRole('button', { name: 'Wachtwoord tonen', exact: true });
    await expect(password).toHaveAttribute('type', 'password');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const fieldId = await password.getAttribute('id');
    expect(fieldId).toBeTruthy();
    await expect(toggle).toHaveAttribute('aria-controls', fieldId ?? '');
    await password.fill(PASSWORD);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveValue(PASSWORD);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(password).toHaveAttribute('type', 'password');
    await expect(password).toHaveValue(PASSWORD);
    await toggle.press('Space');
    await expect(password).toHaveAttribute('type', 'text');
    await expect(toggle).toBeFocused();
    await expect(page).toHaveURL(/\/login$/);
    expect(submissions).toBe(0);
    await scanAxe(page);
    expect(await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(
      0,
    );

    // Een nieuwe pagina begint weer afgeschermd; zichtbaarheid wordt niet opgeslagen.
    await page.reload();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(password).toHaveValue('');
    await page.getByLabel('E-mailadres').fill(account.email);
    await password.fill(PASSWORD);
    await toggle.click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveAttribute('autocomplete', 'current-password');
    await expect(password).toHaveAttribute('autocapitalize', 'none');
    await expect(password).toHaveAttribute('autocorrect', 'off');
    await expect(password).toHaveAttribute('spellcheck', 'false');
    await password.press('Enter');
    await expect(page.getByRole('button', { name: 'Profielmenu' })).toBeVisible();
    expect(submissions).toBe(1);
  });
}
