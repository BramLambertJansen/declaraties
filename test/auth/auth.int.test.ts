import { getMigrations } from 'better-auth/db/migration';
import pg from 'pg';
import { afterAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { createAuthOptions, DISABLED_PATHS } from '../../src/core/api/auth/options.ts';

const CLOSED = [
  ...DISABLED_PATHS.map((path) => ({ method: 'POST', path })),
  { method: 'GET', path: '/reset-password/abc?callbackURL=/' },
];
import { AccountAlreadyActiveError, inviteUser, reinviteUser } from '../../src/core/api/auth/index.ts';
import { APP_ORIGIN, Browser, createTestApp, latestMailTo, required, tokenFrom, totp, uniqueEmail } from './harness.ts';

// Better Auth in de API (ADR 0041, 0043; spec accountbeheer). Draait via `pnpm test:db` tegen de echte database
// (als auth_service) en Mailpit.
// Testwachtwoorden uit herhaling: geldig voor de lengte-eis, zonder te lijken op een echt geheim (Betterleaks).
const PASSWORD = 'ab-'.repeat(6);
const WRONG = 'xy-'.repeat(6);
const ELEVEN = 'ab-'.repeat(3) + 'ab';
const { auth, app, pool } = createTestApp();
const db = new pg.Pool({ connectionString: required('AUTH_DATABASE_URL'), max: 2 });
afterAll(async () => {
  await Promise.all([db.end(), pool.end()]);
});

async function invitedAndActivated(name: string): Promise<{ email: string; userId: string }> {
  const email = uniqueEmail(name);
  const { userId } = await inviteUser(auth, { name, email });
  const token = tokenFrom((await latestMailTo(email)).text);
  const response = await new Browser(app).post('/api/auth/reset-password', { token, newPassword: PASSWORD });
  expect(response.status).toBe(200);
  return { email, userId };
}

async function sessionStrength(browser: Browser): Promise<string | undefined> {
  const response = await browser.get('/api/auth/get-session');
  const body = z
    .object({ session: z.object({ sessionStrength: z.string() }) })
    .nullable()
    .parse(await response.json());
  return body?.session.sessionStrength;
}

describe('schema', () => {
  test('na de migraties valt er voor Better Auth niets meer te migreren', async () => {
    const options = createAuthOptions(
      { origin: APP_ORIGIN, secret: required('AUTH_SECRET'), sendInvitation: async () => {} },
      db,
    );
    const { toBeCreated, toBeAdded } = await getMigrations(options);

    expect({ toBeCreated, toBeAdded }).toStrictEqual({ toBeCreated: [], toBeAdded: [] });
  });

  test('session_strength accepteert alleen password of mfa (CHECK, vóór de foreign key)', async () => {
    await expect(
      db.query(
        `insert into session ("id", "expiresAt", "token", "updatedAt", "userId", "session_strength")
         values ('s', '2099-01-01', 't', now(), 'onbekend', 'none')`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('publiek dicht (ADR 0043)', () => {
  test.each(CLOSED)('$method $path geeft 404', async ({ method, path }) => {
    const browser = new Browser(app);
    const response =
      method === 'GET' ? await browser.get(`/api/auth${path}`) : await browser.post(`/api/auth${path}`, {});

    expect(response.status).toBe(404);
  });
});

describe('uitnodigen (spec accounts/AC-5, AC-6)', () => {
  test('uitnodiging: mail met link, wachtwoord instellen, e-mail geverifieerd, inloggen met password-sessie', async () => {
    const email = uniqueEmail('nieuw');
    await inviteUser(auth, { name: 'Nieuwe Gebruiker', email });
    const mail = await latestMailTo(email);

    expect(mail.subject).toBe('Uitnodiging voor App-template');
    expect(mail.text).toContain('Hallo Nieuwe Gebruiker,');
    expect(mail.text).toContain(`${APP_ORIGIN}/uitnodiging?token=`);

    const reset = await new Browser(app).post('/api/auth/reset-password', {
      token: tokenFrom(mail.text),
      newPassword: PASSWORD,
    });
    expect(reset.status).toBe(200);
    const { rows } = await db.query<{ emailVerified: boolean }>('select "emailVerified" from "user" where email = $1', [
      email,
    ]);
    expect(rows[0]?.emailVerified).toBe(true);

    const browser = new Browser(app);
    expect((await browser.post('/api/auth/sign-in/email', { email, password: PASSWORD })).status).toBe(200);
    expect([...browser.cookies.keys()]).toContain('__Host-auth.session_token');
    expect(await sessionStrength(browser)).toBe('password');
  });

  test('de link werkt maar één keer', async () => {
    const email = uniqueEmail('eenmalig');
    await inviteUser(auth, { name: 'Eenmalig', email });
    const token = tokenFrom((await latestMailTo(email)).text);
    const browser = new Browser(app);

    expect((await browser.post('/api/auth/reset-password', { token, newPassword: PASSWORD })).status).toBe(200);
    expect((await browser.post('/api/auth/reset-password', { token, newPassword: PASSWORD })).status).toBe(400);
  });

  test('wachtwoord korter dan 12 tekens wordt geweigerd', async () => {
    const email = uniqueEmail('kort');
    await inviteUser(auth, { name: 'Kort', email });
    const token = tokenFrom((await latestMailTo(email)).text);

    expect((await new Browser(app).post('/api/auth/reset-password', { token, newPassword: ELEVEN })).status).toBe(400);
  });

  test('opnieuw uitnodigen: alleen de nieuwste link werkt', async () => {
    const email = uniqueEmail('opnieuw');
    const { userId } = await inviteUser(auth, { name: 'Opnieuw', email });
    const oldToken = tokenFrom((await latestMailTo(email)).text);
    await reinviteUser(auth, userId);
    let newToken = oldToken;
    for (let attempt = 0; attempt < 20 && newToken === oldToken; attempt += 1)
      newToken = tokenFrom((await latestMailTo(email)).text);
    const browser = new Browser(app);

    expect(newToken).not.toBe(oldToken);
    expect((await browser.post('/api/auth/reset-password', { token: oldToken, newPassword: PASSWORD })).status).toBe(
      400,
    );
    expect((await browser.post('/api/auth/reset-password', { token: newToken, newPassword: PASSWORD })).status).toBe(
      200,
    );
  });

  test('opnieuw uitnodigen van een actief account wordt geweigerd', async () => {
    const { userId } = await invitedAndActivated('actief');

    await expect(reinviteUser(auth, userId)).rejects.toBeInstanceOf(AccountAlreadyActiveError);
  });

  test('twee gelijktijdige uitnodigingen voor hetzelfde adres: precies één slaagt', async () => {
    const email = uniqueEmail('race');
    const results = await Promise.allSettled([
      inviteUser(auth, { name: 'A', email }),
      inviteUser(auth, { name: 'B', email }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });

  test('rate limit telt per client-IP uit CLIENT_IP_HEADER (framework §6, Verharding)', async () => {
    const { email } = await invitedAndActivated('limiet');
    const attacker = new Browser(app);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      statuses.push((await attacker.post('/api/auth/sign-in/email', { email, password: WRONG })).status);
    }
    const other = await new Browser(app).post('/api/auth/sign-in/email', { email, password: WRONG });

    expect(statuses.at(-1)).toBe(429);
    expect(other.status).toBe(401);
  });

  test('onbekend e-mailadres en fout wachtwoord geven dezelfde fout', async () => {
    const { email } = await invitedAndActivated('enum');
    const wrong = await new Browser(app).post('/api/auth/sign-in/email', { email, password: WRONG });
    const unknown = await new Browser(app).post('/api/auth/sign-in/email', {
      email: uniqueEmail('bestaat-niet'),
      password: PASSWORD,
    });

    expect([wrong.status, unknown.status]).toStrictEqual([401, 401]);
    expect(await wrong.json()).toStrictEqual(await unknown.json());
  });
});

describe('MFA en session_strength (framework §6, ADR 0043)', () => {
  async function enrolled() {
    const { email } = await invitedAndActivated('mfa');
    const browser = new Browser(app);
    await browser.post('/api/auth/sign-in/email', { email, password: PASSWORD });
    const enable = await browser.post('/api/auth/two-factor/enable', { password: PASSWORD });
    const { totpURI } = z.object({ totpURI: z.string() }).parse(await enable.json());
    return { email, browser, totpURI };
  }

  test('TOTP-inschrijving bevestigen maakt een mfa-sessie', async () => {
    const { browser, totpURI } = await enrolled();
    expect(await sessionStrength(browser)).toBe('password');

    expect((await browser.post('/api/auth/two-factor/verify-totp', { code: totp(totpURI) })).status).toBe(200);
    expect(await sessionStrength(browser)).toBe('mfa');
  });

  test('inloggen met TOTP: eerst geen sessie, na de code een mfa-sessie', async () => {
    const { email, browser: first, totpURI } = await enrolled();
    await first.post('/api/auth/two-factor/verify-totp', { code: totp(totpURI) });
    const browser = new Browser(app);

    const signIn = await browser.post('/api/auth/sign-in/email', { email, password: PASSWORD });
    expect(await signIn.json()).toMatchObject({ twoFactorRedirect: true });
    expect(await sessionStrength(browser)).toBeUndefined();

    expect((await browser.post('/api/auth/two-factor/verify-totp', { code: totp(totpURI) })).status).toBe(200);
    expect(await sessionStrength(browser)).toBe('mfa');
  });

  test('een foute code geeft geen sessie', async () => {
    const { email, browser: first, totpURI } = await enrolled();
    await first.post('/api/auth/two-factor/verify-totp', { code: totp(totpURI) });
    const browser = new Browser(app);
    await browser.post('/api/auth/sign-in/email', { email, password: PASSWORD });
    const wrong = totp(totpURI) === '000000' ? '111111' : '000000';

    expect((await browser.post('/api/auth/two-factor/verify-totp', { code: wrong })).status).toBe(401);
    expect(await sessionStrength(browser)).toBeUndefined();
  });

  test('trustDevice wordt geweigerd', async () => {
    const { browser, totpURI } = await enrolled();

    expect(
      (await browser.post('/api/auth/two-factor/verify-totp', { code: totp(totpURI), trustDevice: true })).status,
    ).toBe(400);
    expect(await sessionStrength(browser)).toBe('password');
  });

  test('2FA uitzetten zet de sessie terug op password', async () => {
    const { browser, totpURI } = await enrolled();
    await browser.post('/api/auth/two-factor/verify-totp', { code: totp(totpURI) });

    expect((await browser.post('/api/auth/two-factor/disable', { password: PASSWORD })).status).toBe(200);
    expect(await sessionStrength(browser)).toBe('password');
  });

  test('uitloggen trekt de sessie in de database in (spec accounts/AC-10)', async () => {
    const { browser } = await enrolled();
    const token = browser.cookies.get('__Host-auth.session_token')?.split('.')[0] ?? '';

    expect((await browser.post('/api/auth/sign-out')).status).toBe(200);
    expect((await db.query('select 1 from session where token = $1', [token])).rowCount).toBe(0);
    expect(await sessionStrength(browser)).toBeUndefined();
  });
});
