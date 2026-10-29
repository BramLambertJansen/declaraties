import { expect, test, type Locator } from '@playwright/test';
import { clientIpHeaders, createAccount } from './support/accounts.ts';
import { signIn } from './support/eigen-account.ts';

async function expectCompoundControl(input: Locator, action: Locator) {
  await expect(input).toBeVisible();
  await expect(action).toBeVisible();
  const [field, button] = await Promise.all([input.boundingBox(), action.boundingBox()]);
  if (field === null || button === null) throw new Error('Invoerveld en knop moeten zichtbaar zijn.');
  expect(field.height).toBe(44);
  expect(button.height).toBe(field.height);
  expect(button.width).toBe(44);
  expect(button.y).toBe(field.y);
  expect(button.x - (field.x + field.width)).toBeCloseTo(8);
}

for (const width of [375, 1280]) {
  test(`samengestelde invoervelden hebben een losse knop op gelijke hoogte op ${String(width)} px`, async ({
    page,
    context,
  }) => {
    await context.setExtraHTTPHeaders(clientIpHeaders());
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, await createAccount('admin', { totp: true }));
    await page.goto('/design-system');
    const inputs = page.getByRole('region', { name: 'PasswordInput en DateInput' });
    const password = inputs.getByLabel('Voorbeeldwachtwoord', { exact: true });
    const toggle = inputs.getByRole('button', { name: 'Wachtwoord tonen', exact: true }).first();
    const date = inputs.getByLabel('Voorbeelddatum', { exact: true });
    const calendar = inputs.getByRole('button', { name: 'Kalender openen', exact: true }).first();
    await expectCompoundControl(password, toggle);
    await expectCompoundControl(date, calendar);
    await date.fill('2026-10-20');
    await calendar.press('Enter');
    await page.keyboard.press('Escape');
    await expect(date).toHaveValue('2026-10-20');
    await expect(inputs.getByRole('status')).toHaveCount(0);
    await expect(inputs.getByRole('button', { name: 'Kalender openen', exact: true }).nth(1)).toBeDisabled();
    await page.getByRole('button', { name: 'Donker thema' }).click();
    await expectCompoundControl(password, toggle);
    await expectCompoundControl(date, calendar);
    expect(await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth')).toBeLessThanOrEqual(
      0,
    );
  });
}
