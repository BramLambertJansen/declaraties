import pg from 'pg';
import { z } from 'zod';
import { inviteUser } from '../../src/core/api/auth/index.ts';
import {
  APP_ORIGIN,
  Browser,
  createTestApp,
  latestMailTo,
  required,
  tokenFrom,
  totp,
  uniqueEmail,
} from '../auth/harness.ts';

// Opzet voor de integratietests van spec eigen-account (runner, ADR 0009): echte database, Better Auth en Mailpit.
// Testwachtwoorden uit herhaling: geldig voor de lengte-eis, zonder te lijken op een echt geheim (Betterleaks).
export const PASSWORD = 'ab-'.repeat(6);
export const NEW_PASSWORD = 'cd-'.repeat(6);

export function createAccountTestApp() {
  const setup = createTestApp();
  const migrator = new pg.Pool({ connectionString: required('MIGRATOR_DATABASE_URL'), max: 1 });
  const authDb = new pg.Pool({ connectionString: required('AUTH_DATABASE_URL'), max: 1 });
  type App = typeof setup.app;

  // Zoals Browser.send, maar met elke methode (PATCH, DELETE) en dezelfde cookies en IP als de browser: `call(b, 'PATCH /api/me')`.
  async function callWith(
    browser: Browser,
    route: string,
    { body, headers: extraHeaders = {} }: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const [method = 'GET', path = '/'] = route.split(' ');
    const headers = new Headers({
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      origin: APP_ORIGIN,
    });
    headers.set(required('CLIENT_IP_HEADER'), browser.ip);
    for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
    if (browser.cookies.size > 0) {
      headers.set('cookie', [...browser.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    const init = { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
    const response = await setup.app.fetch(new Request(`${APP_ORIGIN}${path}`, init));
    for (const line of response.headers.getSetCookie()) {
      const [pair = ''] = line.split(';');
      const index = pair.indexOf('=');
      const value = pair.slice(index + 1);
      if (value === '' || /max-age=0/i.test(line)) browser.cookies.delete(pair.slice(0, index));
      else browser.cookies.set(pair.slice(0, index), value);
    }
    return response;
  }

  const call = (browser: Browser, route: string, body?: unknown) => callWith(browser, route, { body });

  async function signIn(app: App, email: string, password = PASSWORD): Promise<Browser> {
    const browser = new Browser(app);
    const response = await browser.post('/api/auth/sign-in/email', { email, password });
    if (response.status !== 200) throw new Error(`inloggen mislukt: ${String(response.status)}`);
    return browser;
  }

  // Een actief account met rol (uitnodigen, wachtwoord instellen) en een eerste sessie.
  async function account(role: 'user' | 'admin', name = 'Iemand') {
    const email = uniqueEmail(`eigen-${role}`);
    const { userId } = await inviteUser(setup.auth, { name, email });
    await migrator.query('select app.assign_role($1, $2)', [userId, role]);
    const token = tokenFrom((await latestMailTo(email)).text);
    await new Browser(setup.app).post('/api/auth/reset-password', { token, newPassword: PASSWORD });
    return { email, userId, browser: await signIn(setup.app, email) };
  }

  // TOTP inschrijven en bevestigen: daarna heeft deze browser een MFA-sessie (after-hook op verify-totp).
  async function enableTotp(browser: Browser): Promise<string> {
    const enable = await browser.post('/api/auth/two-factor/enable', { password: PASSWORD });
    const { totpURI } = z.object({ totpURI: z.string() }).parse(await enable.json());
    const verify = await browser.post('/api/auth/two-factor/verify-totp', { code: totp(totpURI) });
    if (verify.status !== 200) throw new Error(`TOTP bevestigen mislukt: ${String(verify.status)}`);
    return totpURI;
  }

  async function sessionsOf(userId: string) {
    const { rows } = await authDb.query<{ token: string; session_strength: string; createdAt: Date }>(
      'select token, session_strength, "createdAt" from session where "userId" = $1 order by "createdAt"',
      [userId],
    );
    return rows;
  }

  // Een sessie ouder maken (verse-sessie-eis van 10 minuten, absolute duur van 7 dagen): createdAt én updatedAt terug in de tijd.
  async function ageSession(token: string, seconds: number): Promise<void> {
    await authDb.query(
      `update session set "createdAt" = now() - make_interval(secs => $2), "updatedAt" = now() - make_interval(secs => $2) where token = $1`,
      [token, seconds],
    );
  }

  return {
    ...setup,
    ageSession,
    authDb,
    migrator,
    call,
    callWith,
    signIn: (email: string, password?: string) => signIn(setup.app, email, password),
    account,
    enableTotp,
    sessionsOf,
    close: () => Promise.all([setup.pool.end(), migrator.end(), authDb.end(), setup.auth.closePool()]),
  };
}

export interface MailSummary {
  readonly subject: string;
  readonly text: string;
}

// Alle mails aan een adres uit Mailpit (nieuwste eerst), met tekst.
export async function mailsTo(email: string): Promise<MailSummary[]> {
  const base = required('MAILPIT_URL');
  const search = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  const { messages } = z
    .object({ messages: z.array(z.object({ ID: z.string(), Subject: z.string() })) })
    .parse(await search.json());
  return Promise.all(
    messages.map(async ({ ID, Subject }) => {
      const message = z.object({ Text: z.string() }).parse(await (await fetch(`${base}/api/v1/message/${ID}`)).json());
      return { subject: Subject, text: message.Text };
    }),
  );
}

// Wacht tot er een mail met dit onderwerp aan het adres is (SMTP is asynchroon).
export async function waitForMail(email: string, subject: string): Promise<MailSummary> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const found = (await mailsTo(email)).find((mail) => mail.subject === subject);
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`geen mail "${subject}" aan ${email}`);
}

// Geeft na een pauze het aantal mails met dit onderwerp (voor "er gaat niets heen").
export async function countMails(email: string, subject?: string): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const mails = await mailsTo(email);
  return subject === undefined ? mails.length : mails.filter((mail) => mail.subject === subject).length;
}

// De link uit een bevestigingsmail: `${APP_ORIGIN}/email-bevestigen?token=…` (spec eigen-account).
export function confirmTokenFrom(text: string): string {
  const match = /\/email-bevestigen\?token=([^\s]+)/.exec(text);
  if (match?.[1] === undefined) throw new Error('geen bevestigingslink in de mail');
  return decodeURIComponent(match[1]);
}

export async function json(response: Response): Promise<unknown> {
  return response.json();
}
