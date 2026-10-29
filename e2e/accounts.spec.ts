import { expect, test, type Page } from '@playwright/test';
import {
  base32Decode,
  clientIpHeaders,
  createAccount,
  invitationLink,
  PASSWORD,
  totpFor,
  type TestAccount,
} from './support/accounts.ts';
import { collectCspViolations, scanAxe } from './support/axe.ts';

// Accountbeheer tegen de echte stack (spec accountbeheer, AC-1 t/m AC-8 en AC-10): CSP aan, axe op 375 en 1280 px.

// Bij horizontaal scrollen: de buitenste elementen die rechts buiten beeld steken, met hun breedte en die van de ouder.
const overflowReport = `(() => {
  const describe = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + [...el.classList].join('.');
  const wide = [...document.body.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5);
  return {
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    elements: wide
      .filter((el) => !wide.includes(el.parentElement))
      .map((el) => describe(el) + ' ' + Math.round(el.getBoundingClientRect().width) + 'px in ' +
        describe(el.parentElement) + ' ' + Math.round(el.parentElement.getBoundingClientRect().width) + 'px, ' +
        getComputedStyle(el).overflowX),
  };
})()`;

async function axeAtBothWidths(page: Page): Promise<void> {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await scanAxe(page);
    const { overflow, elements } = await page.evaluate<{ overflow: number; elements: string[] }>(overflowReport);
    expect(overflow, `horizontaal scrollen op ${String(width)} px: ${elements.join(' | ')}`).toBeLessThanOrEqual(0);
  }
}

async function signIn(page: Page, account: { email: string }, password = PASSWORD): Promise<void> {
  await page.getByLabel('E-mailadres').fill(account.email);
  await page.getByLabel('Wachtwoord').fill(password);
  await page.getByRole('button', { name: 'Inloggen' }).click();
}

