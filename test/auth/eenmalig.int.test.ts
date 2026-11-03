import { createHash, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { EMAIL_CHANGE_TTL_SECONDS } from '../../src/core/shared/limits.ts';
import {
  confirmTokenFrom,
  countMails,
  createAccountTestApp,
  json,
  PASSWORD,
  NEW_PASSWORD,
  waitForMail,
} from '../api/account-harness.ts';
import { Browser, freshTotp, uniqueEmail } from './harness.ts';

// Spec inloggat-dichten (ADR 0075): een TOTP-code en een link van de e-mailwijziging werken één keer, en geen JSON-antwoord van
// /api/auth/* bevat een sessietoken. Echte database, Better Auth en Mailpit (`pnpm test:db`), niets gemockt.
const t = createAccountTestApp();
afterAll(async () => {
  await t.close();
});

const SUBJECT_OLD = 'Bevestig de wijziging van je e-mailadres';
const SUBJECT_NEW = 'Bevestig je nieuwe e-mailadres';
const SESSION_COOKIE = '__Host-auth.session_token';

const totpUri = z.object({ totpURI: z.string() });

// TOTP inschrijven en de inschrijfcode teruggeven: die code is daarna gebruikt.
async function enrol(browser: Browser): Promise<{ uri: string; enrolCode: string }> {
  const enable = await browser.post('/api/auth/two-factor/enable', { password: PASSWORD });
  const uri = totpUri.parse(await enable.json()).totpURI;
  const enrolCode = freshTotp(uri);
  const verify = await browser.post('/api/auth/two-factor/verify-totp', { code: enrolCode });
  expect(verify.status).toBe(200);
  return { uri, enrolCode };
}

// Een nieuwe browser tot aan de TOTP-stap.
async function challenge(email: string): Promise<Browser> {
  const browser = new Browser(t.app);
  const signIn = await browser.post('/api/auth/sign-in/email', { email, password: PASSWORD });
  expect(await signIn.json()).toMatchObject({ twoFactorRedirect: true });
  return browser;
}

async function sessionCount(userId: string): Promise<number> {
  const { rows } = await t.authDb.query<{ count: string }>('select count(*) from session where "userId" = $1', [
    userId,
  ]);
  return Number(rows[0]?.count ?? 0);
}

async function sessionStrength(browser: Browser): Promise<string | undefined> {
  const body = z
    .object({ session: z.object({ sessionStrength: z.string() }) })
    .nullable()
    .parse(await (await browser.get('/api/auth/get-session')).json());
  return body?.session.sessionStrength;
}

const verifyTotp = (browser: Browser, code: string) => browser.post('/api/auth/two-factor/verify-totp', { code });

describe('TOTP: een code werkt één keer', () => {
  test('AC-1: dezelfde code bij een tweede inlogpoging: 401 INVALID_CODE, geen sessiecookie en geen nieuwe sessie', async () => {
    const { browser, email, userId } = await t.account('admin');
    const { uri } = await enrol(browser);
    const first = await challenge(email);
    const code = freshTotp(uri);
    expect((await verifyTotp(first, code)).status).toBe(200);
    const before = await sessionCount(userId);
    const second = await challenge(email);

    const again = await verifyTotp(second, code);

    expect([again.status, await json(again)]).toMatchObject([401, { code: 'INVALID_CODE' }]);
    expect(second.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(await sessionCount(userId)).toBe(before);
  });

  test('AC-2: twee pogingen tegelijk met dezelfde code: precies één krijgt een sessie', async () => {
    const { browser, email } = await t.account('admin');
    const { uri } = await enrol(browser);
    const [one, two] = await Promise.all([challenge(email), challenge(email)]);
    const code = freshTotp(uri);

    const responses = await Promise.all([verifyTotp(one, code), verifyTotp(two, code)]);

    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toStrictEqual([200, 401]);
    const sessions = await Promise.all([sessionStrength(one), sessionStrength(two)]);
    expect(sessions.filter((strength) => strength === 'mfa')).toHaveLength(1);
  });

  test('AC-3: step-up met een code die al voor inloggen is gebruikt: 401 en de sessie blijft password', async () => {
    const { browser, email, userId } = await t.account('user');
    const { uri } = await enrol(browser);
    const other = await challenge(email);
    const code = freshTotp(uri);
    expect((await verifyTotp(other, code)).status).toBe(200);
    const token = browser.cookies.get(SESSION_COOKIE)?.split('.')[0] ?? '';
    await t.authDb.query(`update session set session_strength = 'password' where "userId" = $1 and token = $2`, [
      userId,
      token,
    ]);

    const stepUp = await verifyTotp(browser, code);

    expect(stepUp.status).toBe(401);
    const { rows } = await t.authDb.query<{ session_strength: string }>(
      'select session_strength from session where token = $1',
      [token],
    );
    expect(rows.map((row) => row.session_strength)).toStrictEqual(['password']);
  });

  test('AC-4: na een gebruikte code werkt de volgende code wel (de claim blokkeert alleen die ene code)', async () => {
    const { browser, email } = await t.account('admin');
    const { uri, enrolCode } = await enrol(browser);
    const attempt = await challenge(email);

    expect((await verifyTotp(attempt, enrolCode)).status).toBe(401);
    expect((await verifyTotp(attempt, freshTotp(uri))).status).toBe(200);
    expect(await sessionStrength(attempt)).toBe('mfa');
  });
});

async function requestChange(browser: Browser, newEmail: string): Promise<Response> {
  return t.call(browser, 'POST /api/auth/change-email', { newEmail });
}

async function confirm(browser: Browser, token: string): Promise<Response> {
  return t.call(browser, 'POST /api/me/email/bevestigen', { token });
}

// Link 1 van een nieuwe e-mailwijziging, met account en het nieuwe adres.
async function firstLink() {
  const account = await t.account('user');
  const nieuw = uniqueEmail('nieuw');
  expect((await requestChange(account.browser, nieuw)).status).toBe(200);
  const token = confirmTokenFrom((await waitForMail(account.email, SUBJECT_OLD)).text);
  return { ...account, nieuw, token };
}

// Is deze link (van deze gebruiker) geclaimd? Gelezen als app_migrator (lid van app_definer, de enige rol met een policy). De
// sleutel volgt de spec (email-link: + sha256 van actor:header.payload), los van de code berekend. Zonder de tabel (vóór de
// bouw) is er geen claim.
async function claimed(userId: string, token: string): Promise<boolean> {
  const signed = token.slice(0, token.lastIndexOf('.'));
  const key = `email-link:${createHash('sha256').update(`${userId}:${signed}`, 'utf8').digest('hex')}`;
  const table = await t.migrator.query<{ exists: boolean }>(
    "select to_regclass('app.one_time_use') is not null as exists",
  );
  if (table.rows[0]?.exists !== true) return false;
  const { rowCount } = await t.migrator.query('select 1 from app.one_time_use where key = $1', [key]);
  return rowCount === 1;
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Dezelfde handtekening in een andere spelling: de laatste twee bits van het 43e teken tellen niet mee.
function otherSpelling(token: string): string {
  const last = token.at(-1) ?? 'A';
  return `${token.slice(0, -1)}${BASE64URL.charAt(BASE64URL.indexOf(last) ^ 1)}`;
}

// Hetzelfde token met een andere payload (en dus een ongeldige handtekening, die nooit gecontroleerd wordt).
function withPayload(token: string, change: (payload: Record<string, unknown>) => Record<string, unknown>): string {
  const [header = '', payload = '', signature = ''] = token.split('.');
  const parsed = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
  return [header, Buffer.from(JSON.stringify(change(parsed)), 'utf8').toString('base64url'), signature].join('.');
}

describe('e-maillink: een link werkt één keer', () => {
  test('AC-6: dezelfde link in een andere spelling van de handtekening: 409 EMAIL_LINK_INVALID en één mail 2', async () => {
    const { browser, nieuw, token } = await firstLink();
    expect(otherSpelling(token)).not.toBe(token);
    expect((await confirm(browser, token)).status).toBe(200);

    const again = await confirm(browser, otherSpelling(token));

    expect([again.status, await json(again)]).toMatchObject([409, { code: 'EMAIL_LINK_INVALID' }]);
    expect(await countMails(nieuw, SUBJECT_NEW)).toBe(1);
  });

  test('AC-7: twee bevestigingen tegelijk: één { stap: oud }, de ander 409, en één mail 2', async () => {
    const { browser, nieuw, token } = await firstLink();

    const responses = await Promise.all([confirm(browser, token), confirm(browser, token)]);
    const bodies = await Promise.all(responses.map(json));

    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toStrictEqual([200, 409]);
    expect(bodies).toContainEqual({ stap: 'oud' });
    expect(bodies).toContainEqual(expect.objectContaining({ code: 'EMAIL_LINK_INVALID' }));
    expect(await countMails(nieuw, SUBJECT_NEW)).toBe(1);
  });

  test('AC-12: de link van A in de sessie van B: 409 voor B, en daarna werkt hij voor A nog wel', async () => {
    const { browser, userId, nieuw, token } = await firstLink();
    const intruder = await t.account('user');

    const theirs = await confirm(intruder.browser, token);

    expect([theirs.status, await json(theirs)]).toMatchObject([409, { code: 'EMAIL_LINK_INVALID' }]);
    expect(await claimed(userId, token)).toBe(false);
    expect(await claimed(intruder.userId, token)).toBe(false);
    const mine = await confirm(browser, token);
    expect([mine.status, await json(mine)]).toStrictEqual([200, { stap: 'oud' }]);
    await waitForMail(nieuw, SUBJECT_NEW);
  });

  // Elke rij wijzigt één voorwaarde van de echte link; daarna bewijst de echte link zelf (de basis) dat hij wel werkt.
  test('AC-13: een token zonder geldige exp: 409 EMAIL_LINK_INVALID en geen claim; de echte link werkt daarna', async () => {
    const { browser, userId, token } = await firstLink();
    const now = Math.floor(Date.now() / 1000);
    const rows: readonly [string, (payload: Record<string, unknown>) => Record<string, unknown>][] = [
      ['zonder exp', (payload) => ({ ...payload, exp: undefined })],
      ['exp in het verleden', (payload) => ({ ...payload, exp: now - 1 })],
      ['exp verder dan de geldigheid', (payload) => ({ ...payload, exp: now + EMAIL_CHANGE_TTL_SECONDS + 60 })],
      ['exp geen geheel getal', (payload) => ({ ...payload, exp: 'morgen' })],
    ];

    for (const [name, change] of rows) {
      const forged = withPayload(token, change);
      const response = await confirm(browser, forged);
      expect([name, response.status, await json(response)]).toMatchObject([name, 409, { code: 'EMAIL_LINK_INVALID' }]);
      expect([name, await claimed(userId, forged)]).toStrictEqual([name, false]);
    }
    const real = await confirm(browser, token);
    expect([real.status, await json(real)]).toStrictEqual([200, { stap: 'oud' }]);
  });

  test('AC-15: een afgekapte link: 409 zonder claim, daarna werkt de volledige link', async () => {
    const { browser, userId, nieuw, token } = await firstLink();

    const truncated = await confirm(browser, token.slice(0, -1));

    expect([truncated.status, await json(truncated)]).toMatchObject([409, { code: 'EMAIL_LINK_INVALID' }]);
    expect(await claimed(userId, token)).toBe(false);
    const full = await confirm(browser, token);
    expect([full.status, await json(full)]).toStrictEqual([200, { stap: 'oud' }]);
    expect(await claimed(userId, token)).toBe(true);
    await waitForMail(nieuw, SUBJECT_NEW);
  });

  test('de bovengrens van app.claim_one_time_use is EMAIL_CHANGE_TTL_SECONDS, en auth_service mag de functie aanroepen', async () => {
    const key = `int-test:${randomUUID()}`;
    const claim = (ttl: number) =>
      t.authDb.query<{ claimed: boolean }>('select app.claim_one_time_use($1, $2) as claimed', [key, ttl]);

    expect((await claim(EMAIL_CHANGE_TTL_SECONDS)).rows[0]?.claimed).toBe(true);
    await expect(claim(EMAIL_CHANGE_TTL_SECONDS + 1)).rejects.toMatchObject({ code: '22023' });
  });
});

// Elke eigenschap `token`, op elke diepte.
function hasToken(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasToken);
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(([key, inner]) => key === 'token' || hasToken(inner));
}

async function body(response: Response): Promise<unknown> {
  return JSON.parse(await response.text());
}

describe('AC-8: geen sessietoken in JSON van /api/auth/*', () => {
  test('inloggen zonder TOTP, get-session en change-password: geen token, en de cookie werkt', async () => {
    const { email } = await t.account('user');
    const browser = new Browser(t.app);

    const signIn = await browser.post('/api/auth/sign-in/email', { email, password: PASSWORD });
    const session = await browser.get('/api/auth/get-session');
    const sessionBody = await body(session);
    const change = await browser.post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      revokeOtherSessions: true,
    });

    expect([signIn.status, session.status, change.status]).toStrictEqual([200, 200, 200]);
    expect(z.object({ session: z.object({ userId: z.string() }) }).safeParse(sessionBody).success).toBe(true);
    expect([hasToken(await body(signIn)), hasToken(sessionBody), hasToken(await body(change))]).toStrictEqual([
      false,
      false,
      false,
    ]);
    expect((await browser.get('/api/me')).status).toBe(200);
  });

  test('inloggen met TOTP: geen token in beide stappen, en de cookie werkt', async () => {
    const { browser: first, email } = await t.account('admin');
    const { uri } = await enrol(first);
    const browser = new Browser(t.app);

    const signIn = await browser.post('/api/auth/sign-in/email', { email, password: PASSWORD });
    const verify = await verifyTotp(browser, freshTotp(uri));

    expect([signIn.status, verify.status]).toStrictEqual([200, 200]);
    expect([hasToken(await body(signIn)), hasToken(await body(verify))]).toStrictEqual([false, false]);
    expect((await browser.get('/api/me')).status).toBe(200);
  });
});
