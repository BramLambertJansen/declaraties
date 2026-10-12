import { afterAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { inviteUser } from '../../src/core/api/auth/index.ts';
import { Browser, uniqueEmail } from '../auth/harness.ts';
import {
  confirmTokenFrom,
  countMails,
  createAccountTestApp,
  json,
  mailsTo,
  NEW_PASSWORD,
  PASSWORD,
  waitForMail,
} from './account-harness.ts';

// Spec eigen-account, deel 2: sessies (AC-6, AC-7), e-mailadres wijzigen (AC-8 t/m AC-11) en de dichte paden en hooks die
// deel 1 nog niet dekt (AC-13, AC-14 voor /change-email). Echte database, Better Auth en Mailpit (`pnpm test:db`).
const t = createAccountTestApp();
afterAll(async () => {
  await t.close();
});

const SUBJECT_OLD = 'Bevestig de wijziging van je e-mailadres';
const SUBJECT_NEW = 'Bevestig je nieuwe e-mailadres';
const SUBJECT_TAKEN = 'Je e-mailadres is niet gewijzigd';
const SUBJECT_CHANGED = 'Je e-mailadres is gewijzigd';
const FIREFOX_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
const DAY = 24 * 60 * 60;

const sessionList = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      apparaat: z.string(),
      aangemaakt: z.string(),
      laatstActief: z.string(),
      huidig: z.boolean(),
    }),
  ),
});

async function listSessions(browser: Browser) {
  const response = await t.call(browser, 'GET /api/me/sessions');
  expect(response.status).toBe(200);
  return sessionList.parse(await json(response)).items;
}

// ---------------------------------------------------------------------------------------------------------------------
// Sessies
// ---------------------------------------------------------------------------------------------------------------------
describe('GET /api/me/sessions', () => {
  test('AC-6: twee sessies: precies één is huidig; zonder tokens, IP of user-agent in het antwoord', async () => {
    const { browser, email, userId } = await t.account('user');
    await t.signIn(email);

    const response = await t.call(browser, 'GET /api/me/sessions');
    const raw = JSON.stringify(await json(response));
    const items = sessionList.parse(JSON.parse(raw)).items;

    expect(response.status).toBe(200);
    expect(items).toHaveLength(2);
    expect(items.filter((item) => item.huidig)).toHaveLength(1);
    for (const stored of await t.sessionsOf(userId)) expect(raw).not.toContain(stored.token);
    expect(raw).not.toMatch(/ipAddress|userAgent|token/i);
    for (const item of items) {
      expect(Number.isNaN(Date.parse(item.aangemaakt))).toBe(false);
      expect(Number.isNaN(Date.parse(item.laatstActief))).toBe(false);
    }
  });

  test('"huidig" is de sessie van de aanroeper: de andere browser ziet het omgekeerde', async () => {
    const { browser, email } = await t.account('user');
    const other = await t.signIn(email);

    const mine = await listSessions(browser);
    const theirs = await listSessions(other);

    expect(mine.find((item) => item.huidig)?.id).toBe(theirs.find((item) => !item.huidig)?.id);
    expect(mine.find((item) => !item.huidig)?.id).toBe(theirs.find((item) => item.huidig)?.id);
  });

  test('apparaat komt uit de user-agent ("Firefox op Windows"); zonder user-agent "Onbekend apparaat"', async () => {
    const { email } = await t.account('user');
    const firefox = new Browser(t.app);
    const signIn = await t.callWith(firefox, 'POST /api/auth/sign-in/email', {
      body: { email, password: PASSWORD },
      headers: { 'user-agent': FIREFOX_WINDOWS },
    });
    expect(signIn.status).toBe(200);
    const bare = await t.signIn(email);

    const devices = (await listSessions(bare)).map((item) => item.apparaat).sort();

    expect(devices).toStrictEqual(['Firefox op Windows', 'Onbekend apparaat', 'Onbekend apparaat']);
  });

  test('een sessie ouder dan 7 dagen staat niet in de lijst', async () => {
    const { browser, email, userId } = await t.account('user');
    await t.signIn(email);
    // De eerste sessie is die van `browser`; maak de tweede 8 dagen oud.
    const [, second] = await t.sessionsOf(userId);
    await t.ageSession(second?.token ?? '', 8 * DAY);

    const items = await listSessions(browser);

    expect(items).toHaveLength(1);
    expect(items[0]?.huidig).toBe(true);
  });

  test('anoniem: 401 UNAUTHENTICATED', async () => {
    const response = await t.call(new Browser(t.app), 'GET /api/me/sessions');

    expect([response.status, await json(response)]).toMatchObject([401, { code: 'UNAUTHENTICATED' }]);
  });

  test('admin zonder MFA: 403 MFA_REQUIRED', async () => {
    const { browser } = await t.account('admin');
    const response = await t.call(browser, 'GET /api/me/sessions');

    expect([response.status, await json(response)]).toMatchObject([403, { code: 'MFA_REQUIRED' }]);
  });
});

