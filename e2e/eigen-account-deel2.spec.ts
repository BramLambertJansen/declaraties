import { expect, test, type Page } from '@playwright/test';
import { clientIpHeaders, createAccount, PASSWORD, type TestAccount } from './support/accounts.ts';
import { collectCspViolations } from './support/axe.ts';
import {
  ageSessionsOf,
  axeAtBothWidths,
  confirmLink,
  MAIL,
  mailSubjects,
  mailText,
  openAccount,
  secondDevice,
  signIn,
} from './support/eigen-account.ts';

// Spec eigen-account, deel 2: sessies en e-mailadres tegen de echte stack (CSP aan, mails uit Mailpit, axe op 375 en 1280 px).
// /change-email heeft een rate limit per IP en pad (3 per 10 s): elke test heeft een eigen IP (clientIpHeaders).
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders(clientIpHeaders());
});

let counter = 0;
function newAddress(): string {
  counter += 1;
  return `nieuw-${String(Date.now())}-${String(counter)}@e2e.test`;
}

async function requestEmailChange(page: Page, address: string): Promise<void> {
  const field = page.getByRole('textbox', { name: 'Nieuw e-mailadres' });
  await field.fill(address);
  await field.press('Enter');
}

const REQUESTED = (email: string) =>
  `We hebben een bevestigingslink gestuurd naar ${email}. Daarna volgt een link naar het nieuwe adres.`;

