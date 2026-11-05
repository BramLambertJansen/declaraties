import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { rateLimitCategory } from '../../shared/contract.ts';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS } from '../../shared/limits.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { RateLimit, Tx, WithUser, WithUserOptions } from '../db/types.ts';
import { AppError } from '../errors.ts';
import { defineContract, defineRoute, errors, fakeDeps, notesContract } from '../route/fixture.test-helper.ts';
import { createApp } from './create-app.ts';
import { parseErrorBody } from './error-body.test-helper.ts';
import { request } from './request.test-helper.ts';

// Rate limit van app-routes (spec rate-limit): categorie per contract, grenzen naar withUser, telling vóór de validatie,
// Retry-After bij RATE_LIMITED. De telling zelf (database) staat in db/tests/rate_limits.sql en test/api/rate-limit.int.test.ts.
const user = { role: 'user', sessionStrength: 'password' } as const;
const notes = defineRoute(notesContract, ({ input }) => ({ id: input.id, by: 'x' }));
const create = defineRoute(
  defineContract({
    method: 'POST',
    path: '/notes',
    input: z.object({ t: z.string() }).strict(),
    output: z.null(),
    permission: 'notes:read',
  }),
  () => null,
);
const mail = defineRoute(
  defineContract({
    method: 'POST',
    path: '/notes/mail',
    input: z.object({}).strict(),
    output: z.null(),
    permission: 'notes:read',
    rateLimit: 'duur',
  }),
  () => null,
);
const post = (body: string): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
  body,
});

// Een withUser die de opties bijhoudt en, als `blocked` gezet is, RATE_LIMITED gooit zoals de echte telling.
function recording(blocked?: number) {
  const seen: WithUserOptions[] = [];
  const base = fakeDeps(user);
  const tx = unsafeCast<Tx>({}, 'test: de routes in deze tests gebruiken tx niet');
  const withUser: WithUser = async (_actor, work, options) => {
    seen.push(options);
    if (blocked !== undefined) throw new AppError('RATE_LIMITED', { retryAfter: blocked });
    return work(tx, { role: 'user' });
  };
  return { auth: base.auth, withUser, seen };
}

function appWith(deps: ReturnType<typeof recording>, limits?: Parameters<typeof createApp>[0]['rateLimits']) {
  return createApp({
    appOrigin: 'http://localhost:5173',
    auth: deps.auth,
    withUser: deps.withUser,
    routes: [notes, create, mail],
    errors,
    ...(limits === undefined ? {} : { rateLimits: limits }),
  });
}

describe('rate limit: categorie per contract', () => {
  test('zonder veld: GET → lezen, elke andere methode → schrijven; een gekozen categorie wint', () => {
    expect(rateLimitCategory({ method: 'GET' })).toBe('lezen');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      expect(rateLimitCategory({ method })).toBe('schrijven');
    }
    expect(rateLimitCategory({ method: 'POST', rateLimit: 'duur' })).toBe('duur');
    expect(rateLimitCategory({ method: 'GET', rateLimit: 'schrijven' })).toBe('schrijven');
  });

  test('createApp geeft per route bucket, venster en maximum aan withUser; standaard de harde grens uit core', async () => {
    const deps = recording();
    const app = appWith(deps);
    await request(app, '/api/notes/n1');
    await request(app, '/api/notes', post('{"t":"x"}'));
    await request(app, '/api/notes/mail', post('{}'));

    const limits: (RateLimit | undefined)[] = deps.seen.map((options) => options.rateLimit);
    expect(limits).toStrictEqual([
      { bucket: 'lezen', windowSeconds: RATE_LIMIT_WINDOW_SECONDS, max: RATE_LIMIT_MAX.lezen },
      { bucket: 'schrijven', windowSeconds: RATE_LIMIT_WINDOW_SECONDS, max: RATE_LIMIT_MAX.schrijven },
      { bucket: 'duur', windowSeconds: RATE_LIMIT_WINDOW_SECONDS, max: RATE_LIMIT_MAX.duur },
    ]);
    expect(deps.seen.map((options) => options.readOnly)).toStrictEqual([true, false, false]);
  });

  test('een lagere grens van de app gaat door; een hogere, 0 of een breuk weigert createApp bij opstart', async () => {
    const deps = recording();
    await request(appWith(deps, { lezen: 3, schrijven: 2, duur: 1 }), '/api/notes/n1');
    expect(deps.seen[0]?.rateLimit?.max).toBe(3);

    const above = { ...RATE_LIMIT_MAX, schrijven: RATE_LIMIT_MAX.schrijven + 1 };
    expect(() => appWith(recording(), above)).toThrow('rate limit schrijven');
    expect(() => appWith(recording(), { ...RATE_LIMIT_MAX, duur: 0 })).toThrow('rate limit duur');
    expect(() => appWith(recording(), { ...RATE_LIMIT_MAX, lezen: 2.5 })).toThrow('rate limit lezen');
  });
});

describe('rate limit: telling vóór de validatie (spec rate-limit/AC-4)', () => {
  test.each([
    ['ongeldige JSON', '{kapot'],
    ['een onbekend veld', '{"t":"x","extra":1}'],
    ['een array als body', '[]'],
  ])('%s: 400 VALIDATION, maar withUser (en dus de telling) liep wel', async (_, body) => {
    const deps = recording();
    const response = await request(appWith(deps), '/api/notes', post(body));

    expect([response.status, parseErrorBody(await response.json()).code]).toStrictEqual([400, 'VALIDATION']);
    expect(deps.seen).toHaveLength(1);
  });

  test('een ongeldige query in een GET telt ook', async () => {
    const deps = recording();
    const response = await request(appWith(deps), '/api/notes/n1?extra=1');

    expect(response.status).toBe(400);
    expect(deps.seen).toHaveLength(1);
  });

  test('zonder sessie: 401 vóór de telling', async () => {
    const deps = { ...recording(), auth: fakeDeps(null).auth };
    const response = await request(appWith(deps), '/api/notes', post('{"t":"x"}'));

    expect(response.status).toBe(401);
    expect(deps.seen).toHaveLength(0);
  });
});

describe('rate limit: RATE_LIMITED naar buiten (spec rate-limit/AC-1)', () => {
  test('429 met alleen { code, requestId } en Retry-After in seconden', async () => {
    const response = await request(appWith(recording(17)), '/api/notes', post('{"t":"x"}'));

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('17');
    expect(parseErrorBody(await response.json()).code).toBe('RATE_LIMITED');
  });

  test('andere fouten krijgen geen Retry-After', async () => {
    const response = await request(appWith(recording()), '/api/notes', post('{kapot'));

    expect(response.status).toBe(400);
    expect(response.headers.get('retry-after')).toBeNull();
  });
});
