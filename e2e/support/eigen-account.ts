import pg from 'pg';
import { expect, type Browser, type Page } from '@playwright/test';
import { clientIpHeaders, PASSWORD, totpFor, type TestAccount } from './accounts.ts';
import { scanAxe } from './axe.ts';

// Hulp voor de e2e-tests van spec eigen-account. Elke browsercontext krijgt een eigen IP (rate limit van Better Auth per
// IP en pad), zodat de tests elkaar niet afremmen.

export async function axeAtBothWidths(page: Page): Promise<void> {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await scanAxe(page);
    // Als tekst: e2e heeft geen DOM-types.
    const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth');
    expect(overflow, `horizontaal scrollen op ${String(width)} px`).toBeLessThanOrEqual(0);
  }
}

// Inloggen via het scherm; met een TOTP-geheim ook de code.
export async function signIn(page: Page, account: TestAccount, password = PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mailadres').fill(account.email);
  await page.getByLabel('Wachtwoord').fill(password);
  await page.getByRole('button', { name: 'Inloggen' }).click();
  if (account.totpSecret !== undefined) {
    await page.getByLabel('Code', { exact: true }).fill(totpFor(account.totpSecret));
    await page.getByRole('button', { name: 'Bevestigen' }).click();
  }
  await expect(page.getByRole('button', { name: 'Profielmenu' })).toBeVisible();
}

// Een tweede apparaat: een eigen context (eigen cookies en IP), ingelogd.
export async function secondDevice(browser: Browser, account: TestAccount, password = PASSWORD): Promise<Page> {
  const page = await (await browser.newContext({ extraHTTPHeaders: clientIpHeaders() })).newPage();
  await signIn(page, account, password);
  return page;
}

export async function openAccount(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Profielmenu' }).click();
  await page.getByRole('menuitem', { name: 'Mijn account' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mijn account');
}

// ---- Deel 2: mails uit Mailpit en sessies ouder maken (runner, ADR 0009) ----

function env(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} ontbreekt (alleen in de runner: pnpm ui:check)`);
  return value;
}

interface MailpitMessage {
  readonly ID: string;
  readonly Subject: string;
}

async function messagesTo(email: string): Promise<MailpitMessage[]> {
  const search = await fetch(`${env('MAILPIT_URL')}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  const found: unknown = await search.json();
  if (typeof found !== 'object' || found === null || !('messages' in found) || !Array.isArray(found.messages))
    return [];
  const messages: unknown[] = found.messages;
  return messages.flatMap((message) =>
    typeof message === 'object' &&
    message !== null &&
    'ID' in message &&
    typeof message.ID === 'string' &&
    'Subject' in message &&
    typeof message.Subject === 'string'
      ? [{ ID: message.ID, Subject: message.Subject }]
      : [],
  );
}

export async function mailSubjects(email: string): Promise<string[]> {
  return (await messagesTo(email)).map((message) => message.Subject);
}

// Wacht op een mail met dit onderwerp en geeft de tekst terug.
export async function mailText(email: string, subject: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const found = (await messagesTo(email)).find((message) => message.Subject === subject);
    if (found !== undefined) {
      const body: unknown = await (await fetch(`${env('MAILPIT_URL')}/api/v1/message/${found.ID}`)).json();
      return typeof body === 'object' && body !== null && 'Text' in body ? String(body.Text) : '';
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`geen mail "${subject}" aan ${email}`);
}

// Het pad met zoekparameters van de link in de mail ("/email-bevestigen?token=…"), voor page.goto.
export async function confirmLink(email: string, subject: string): Promise<string> {
  const link = /https?:\/\/\S+\/email-bevestigen\?token=\S+/.exec(await mailText(email, subject))?.[0];
  if (link === undefined) throw new Error(`geen bevestigingslink in "${subject}" aan ${email}`);
  return new URL(link).pathname + new URL(link).search;
}

export const MAIL = {
  old: 'Bevestig de wijziging van je e-mailadres',
  next: 'Bevestig je nieuwe e-mailadres',
  taken: 'Je e-mailadres is niet gewijzigd',
  changed: 'Je e-mailadres is gewijzigd',
} as const;

// Maakt alle sessies van een account ouder (de verse-sessie-eis is 10 minuten); direct in better_auth als auth_service.
export async function ageSessionsOf(email: string, seconds: number): Promise<void> {
  const pool = new pg.Pool({ connectionString: env('AUTH_DATABASE_URL'), max: 1 });
  try {
    await pool.query(
      `update session set "createdAt" = now() - make_interval(secs => $2), "updatedAt" = now() - make_interval(secs => $2)
       where "userId" = (select id from "user" where email = $1)`,
      [email, seconds],
    );
  } finally {
    await pool.end();
  }
}