test('AC-6: een andere sessie beëindigen via de dialoog; de eigen sessie heeft het label "Dit apparaat"', async ({
  browser,
  page,
}) => {
  const csp = collectCspViolations(page);
  const user = await createAccount('user');
  await signIn(page, user);
  const other = await secondDevice(browser, user);
  await openAccount(page);

  const table = page.getByRole('region', { name: 'Sessies' });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByText('Dit apparaat')).toHaveCount(1);
  await expect(table.getByRole('button', { name: /Beëindigen/ })).toHaveCount(1);
  await axeAtBothWidths(page);

  await table.getByRole('button', { name: /Beëindigen/ }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Sessie beëindigen?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/^Het apparaat .+ wordt uitgelogd\.$/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Annuleren' })).toBeFocused();
  await axeAtBothWidths(page);

  await dialog.getByRole('button', { name: 'Beëindigen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'De sessie is beëindigd.' })).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(2);
  expect((await other.request.get('/api/me')).status()).toBe(401);
  expect((await page.request.get('/api/me')).status()).toBe(200);
  expect(csp).toStrictEqual([]);
});

test('AC-6: Annuleren in de dialoog beëindigt niets en geeft de focus terug aan de knop', async ({ browser, page }) => {
  const user = await createAccount('user');
  await signIn(page, user);
  const other = await secondDevice(browser, user);
  await page.goto('/account');
  const table = page.getByRole('region', { name: 'Sessies' });
  const trigger = table.getByRole('button', { name: /Beëindigen/ });
  await trigger.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuleren' }).click();

  await expect(page.getByRole('alertdialog')).toBeHidden();
  await expect(trigger).toBeFocused();
  expect((await other.request.get('/api/me')).status()).toBe(200);
});

test('AC-7: "Alle andere sessies beëindigen" laat alleen "Dit apparaat" over', async ({ browser, page }) => {
  const user = await createAccount('user');
  await signIn(page, user);
  const second = await secondDevice(browser, user);
  const third = await secondDevice(browser, user);
  await page.goto('/account');
  const table = page.getByRole('region', { name: 'Sessies' });
  await expect(table.getByRole('row')).toHaveCount(4);

  await page.getByRole('button', { name: 'Alle andere sessies beëindigen' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Alle andere sessies beëindigen?' });
  await expect(dialog.getByText('Je blijft alleen op dit apparaat ingelogd.')).toBeVisible();
  await axeAtBothWidths(page);
  await dialog.getByRole('button', { name: 'Beëindigen' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Je andere sessies zijn beëindigd.' })).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table.getByText('Dit apparaat')).toHaveCount(1);
  expect((await second.request.get('/api/me')).status()).toBe(401);
  expect((await third.request.get('/api/me')).status()).toBe(401);
  expect((await page.request.get('/api/me')).status()).toBe(200);
});

test('AC-8: e-mailadres wijzigen met beide links; inloggen met het nieuwe adres, het oude werkt niet meer', async ({
  browser,
  page,
}) => {
  const csp = collectCspViolations(page);
  const user = await createAccount('user');
  await signIn(page, user);
  const other = await secondDevice(browser, user);
  await openAccount(page);
  await expect(page.getByText(`Huidig e-mailadres: ${user.email}`)).toBeVisible();
  const nieuw = newAddress();

  await requestEmailChange(page, nieuw);
  await expect(page.getByRole('status').filter({ hasText: REQUESTED(user.email) })).toBeVisible();
  const oldMail = await mailText(user.email, MAIL.old);
  expect(oldMail).toContain(nieuw);

  await page.goto(await confirmLink(user.email, MAIL.old));
  await expect(page.getByRole('heading', { level: 1, name: 'E-mailadres bevestigen' })).toBeVisible();
  await axeAtBothWidths(page);
  await page.getByRole('button', { name: 'Bevestigen' }).click();
  await expect(
    page.getByText('Gelukt. Open nu de link die we naar je nieuwe e-mailadres hebben gestuurd.'),
  ).toBeVisible();
  await axeAtBothWidths(page);

  await page.goto(await confirmLink(nieuw, MAIL.next));
  await page.getByRole('button', { name: 'Bevestigen' }).click();
  await expect(page.getByText('Je e-mailadres is gewijzigd.')).toBeVisible();
  await axeAtBothWidths(page);
  await page.getByRole('link', { name: 'Naar Mijn account' }).click();
  await expect(page.getByText(`Huidig e-mailadres: ${nieuw}`)).toBeVisible();

  expect((await other.request.get('/api/me')).status()).toBe(401);
  expect(await mailSubjects(user.email)).toContain(MAIL.changed);
  const renamed: TestAccount = { ...user, email: nieuw };
  const fresh = await secondDevice(browser, renamed);
  expect(await (await fresh.request.get('/api/me')).json()).toMatchObject({ email: nieuw });
  const stale = await (await browser.newContext({ extraHTTPHeaders: clientIpHeaders() })).newPage();
  await stale.goto('/login');
  await stale.getByLabel('E-mailadres').fill(user.email);
  await stale.getByLabel('Wachtwoord').fill(PASSWORD);
  await stale.getByRole('button', { name: 'Inloggen' }).click();
  await expect(stale.getByRole('alert')).toHaveText('E-mailadres of wachtwoord klopt niet.');
  expect(csp).toStrictEqual([]);
});

test('AC-9: een bezet adres geeft dezelfde melding; het bezette adres krijgt niets, het oude de neutrale mail', async ({
  page,
}) => {
  const user = await createAccount('user');
  const owner = await createAccount('user');
  await signIn(page, user);
  await page.goto('/account');
  const before = (await mailSubjects(owner.email)).length;

  await requestEmailChange(page, owner.email);

  await expect(page.getByRole('status').filter({ hasText: REQUESTED(user.email) })).toBeVisible();
  const taken = await mailText(user.email, MAIL.taken);
  expect(taken).toContain(owner.email);
  expect(await mailSubjects(user.email)).not.toContain(MAIL.old);
  expect((await mailSubjects(owner.email)).length).toBe(before);
});

test('AC-10: een sessie ouder dan 10 minuten: "Log opnieuw in om dit te wijzigen."', async ({ page }) => {
  const user = await createAccount('user');
  await signIn(page, user);
  await page.goto('/account');
  await ageSessionsOf(user.email, 11 * 60);

  await requestEmailChange(page, newAddress());

  const alert = page.getByRole('alert');
  await expect(alert).toHaveText('Log opnieuw in om dit te wijzigen.');
  await expect(alert).toBeFocused();
  expect(await mailSubjects(user.email)).not.toContain(MAIL.old);
});

test('AC-11: anoniem met een geldige link: eerst /login, en er verandert niets', async ({ browser, page }) => {
  const user = await createAccount('user');
  await signIn(page, user);
  await page.goto('/account');
  await requestEmailChange(page, newAddress());
  const link = await confirmLink(user.email, MAIL.old);

  const anonymous = await (await browser.newContext({ extraHTTPHeaders: clientIpHeaders() })).newPage();
  await anonymous.goto(link);

  await expect(anonymous).toHaveURL(/\/login\?/);
  await expect(anonymous.getByRole('button', { name: 'Bevestigen' })).toHaveCount(0);
  expect(await (await page.request.get('/api/me')).json()).toMatchObject({ email: user.email });
});

test('AC-11: een andere ingelogde gebruiker: "Deze link is verlopen of al gebruikt." en er verandert niets', async ({
  browser,
  page,
}) => {
  const user = await createAccount('user');
  const intruder = await createAccount('user');
  await signIn(page, user);
  await page.goto('/account');
  const nieuw = newAddress();
  await requestEmailChange(page, nieuw);
  const link = await confirmLink(user.email, MAIL.old);
  const other = await secondDevice(browser, intruder);

  await other.goto(link);
  await other.getByRole('button', { name: 'Bevestigen' }).click();

  await expect(other.getByRole('alert')).toHaveText(
    'Deze link is verlopen of al gebruikt. Vraag de wijziging opnieuw aan.',
  );
  expect(await mailSubjects(nieuw)).toStrictEqual([]);
  expect(await (await page.request.get('/api/me')).json()).toMatchObject({ email: user.email });
  expect(await (await other.request.get('/api/me')).json()).toMatchObject({ email: intruder.email });
});

test('axe: /email-bevestigen met een ongeldige link en /account op 375 en 1280 px', async ({ page }) => {
  const user = await createAccount('user');
  await signIn(page, user);
  await page.goto('/email-bevestigen?token=ongeldig');
  await page.getByRole('button', { name: 'Bevestigen' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Deze link is verlopen of al gebruikt. Vraag de wijziging opnieuw aan.',
  );
  await axeAtBothWidths(page);

  await page.goto('/account');
  await expect(page.getByRole('region', { name: 'Sessies' })).toBeVisible();
  await axeAtBothWidths(page);
});
