import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount, PASSWORD, totpFor } from './support/accounts.ts';
import { collectCspViolations, scanAxe } from './support/axe.ts';

// De catalogus als beveiligde pagina in de app (spec design-system): admin met MFA, binnen de AppShell. Op 375 en 1280 px,
// licht en donker: axe, geen CSP-schendingen, geen horizontaal scrollen, precies een main/Hoofdmenu/Profielmenu, en de
// toetsenbordafspraken (Esc sluit, focus terug op de knop). Een user krijgt de geen-toegang-melding.
async function signInAsAdmin(page: Page): Promise<void> {
  const admin = await createAccount('admin', { totp: true });
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(admin.email);
  await page.getByLabel('Wachtwoord').fill(PASSWORD);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await page.getByLabel('Code', { exact: true }).fill(totpFor(admin.totpSecret ?? ''));
  await page.getByRole('button', { name: 'Bevestigen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

for (const width of [375, 1280]) {
  test.describe(`design-system op ${String(width)} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('axe in licht en donker, zonder CSP-schendingen of horizontaal scrollen', async ({ page }) => {
      const csp = collectCspViolations(page);
      await signInAsAdmin(page);
      await page.goto('/design-system');
      await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();

      await scanAxe(page);
      await page.getByRole('button', { name: 'Donker thema' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await scanAxe(page);

      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('navigation', { name: 'Hoofdmenu' })).toHaveCount(width === 1280 ? 1 : 0);
      await expect(page.getByRole('button', { name: 'Profielmenu' })).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

      // Als tekst: de e2e-tsconfig kent geen DOM-types.
      const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth');
      expect(overflow).toBeLessThanOrEqual(0);
      expect(csp).toStrictEqual([]);
    });
  });
}

test('dialoog: focus erin, Esc sluit, focus terug op de knop', async ({ page }) => {
  const csp = collectCspViolations(page);
  await signInAsAdmin(page);
  await page.goto('/design-system');
  const opener = page.getByRole('button', { name: 'Dialoog openen' });

  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Account uitnodigen' });
  await expect(dialog).toBeVisible();
  await scanAxe(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(csp).toStrictEqual([]);
});

test('UI-index toont de echte bron en importnaam; beide toastvoorbeelden zijn bereikbaar en axe wordt op de meldingen uitgevoerd', async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto('/design-system');
  const index = page.getByRole('region', { name: 'Componentenindex' });
  await index.getByLabel('Component zoeken').fill('RouteError');
  await expect(page).toHaveURL(/q=RouteError/);
  await page.reload();
  await expect(index.getByLabel('Component zoeken')).toHaveValue('RouteError');
  await expect(index.getByRole('row', { name: /RouteError/ })).toContainText('src/core/web/ui/route-error.tsx');
  await expect(index.getByRole('row', { name: /RouteError/ })).toContainText('Publiek: RouteError');
  const errors = page.getByRole('region', { name: 'RouteError en NotFound' });
  await errors.getByRole('button', { name: 'Opnieuw proberen' }).click();
  await expect(errors.getByRole('status')).toHaveText('Opnieuw geprobeerd (voorbeeld).');
  await page.getByRole('button', { name: 'Toon succes-toast' }).click();
  const success = page.getByRole('status').filter({ hasText: 'Wijziging opgeslagen.' });
  await expect(success).toBeVisible();
  await scanAxe(page);
  await success.getByRole('button', { name: 'Sluiten' }).click();
  await expect(success).toHaveCount(0);
  await page.getByRole('button', { name: 'Toon fout-toast' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Opslaan mislukt. Probeer het later opnieuw.' }),
  ).toBeVisible();
  await scanAxe(page);
});

test('bevestigen: focus op Annuleren, Enter annuleert; tijdens Bezig… houdt ook een dubbele Esc hem open', async ({
  page,
}) => {
  const csp = collectCspViolations(page);
  await signInAsAdmin(page);
  await page.goto('/design-system');
  const opener = page.getByRole('button', { name: 'Account blokkeren' });
  const dialog = page.getByRole('alertdialog', { name: 'Account blokkeren?' });
  const status = page.getByRole('status').filter({ hasText: 'Geblokkeerd' });

  await opener.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Annuleren' })).toBeFocused();
  await scanAxe(page);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(status).toHaveCount(0);

  await opener.click();
  await dialog.getByRole('button', { name: 'Blokkeren' }).click();
  await expect(dialog.getByRole('button', { name: 'Bezig…' })).toBeFocused();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(status).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(csp).toStrictEqual([]);
});

test('menu: met het toetsenbord open, Esc sluit, focus terug op de knop', async ({ page }) => {
  const csp = collectCspViolations(page);
  await signInAsAdmin(page);
  await page.goto('/design-system');
  const trigger = page.getByRole('main').getByRole('button', { name: 'Menu openen' });

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Uitloggen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(csp).toStrictEqual([]);
});

test('AC-3: de kop "Design system" staat in de echte AppShell, met het profielmenu van de admin', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/design-system');

  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Profielmenu' })).not.toHaveText('AV');
});

test('AC-10: de pagina doet geen aanroep naar /api/ buiten /api/me', async ({ page }) => {
  await signInAsAdmin(page);
  const calls: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/')) calls.push(pathname);
  });
  await page.goto('/design-system');
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();

  expect(calls.filter((pathname) => pathname !== '/api/me')).toStrictEqual([]);
});

test('AC-2: een user ziet "Je hebt geen toegang tot deze pagina." op /design-system', async ({ page }) => {
  const user = await createAccount('user');
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(user.email);
  await page.getByLabel('Wachtwoord').fill(PASSWORD);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();

  await page.goto('/design-system');
  await expect(page.getByRole('alert')).toHaveText('Je hebt geen toegang tot deze pagina.');
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toHaveCount(0);
});

test('AC-1: anoniem op /design-system gaat naar /login met redirect', async ({ page }) => {
  await page.goto('/design-system');

  await expect(page).toHaveURL(/\/login\?redirect=/);
  await expect(page.getByRole('heading', { level: 1, name: 'Inloggen' })).toBeVisible();
});

test('lijsttoolbar: zoeken met debounce, filter en sortering, wissen houdt sortering en zet focus op zoeken', async ({
  page,
}) => {
  const csp = collectCspViolations(page);
  await signInAsAdmin(page);
  await page.goto('/design-system');
  const section = page.getByRole('region', { name: 'ListToolbar' });
  const search = section.getByLabel('Zoeken');
  const role = section.getByLabel('Rol');
  const sort = section.getByLabel('Sorteren');
  const clear = section.getByRole('button', { name: 'Filters wissen' });
  const status = section.getByRole('status');

  await expect(clear).toBeHidden();
  await expect(section.getByText('Zoek op naam of e-mailadres.')).toBeVisible();

  await search.click();
  await page.keyboard.type('ada');
  await expect(search).toBeFocused();
  await expect(status).toHaveText('Zoeken: ada; rol: alle; sortering: Nieuwste eerst');
  await expect(clear).toBeVisible();
  await expect(search).toBeFocused();

  await role.selectOption({ label: 'Beheerder' });
  await sort.selectOption({ label: 'Naam A–Z' });
  await expect(status).toHaveText('Zoeken: ada; rol: Beheerder; sortering: Naam A–Z');

  await clear.click();
  await expect(search).toHaveValue('');
  await expect(role.locator('option:checked')).toHaveText('Alle rollen');
  await expect(sort.locator('option:checked')).toHaveText('Naam A–Z');
  await expect(status).toHaveText('Zoeken: geen; rol: alle; sortering: Naam A–Z');
  await expect(search).toBeFocused();
  await expect(clear).toBeHidden();

  await page.keyboard.press('Tab');
  await expect(role).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(sort).toBeFocused();

  await scanAxe(page);
  expect(csp).toStrictEqual([]);
});