async function signInAsAdmin(page: Page, admin: TestAccount): Promise<void> {
  await page.goto('/login');
  await signIn(page, admin);
  await page.getByLabel('Code', { exact: true }).fill(totpFor(admin.totpSecret ?? ''));
  await page.getByRole('button', { name: 'Bevestigen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 });

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

test('AC-1: anoniem naar /login, zonder sidebar of topbar', async ({ page }) => {
  const csp = collectCspViolations(page);
  await page.goto('/');

  await expect(page).toHaveURL(/\/login\?redirect=/);
  await expect(heading(page)).toHaveText('Inloggen');
  await expect(page.getByRole('navigation', { name: 'Hoofdmenu' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Profielmenu' })).toHaveCount(0);
  await axeAtBothWidths(page);
  expect(csp).toStrictEqual([]);
});

test('AC-2 en AC-10: een user logt in, ziet Home en logt uit; daarna is de sessie weg', async ({ page }) => {
  const csp = collectCspViolations(page);
  const user = await createAccount('user', { name: 'Gert Gebruiker' });
  await page.goto('/login');
  await signIn(page, user);

  await expect(heading(page)).toHaveText('Home');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link')).toHaveText(['Home']);
  await expect(page.getByRole('button', { name: 'Profielmenu' })).toHaveText('GG');
  await axeAtBothWidths(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Profielmenu' }).click();
  await page.getByRole('menuitem', { name: 'Uitloggen' }).click();
  await expect(heading(page)).toHaveText('Inloggen');
  expect((await page.request.get('/api/me')).status()).toBe(401);
  expect(csp).toStrictEqual([]);
});

test('AC-3: een admin met TOTP komt na wachtwoord en code op het dashboard met de link Accounts', async ({ page }) => {
  const csp = collectCspViolations(page);
  const admin = await createAccount('admin', { totp: true });
  await page.goto('/login');
  await signIn(page, admin);

  await expect(heading(page)).toHaveText('Verificatiecode');
  await axeAtBothWidths(page);
  await page.getByLabel('Code', { exact: true }).fill(totpFor(admin.totpSecret ?? ''));
  await page.getByRole('button', { name: 'Bevestigen' }).click();

  await expect(heading(page)).toHaveText('Dashboard');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('link', { name: 'Accounts' })).toBeVisible();
  await axeAtBothWidths(page);
  expect(csp).toStrictEqual([]);
});

test('AC-3: een foute code geeft de spectekst en geen sessie', async ({ page }) => {
  const admin = await createAccount('admin', { totp: true });
  await page.goto('/login');
  await signIn(page, admin);
  await page.getByLabel('Code', { exact: true }).fill('000000');
  await page.getByRole('button', { name: 'Bevestigen' }).click();

  await expect(page.getByRole('alert')).toHaveText('Deze code klopt niet. Probeer het opnieuw.');
  expect((await page.request.get('/api/me')).status()).toBe(401);
});

test('AC-4: een admin zonder TOTP moet eerst instellen; tot dan MFA_REQUIRED', async ({ page }) => {
  const csp = collectCspViolations(page);
  const admin = await createAccount('admin');
  await page.goto('/login');
  await signIn(page, admin);

  await expect(heading(page)).toHaveText('Tweestapsverificatie instellen');
  await expect(page.getByRole('img', { name: 'QR-code voor je authenticator-app' })).toBeVisible();
  const blocked = await page.request.get('/api/accounts');
  expect([blocked.status(), await blocked.json()]).toMatchObject([403, { code: 'MFA_REQUIRED' }]);
  await axeAtBothWidths(page);

  await page.getByRole('button', { name: 'Kan je niet scannen? Toon de sleutel' }).click();
  const secret = (await page.locator('code').textContent()) ?? '';
  await page.getByLabel('Code', { exact: true }).fill(totpFor(base32Decode(secret)));
  await page.getByRole('button', { name: 'Activeren' }).click();

  await expect(heading(page)).toHaveText('Dashboard');
  expect((await page.request.get('/api/accounts')).status()).toBe(200);
  expect(csp).toStrictEqual([]);
});

test('AC-5 en AC-6: uitnodigen, mail, wachtwoord instellen, inloggen; status wordt Actief', async ({
  browser,
  page,
}) => {
  const csp = collectCspViolations(page);
  const admin = await createAccount('admin', { totp: true });
  await signInAsAdmin(page, admin);
  await page.getByRole('link', { name: 'Accounts' }).click();
  await expect(heading(page)).toHaveText('Accounts');
  await axeAtBothWidths(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole('button', { name: 'Account uitnodigen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Account uitnodigen' });
  await expect(dialog.getByLabel('Naam')).toBeFocused();
  await scanAxe(page);
  await dialog.getByLabel('Naam').fill('Nieuwe Gebruiker');
  await dialog.getByLabel('E-mailadres').fill('nieuw@template.test');
  await dialog.getByLabel('Rol').selectOption({ label: 'Gebruiker' });
  await dialog.getByRole('button', { name: 'Uitnodiging versturen' }).click();

  await expect(page.getByRole('status')).toHaveText('Uitnodiging verstuurd naar nieuw@template.test.');
  const row = page.getByRole('row').filter({ hasText: 'nieuw@template.test' });
  await expect(row).toContainText('Gebruiker');
  await expect(row).toContainText('Uitgenodigd');

  // De genodigde, in een eigen browsercontext (geen sessie van de admin).
  const invitee = await (await browser.newContext({ extraHTTPHeaders: clientIpHeaders() })).newPage();
  const inviteeCsp = collectCspViolations(invitee);
  await invitee.goto(await invitationLink('nieuw@template.test'));
  await expect(invitee.getByRole('heading', { level: 1 })).toHaveText('Wachtwoord instellen');
  await axeAtBothWidths(invitee);
  await invitee.getByLabel('Wachtwoord', { exact: true }).fill(PASSWORD);
  await invitee.getByLabel('Wachtwoord herhalen').fill(PASSWORD);
  await invitee.getByRole('button', { name: 'Wachtwoord instellen' }).click();
  await expect(invitee.getByRole('status')).toHaveText('Je wachtwoord is ingesteld. Log in om verder te gaan.');
  await signIn(invitee, { email: 'nieuw@template.test' });
  await expect(invitee.getByRole('heading', { level: 1 })).toHaveText('Home');

  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'nieuw@template.test' })).toContainText('Actief');
  expect([...csp, ...inviteeCsp]).toStrictEqual([]);
});

test('uitnodigen van een bestaand adres: veldfout uit de spec', async ({ page }) => {
  const admin = await createAccount('admin', { totp: true });
  const existing = await createAccount('user');
  await signInAsAdmin(page, admin);
  await page.goto('/admin/accounts');
  await page.getByRole('button', { name: 'Account uitnodigen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Account uitnodigen' });
  await dialog.getByLabel('Naam').fill('Dubbel');
  await dialog.getByLabel('E-mailadres').fill(existing.email);
  await dialog.getByRole('button', { name: 'Uitnodiging versturen' }).click();

  await expect(dialog.getByText('Er bestaat al een account met dit e-mailadres.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Account uitnodigen' })).toBeFocused();
});

test('AC-7: een user op /admin ziet de spectekst en krijgt FORBIDDEN van de API', async ({ page }) => {
  const user = await createAccount('user');
  await page.goto('/login');
  await signIn(page, user);
  await expect(heading(page)).toHaveText('Home');

  await page.goto('/admin');
  await expect(page.getByRole('alert')).toHaveText('Je hebt geen toegang tot deze pagina.');
  const response = await page.request.get('/api/accounts');
  expect([response.status(), await response.json()]).toMatchObject([403, { code: 'FORBIDDEN' }]);
});

test('AC-8: buiten APP_ENV=local bestaat /api/dev/login-as niet', async ({ page, baseURL }) => {
  const response = await page.request.post('/api/dev/login-as', {
    headers: { origin: baseURL ?? '', 'content-type': 'application/json' },
    data: { rol: 'admin' },
  });

  expect(response.status()).toBe(404);
});

test('dev-rolwisselaar: op elk scherm een tabje rechts dat een paneel met de rollen opent', async ({ page }) => {
  const user = await createAccount('user');
  await page.goto('/login');
  const tab = page.getByRole('button', { name: 'Rol wisselen (alleen lokaal)' });
  await expect(tab).toBeVisible();

  await signIn(page, user);
  await expect(heading(page)).toHaveText('Home');
  await expect(tab).toBeVisible();
  await tab.click();
  const panel = page.getByRole('complementary', { name: 'Rol wisselen' });
  await expect(panel.getByRole('button', { name: 'Gebruiker' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('button', { name: 'Beheerder' })).toHaveAttribute('aria-pressed', 'false');
  await scanAxe(page);
  await page.keyboard.press('Escape');
  await expect(tab).toBeFocused();
  await expect(tab).toHaveAttribute('aria-expanded', 'false');
});

test('smal scherm: het hoofdmenu schuift vanaf links over het scherm; Esc, de strook ernaast en een link sluiten het', async ({
  page,
}) => {
  const csp = collectCspViolations(page);
  const user = await createAccount('user');
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/login');
  await signIn(page, user);
  await expect(heading(page)).toHaveText('Home');
  const opener = page.getByRole('button', { name: 'Menu openen' });
  const sheet = page.getByRole('dialog', { name: 'Hoofdmenu' });

  await opener.click();
  await expect(sheet.getByRole('link', { name: 'Home' })).toBeVisible();
  // Tegen de linkerrand, volle hoogte, met rechts een strook van de pagina. Poll: het inschuiven duurt 200 ms (een meting
  // tijdens de overgang gaf x = -288 in CI).
  await expect.poll(async () => sheet.boundingBox()).toMatchObject({ x: 0, y: 0, height: 900 });
  expect((await sheet.boundingBox())?.width).toBeLessThan(375);
  await scanAxe(page);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();

  await opener.click();
  await page.mouse.click(365, 450);
  await expect(sheet).toBeHidden();

  await opener.click();
  await sheet.getByRole('link', { name: 'Home' }).click();
  await expect(sheet).toBeHidden();
  expect(csp).toStrictEqual([]);
});

test('themaschakelaar in de topbalk: donker blijft na herladen, axe in donker; een link naar het design system, geen sidebar-item', async ({
  page,
}) => {
  const csp = collectCspViolations(page);
  const admin = await createAccount('admin', { totp: true });
  await signInAsAdmin(page, admin);
  const toggle = page.getByRole('banner').getByRole('button', { name: 'Donker thema' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await axeAtBothWidths(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Design system' }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Design system' }).click();
  await expect(page).toHaveURL(/\/design-system$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
  expect(csp).toStrictEqual([]);
});