describe('DELETE /api/me/sessions/:id', () => {
  test('AC-6: een andere sessie beëindigen: weg uit de lijst en die browser krijgt 401; zelf nog ingelogd', async () => {
    const { browser, email } = await t.account('user');
    const other = await t.signIn(email);
    const target = (await listSessions(browser)).find((item) => !item.huidig);

    const response = await t.call(browser, `DELETE /api/me/sessions/${target?.id ?? ''}`);

    expect([response.status, await json(response)]).toStrictEqual([200, null]);
    expect((await other.get('/api/me')).status).toBe(401);
    expect((await browser.get('/api/me')).status).toBe(200);
    const items = await listSessions(browser);
    expect(items).toHaveLength(1);
    expect(items.map((item) => item.id)).not.toContain(target?.id);
  });

  test('de eigen sessie via DELETE: 400 VALIDATION en de sessie blijft werken', async () => {
    const { browser } = await t.account('user');
    const own = (await listSessions(browser)).find((item) => item.huidig);

    const response = await t.call(browser, `DELETE /api/me/sessions/${own?.id ?? ''}`);

    expect([response.status, await json(response)]).toMatchObject([400, { code: 'VALIDATION' }]);
    expect((await browser.get('/api/me')).status).toBe(200);
    expect(await listSessions(browser)).toHaveLength(1);
  });

  test('een sessie van een ander account: 404 NOT_FOUND, en die sessie blijft bestaan', async () => {
    const mine = await t.account('user');
    const theirs = await t.account('user');
    const foreign = (await listSessions(theirs.browser))[0];

    const response = await t.call(mine.browser, `DELETE /api/me/sessions/${foreign?.id ?? ''}`);

    expect([response.status, await json(response)]).toMatchObject([404, { code: 'NOT_FOUND' }]);
    expect((await theirs.browser.get('/api/me')).status).toBe(200);
    expect(await listSessions(theirs.browser)).toHaveLength(1);
  });

  test('een onbekend ID geeft hetzelfde antwoord als dat van een ander (geen enumeratie)', async () => {
    const mine = await t.account('user');
    const theirs = await t.account('user');
    const foreign = (await listSessions(theirs.browser))[0];

    const known = await t.call(mine.browser, `DELETE /api/me/sessions/${foreign?.id ?? ''}`);
    const unknown = await t.call(mine.browser, 'DELETE /api/me/sessions/bestaat-niet');

    expect(unknown.status).toBe(known.status);
    expect(await json(unknown)).toMatchObject({ code: 'NOT_FOUND' });
  });

  test('te lang ID: 400 VALIDATION', async () => {
    const { browser } = await t.account('user');
    const response = await t.call(browser, `DELETE /api/me/sessions/${'a'.repeat(201)}`);

    expect([response.status, await json(response)]).toMatchObject([400, { code: 'VALIDATION' }]);
  });

  test('anoniem: 401 UNAUTHENTICATED', async () => {
    const response = await t.call(new Browser(t.app), 'DELETE /api/me/sessions/x');

    expect([response.status, await json(response)]).toMatchObject([401, { code: 'UNAUTHENTICATED' }]);
  });

  test('admin zonder MFA: 403 MFA_REQUIRED', async () => {
    const { browser } = await t.account('admin');
    const response = await t.call(browser, 'DELETE /api/me/sessions/x');

    expect([response.status, await json(response)]).toMatchObject([403, { code: 'MFA_REQUIRED' }]);
  });
});

