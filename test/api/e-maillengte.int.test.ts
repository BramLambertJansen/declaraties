import { afterAll, describe, expect, test } from 'vitest';
import { inviteUser } from '../../src/core/api/auth/index.ts';
import { MAX_EMAIL_LENGTH } from '../../src/core/shared/limits.ts';
import { Browser } from '../auth/harness.ts';
import { countMails, createAccountTestApp, json, mailCountNow, waitForMail } from './account-harness.ts';

// Spec e-maillengte: /change-email weigert een nieuw adres boven MAX_EMAIL_LENGTH, na de sessie-eisen en vóór het
// bezet-adres-antwoord. Echte database, Better Auth en Mailpit (`pnpm test:db`).
const t = createAccountTestApp();
afterAll(async () => {
  await t.close();
});

const SUBJECT_OLD = 'Bevestig de wijziging van je e-mailadres';
const SUBJECT_TAKEN = 'Je e-mailadres is niet gewijzigd';

// Geldig volgens RFC 5321 op elk onderdeel (lokaal deel 64, labels ≤ 63), zodat alleen de totale lengte de grens raakt.
let counter = 0;
function emailOfLength(length: number): string {
  counter += 1;
  const local = `lang-${String(Date.now())}-${String(counter)}-`.padEnd(64, 'a');
  const prefix = `${local}@${'b'.repeat(63)}.${'c'.repeat(63)}.`;
  const suffix = '.test';
  return `${prefix}${'d'.repeat(length - prefix.length - suffix.length)}${suffix}`;
}

async function requestChange(browser: Browser, newEmail: string): Promise<Response> {
  return t.call(browser, 'POST /api/auth/change-email', { newEmail });
}

describe('POST /api/auth/change-email: maximale lengte van het nieuwe adres', () => {
  test('de testadressen hebben precies de bedoelde lengte', () => {
    expect(emailOfLength(MAX_EMAIL_LENGTH)).toHaveLength(254);
    expect(emailOfLength(MAX_EMAIL_LENGTH + 1)).toHaveLength(255);
  });

  test('e-maillengte/AC-1: 255 tekens: 400 VALIDATION, geen mail en het adres blijft gelijk', async () => {
    const { browser, email } = await t.account('user');
    const tooLong = emailOfLength(MAX_EMAIL_LENGTH + 1);
    const before = await mailCountNow(email);

    const response = await requestChange(browser, tooLong);

    expect([response.status, await json(response)]).toMatchObject([400, { code: 'VALIDATION' }]);
    expect(await countMails(email)).toBe(before);
    expect(await countMails(tooLong)).toBe(0);
    expect(await json(await browser.get('/api/me'))).toMatchObject({ email });
  });

  test('e-maillengte/AC-2: precies 254 tekens: 200 en de bevestigingsmail naar het oude adres', async () => {
    const { browser, email } = await t.account('user');
    const longest = emailOfLength(MAX_EMAIL_LENGTH);

    const response = await requestChange(browser, longest);

    expect([response.status, await json(response)]).toStrictEqual([200, { status: true }]);
    expect((await waitForMail(email, SUBJECT_OLD)).text).toContain(longest);
  });

  test('e-maillengte/AC-3: een te lang adres dat al bezet is: 400 VALIDATION en geen neutrale mail', async () => {
    const { browser, email } = await t.account('user');
    const taken = emailOfLength(MAX_EMAIL_LENGTH + 1);
    await inviteUser(t.auth, { name: 'Ander', email: taken });
    const before = await mailCountNow(email);

    const response = await requestChange(browser, taken);

    expect([response.status, await json(response)]).toMatchObject([400, { code: 'VALIDATION' }]);
    expect(await countMails(email, SUBJECT_TAKEN)).toBe(0);
    expect(await mailCountNow(email)).toBe(before);
  });

  test('e-maillengte/AC-4: een sessie die niet vers is gaat voor de lengte: 403 SESSION_NOT_FRESH', async () => {
    const { browser, userId } = await t.account('user');
    const [session] = await t.sessionsOf(userId);
    await t.ageSession(session?.token ?? '', 11 * 60);

    const response = await requestChange(browser, emailOfLength(MAX_EMAIL_LENGTH + 1));

    expect([response.status, await json(response)]).toMatchObject([403, { code: 'SESSION_NOT_FRESH' }]);
  });

  test('e-maillengte/AC-4: TOTP met een password-sessie gaat voor de lengte: 403 MFA_REQUIRED', async () => {
    const { browser, userId } = await t.account('user');
    await t.enableTotp(browser);
    await t.authDb.query(`update session set session_strength = 'password' where "userId" = $1`, [userId]);

    const response = await requestChange(browser, emailOfLength(MAX_EMAIL_LENGTH + 1));

    expect([response.status, await json(response)]).toMatchObject([403, { code: 'MFA_REQUIRED' }]);
  });

  test('e-maillengte/AC-4: zonder sessie gaat 401 voor de lengte', async () => {
    const response = await requestChange(new Browser(t.app), emailOfLength(MAX_EMAIL_LENGTH + 1));

    expect(response.status).toBe(401);
  });
});