describe('POST /api/me/sessions/revoke-others', () => {
  test('AC-7: drie sessies: alleen de eigen blijft; de andere twee krijgen 401', async () => {
    const { browser, email } = await t.account('user');
    const second = await t.signIn(email);
    const third = await t.signIn(email);

    const response = await t.call(browser, 'POST /api/me/sessions/revoke-others', {});

    expect([response.status, await json(response)]).toStrictEqual([200, null]);
    expect((await second.get('/api/me')).status).toBe(401);
    expect((await third.get('/api/me')).status).toBe(401);
    expect((await browser.get('/api/me')).status).toBe(200);
    const items = await listSessions(browser);
    expect(items).toHaveLength(1);
    expect(items[0]?.huidig).toBe(true);
  });

  test('raakt de sessies van andere accounts niet', async () => {
    const mine = await t.account('user');
    const theirs = await t.account('user');

    await t.call(mine.browser, 'POST /api/me/sessions/revoke-others', {});

    expect((await theirs.browser.get('/api/me')).status).toBe(200);
  });

  test('met een onbekend veld in de body: 400 VALIDATION (strict)', async () => {
    const { browser } = await t.account('user');
    const response = await t.call(browser, 'POST /api/me/sessions/revoke-others', { userId: 'ander' });

    expect([response.status, await json(response)]).toMatchObject([400, { code: 'VALIDATION' }]);
  });

  test('anoniem: 401 UNAUTHENTICATED', async () => {
    const response = await t.call(new Browser(t.app), 'POST /api/me/sessions/revoke-others', {});

    expect([response.status, await json(response)]).toMatchObject([401, { code: 'UNAUTHENTICATED' }]);
  });

  test('admin zonder MFA: 403 MFA_REQUIRED en de andere sessies blijven', async () => {
    const { browser, email } = await t.account('admin');
    const other = await t.signIn(email);
    const response = await t.call(browser, 'POST /api/me/sessions/revoke-others', {});

    expect([response.status, await json(response)]).toMatchObject([403, { code: 'MFA_REQUIRED' }]);
    expect((await other.get('/api/me')).status).not.toBe(401);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// E-mailadres wijzigen
// ---------------------------------------------------------------------------------------------------------------------
async function requestChange(browser: Browser, newEmail: string): Promise<Response> {
  return t.call(browser, 'POST /api/auth/change-email', { newEmail });
}

async function confirm(browser: Browser, token: string): Promise<Response> {
  return t.call(browser, 'POST /api/me/email/bevestigen', { token });
}

describe('POST /api/auth/change-email en /api/me/email/bevestigen', () => {
  test('AC-8: beide links bevestigen; nieuw adres actief, oud adres dicht, andere sessie weg, melding bij het oude adres', async () => {
    const { browser, email } = await t.account('user');
    const other = await t.signIn(email);
    const nieuw = uniqueEmail('nieuw');

    const request = await requestChange(browser, nieuw);
    expect([request.status, await json(request)]).toStrictEqual([200, { status: true }]);
    const first = await waitForMail(email, SUBJECT_OLD);
    expect(first.text).toContain(nieuw);
    expect(first.text).toContain('Wijziging bevestigen');
    expect(await countMails(nieuw)).toBe(0);

    const step1 = await confirm(browser, confirmTokenFrom(first.text));
    expect([step1.status, await json(step1)]).toStrictEqual([200, { stap: 'oud' }]);
    const second = await waitForMail(nieuw, SUBJECT_NEW);
    expect(second.text).toContain('E-mailadres bevestigen');
    expect(await json(await browser.get('/api/me'))).toMatchObject({ email });

    const step2 = await confirm(browser, confirmTokenFrom(second.text));
    expect([step2.status, await json(step2)]).toStrictEqual([200, { stap: 'nieuw' }]);

    expect(await json(await browser.get('/api/me'))).toMatchObject({ email: nieuw });
    await expect(t.signIn(nieuw)).resolves.toBeInstanceOf(Browser);
    await expect(t.signIn(email)).rejects.toThrow();
    expect((await other.get('/api/me')).status).toBe(401);
    expect((await browser.get('/api/me')).status).toBe(200);
    const notice = await waitForMail(email, SUBJECT_CHANGED);
    expect(notice.text).toContain(nieuw);
    expect(notice.text).toContain('Je andere sessies zijn beëindigd');
  });

  test('na stap 2 is het adres geverifieerd (emailVerified)', async () => {
    const { browser, email, userId } = await t.account('user');
    const nieuw = uniqueEmail('nieuw');
    await requestChange(browser, nieuw);
    const first = await waitForMail(email, SUBJECT_OLD);
    await confirm(browser, confirmTokenFrom(first.text));
    const second = await waitForMail(nieuw, SUBJECT_NEW);
    await confirm(browser, confirmTokenFrom(second.text));

    const { rows } = await t.authDb.query<{ email: string; emailVerified: boolean }>(
      'select email, "emailVerified" from "user" where id = $1',
      [userId],
    );
    expect(rows[0]).toStrictEqual({ email: nieuw, emailVerified: true });
  });

  test('AC-9: een bezet adres: zelfde antwoord als bij een vrij adres, het bezette adres krijgt niets, het oude de neutrale mail', async () => {
    const { browser, email } = await t.account('user');
    const owner = await t.account('user');
    const before = await countMails(owner.email);
    const free = await requestChange((await t.account('user')).browser, uniqueEmail('vrij'));

    const response = await requestChange(browser, owner.email);

    expect([response.status, await json(response)]).toStrictEqual([free.status, await json(free)]);
    const notice = await waitForMail(email, SUBJECT_TAKEN);
    expect(notice.text).toContain(owner.email);
    expect(notice.text).toContain('Er is niets gewijzigd');
    expect((await mailsTo(email)).map((mail) => mail.subject)).not.toContain(SUBJECT_OLD);
    expect(await countMails(owner.email)).toBe(before);
    expect(await json(await browser.get('/api/me'))).toMatchObject({ email });
  });

  test('een bezet adres met andere hoofdletters telt ook als bezet', async () => {
    const { browser, email } = await t.account('user');
    const owner = await t.account('user');

    const response = await requestChange(browser, owner.email.toUpperCase());

    expect([response.status, await json(response)]).toStrictEqual([200, { status: true }]);
    await waitForMail(email, SUBJECT_TAKEN);
  });

  test('AC-10: een sessie ouder dan 10 minuten: 403 SESSION_NOT_FRESH en er gaat geen mail uit', async () => {
    const { browser, email, userId } = await t.account('user');
    const [session] = await t.sessionsOf(userId);
    await t.ageSession(session?.token ?? '', 11 * 60);
    const before = await countMails(email);

    const response = await requestChange(browser, uniqueEmail('nieuw'));

    expect([response.status, await json(response)]).toMatchObject([403, { code: 'SESSION_NOT_FRESH' }]);
    expect(await countMails(email)).toBe(before);
  });

  test('een sessie van 9 minuten is nog vers', async () => {
    const { browser, userId } = await t.account('user');
    const [session] = await t.sessionsOf(userId);
    await t.ageSession(session?.token ?? '', 9 * 60);

    const response = await requestChange(browser, uniqueEmail('nieuw'));

    expect(response.status).toBe(200);
  });

  test('AC-14: gebruiker met TOTP en een password-sessie: 403 MFA_REQUIRED, geen mail', async () => {
    const { browser, email, userId } = await t.account('user');
    await t.enableTotp(browser);
    await t.authDb.query(`update session set session_strength = 'password' where "userId" = $1`, [userId]);
    const before = await countMails(email);

    const response = await requestChange(browser, uniqueEmail('nieuw'));

    expect([response.status, await json(response)]).toMatchObject([403, { code: 'MFA_REQUIRED' }]);
    expect(await countMails(email)).toBe(before);
  });

  test('niet ingelogd: 401 en geen mail', async () => {
    const { email } = await t.account('user');
    const before = await countMails(email);

    const response = await requestChange(new Browser(t.app), uniqueEmail('nieuw'));

    expect(response.status).toBe(401);
    expect(await countMails(email)).toBe(before);
  });

  test.each([
    ['geen e-mailadres', 'geen-adres'],
    ['leeg', ''],
  ])('ongeldig nieuw adres (%s): 400 en geen mail', async (_, newEmail) => {
    const { browser, email } = await t.account('user');
    const before = await countMails(email);

    const response = await requestChange(browser, newEmail);

    expect(response.status).toBe(400);
    expect(await countMails(email)).toBe(before);
  });

  test('hetzelfde adres (ook met andere hoofdletters): 400 en geen mail', async () => {
    const { browser, email } = await t.account('user');
    const before = await countMails(email);

    const response = await requestChange(browser, email.toUpperCase());

    expect(response.status).toBe(400);
    expect(await countMails(email)).toBe(before);
  });

  test('AC-11: anoniem met een geldige link: 401 UNAUTHENTICATED en er verandert niets', async () => {
    const { browser, email } = await t.account('user');
    await requestChange(browser, uniqueEmail('nieuw'));
    const token = confirmTokenFrom((await waitForMail(email, SUBJECT_OLD)).text);

    const response = await confirm(new Browser(t.app), token);

    expect([response.status, await json(response)]).toMatchObject([401, { code: 'UNAUTHENTICATED' }]);
    expect(await json(await browser.get('/api/me'))).toMatchObject({ email });
  });

  test('AC-11: een andere ingelogde gebruiker met de link van een ander: 409 EMAIL_LINK_INVALID, niets verandert', async () => {
    const owner = await t.account('user');
    const intruder = await t.account('user');
    const nieuw = uniqueEmail('nieuw');
    await requestChange(owner.browser, nieuw);
    const token = confirmTokenFrom((await waitForMail(owner.email, SUBJECT_OLD)).text);

    const response = await confirm(intruder.browser, token);

    expect([response.status, await json(response)]).toMatchObject([409, { code: 'EMAIL_LINK_INVALID' }]);
    expect(await countMails(nieuw)).toBe(0);
    expect(await json(await owner.browser.get('/api/me'))).toMatchObject({ email: owner.email });
    expect(await json(await intruder.browser.get('/api/me'))).toMatchObject({ email: intruder.email });
  });

  test('een vervalst of onbekend token: 409 EMAIL_LINK_INVALID', async () => {
    const { browser } = await t.account('user');
    const response = await confirm(browser, 'dit.is.geen.token');

    expect([response.status, await json(response)]).toMatchObject([409, { code: 'EMAIL_LINK_INVALID' }]);
  });

  test.each([
    ['leeg token', { token: '' }],
    ['te lang token', { token: 'a'.repeat(2001) }],
    ['zonder token', {}],
    ['onbekend veld', { token: 'x', userId: 'ander' }],
  ])('ongeldige invoer (%s): 400 VALIDATION', async (_, body) => {
    const { browser } = await t.account('user');
    const response = await t.call(browser, 'POST /api/me/email/bevestigen', body);

    expect([response.status, await json(response)]).toMatchObject([400, { code: 'VALIDATION' }]);
  });

  test('anoniem: 401; admin zonder MFA: 403 MFA_REQUIRED', async () => {
    const anonymous = await confirm(new Browser(t.app), 'x');
    const { browser } = await t.account('admin');
    const admin = await confirm(browser, 'x');

    expect([anonymous.status, await json(anonymous)]).toMatchObject([401, { code: 'UNAUTHENTICATED' }]);
    expect([admin.status, await json(admin)]).toMatchObject([403, { code: 'MFA_REQUIRED' }]);
  });

  test('het adres wordt tussen aanvraag en bevestiging door bezet: stap 2 geeft 409 EMAIL_LINK_INVALID en niets verandert', async () => {
    const { browser, email } = await t.account('user');
    const other = await t.signIn(email);
    const nieuw = uniqueEmail('nieuw');
    await requestChange(browser, nieuw);
    await confirm(browser, confirmTokenFrom((await waitForMail(email, SUBJECT_OLD)).text));
    const second = confirmTokenFrom((await waitForMail(nieuw, SUBJECT_NEW)).text);
    await inviteUser(t.auth, { name: 'Ander', email: nieuw });

    const response = await confirm(browser, second);

    expect([response.status, await json(response)]).toMatchObject([409, { code: 'EMAIL_LINK_INVALID' }]);
    expect(await json(await browser.get('/api/me'))).toMatchObject({ email });
    expect((await other.get('/api/me')).status).toBe(200);
    expect(await countMails(email, SUBJECT_CHANGED)).toBe(0);
  });

  test('link 1 nogmaals geopend binnen de geldigheid: mail 2 gaat opnieuw weg', async () => {
    const { browser, email } = await t.account('user');
    const nieuw = uniqueEmail('nieuw');
    await requestChange(browser, nieuw);
    const token = confirmTokenFrom((await waitForMail(email, SUBJECT_OLD)).text);

    const once = await confirm(browser, token);
    const twice = await confirm(browser, token);

    expect([await json(once), await json(twice)]).toStrictEqual([{ stap: 'oud' }, { stap: 'oud' }]);
    expect(await countMails(nieuw, SUBJECT_NEW)).toBe(2);
  });

  test('link 2 werkt na gebruik niet meer: 409 EMAIL_LINK_INVALID', async () => {
    const { browser, email } = await t.account('user');
    const nieuw = uniqueEmail('nieuw');
    await requestChange(browser, nieuw);
    await confirm(browser, confirmTokenFrom((await waitForMail(email, SUBJECT_OLD)).text));
    const token = confirmTokenFrom((await waitForMail(nieuw, SUBJECT_NEW)).text);
    expect((await confirm(browser, token)).status).toBe(200);

    const again = await confirm(browser, token);

    expect([again.status, await json(again)]).toMatchObject([409, { code: 'EMAIL_LINK_INVALID' }]);
    expect(await json(await browser.get('/api/me'))).toMatchObject({ email: nieuw });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Dichte paden en hooks die deel 1 nog niet dekt (AC-13). In deel 1 gaan list-sessions e.d. alleen met POST; Better Auth
// kent list-sessions als GET, en een methode die niet past geeft sowieso 404. Hier dus ook de echte methode.
// ---------------------------------------------------------------------------------------------------------------------
describe('dichte paden (AC-13), echte methode en met sessie', () => {
  test('GET /api/auth/list-sessions met een sessie: 404 (geen tokens naar de browser)', async () => {
    const { browser } = await t.account('user');
    const response = await browser.get('/api/auth/list-sessions');

    expect(response.status).toBe(404);
    expect(JSON.stringify(await json(response).catch(() => null))).not.toMatch(/token/i);
  });

  test('GET /api/auth/list-sessions anoniem: 404', async () => {
    expect((await new Browser(t.app).get('/api/auth/list-sessions')).status).toBe(404);
  });

  test('GET /api/auth/verify-email met een sessie en een echt token: 404 en het adres blijft', async () => {
    const { browser, email } = await t.account('user');
    await requestChange(browser, uniqueEmail('nieuw'));
    const token = confirmTokenFrom((await waitForMail(email, SUBJECT_OLD)).text);

    const response = await browser.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);

    expect(response.status).toBe(404);
    expect(await json(await browser.get('/api/me'))).toMatchObject({ email });
    expect(await countMails(email, SUBJECT_CHANGED)).toBe(0);
  });

  test('POST /api/auth/send-verification-email met een sessie: 404 en geen mail', async () => {
    const { browser, email } = await t.account('user');
    const before = await countMails(email);

    const response = await browser.post('/api/auth/send-verification-email', { email });

    expect(response.status).toBe(404);
    expect(await countMails(email)).toBe(before);
  });

  test.each([
    ['POST', '/api/auth/delete-user'],
    ['POST', '/api/auth/update-user'],
    ['POST', '/api/auth/update-session'],
    ['POST', '/api/auth/revoke-session'],
  ])('%s %s anoniem: 404', async (method, path) => {
    const response = await t.call(new Browser(t.app), `${method} ${path}`, {});

    expect(response.status).toBe(404);
  });

  test('POST /api/auth/revoke-session met een echt sessietoken: 404 en de sessie blijft', async () => {
    const { browser, userId, email } = await t.account('user');
    const other = await t.signIn(email);
    const [, second] = await t.sessionsOf(userId);

    const response = await browser.post('/api/auth/revoke-session', { token: second?.token });

    expect(response.status).toBe(404);
    expect((await other.get('/api/me')).status).toBe(200);
  });
});

describe('change-password: regels die deel 1 nog niet dekt', () => {
  test('na een wachtwoordwijziging toont de lijst één sessie (huidig) en werkt de nieuwe sessie op /api/me/sessions', async () => {
    const { browser, email } = await t.account('user');
    await t.signIn(email);
    await browser.post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      revokeOtherSessions: true,
    });

    const items = await listSessions(browser);

    expect(items).toHaveLength(1);
    expect(items[0]?.huidig).toBe(true);
  });
});
