import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import { AppError } from '../errors.ts';
import { createApp } from '../http/create-app.ts';
import { parseErrorBody } from '../http/error-body.test-helper.ts';
import { request } from '../http/request.test-helper.ts';
import { appWith, defineContract, defineRoute, notesContract } from './fixture.test-helper.ts';
import type { RouteDef } from './kit.ts';

// De pipeline van een route (framework §6, ADR 0040): sessie → input → withUser (rol, can, handler, output).
const notes = defineRoute(notesContract, ({ input, actor }) => ({ id: input.id, by: actor.name }));
const user = { role: 'user', sessionStrength: 'password' } as const;

async function codeOf(response: Response): Promise<string> {
  return parseErrorBody(await response.json()).code;
}

describe('defineRoute en createApp', () => {
  test('ingelogd met de juiste rol: output volgens het contract, read-only voor GET, cookie doorgegeven', async () => {
    const { app, deps } = appWith(user, [notes]);
    const response = await request(app, '/api/notes/n1?q=x');

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ id: 'n1', by: 'Test' });
    expect(deps.calls).toStrictEqual([{ readOnly: true }]);
    expect(response.headers.getSetCookie()).toStrictEqual([
      '__Host-auth.session_token=vernieuwd; Path=/; Secure; HttpOnly',
    ]);
  });

  test.each([
    ['niet ingelogd', null, 401, 'UNAUTHENTICATED'],
    ['geen rol in user_roles', { role: null, sessionStrength: 'password' }, 403, 'FORBIDDEN'],
    ['admin zonder MFA', { role: 'admin', sessionStrength: 'password' }, 403, 'MFA_REQUIRED'],
  ] as const)('%s: %i %s', async (_, actor, status, code) => {
    const response = await request(appWith(actor, [notes]).app, '/api/notes/n1');

    expect(response.status).toBe(status);
    expect(await codeOf(response)).toBe(code);
  });

  test('een rol zonder de permissie: FORBIDDEN', async () => {
    const adminOnly = defineRoute(
      defineContract({
        method: 'GET',
        path: '/beheer',
        input: z.object({}).strict(),
        output: z.null(),
        permission: 'notes:admin',
      }),
      () => null,
    );

    const response = await request(appWith(user, [adminOnly]).app, '/api/beheer');
    expect([response.status, await codeOf(response)]).toStrictEqual([403, 'FORBIDDEN']);
  });

  test('een onbekend veld in de input: 400 VALIDATION', async () => {
    const response = await request(appWith(user, [notes]).app, '/api/notes/n1?extra=1');

    expect([response.status, await codeOf(response)]).toStrictEqual([400, 'VALIDATION']);
  });

  test('ongeldige JSON in een POST: 400 VALIDATION', async () => {
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
    const response = await request(appWith(user, [create]).app, '/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: '{kapot',
    });

    expect([response.status, await codeOf(response)]).toStrictEqual([400, 'VALIDATION']);
  });

  test('een output die niet bij het contract past, lekt niet: 500 INTERNAL_ERROR', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const leaky = defineRoute(notesContract, () => {
      // Een handler die per ongeluk een extra veld meegeeft (bijv. een hash uit de database).
      const row = { id: 'n1', by: 'x', wachtwoordhash: 'geheim' };
      return row;
    });
    const response = await request(appWith(user, [leaky]).app, '/api/notes/n1');

    expect([response.status, await codeOf(response)]).toStrictEqual([500, 'INTERNAL_ERROR']);
    error.mockRestore();
  });

  test('een geregistreerde AppError gaat naar buiten (409), een onbekende code wordt INTERNAL_ERROR', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const locked = defineRoute(notesContract, () => {
      throw new AppError('NOTE_LOCKED');
    });
    const unknown = defineRoute(
      defineContract({
        method: 'GET',
        path: '/x',
        input: z.object({}).strict(),
        output: z.null(),
        permission: 'notes:read',
      }),
      () => {
        throw new AppError('NIET_GEREGISTREERD');
      },
    );
    const { app } = appWith(user, [locked, unknown]);

    const first = await request(app, '/api/notes/n1');
    const second = await request(app, '/api/x');
    expect([first.status, await codeOf(first)]).toStrictEqual([409, 'NOTE_LOCKED']);
    expect([second.status, await codeOf(second)]).toStrictEqual([500, 'INTERNAL_ERROR']);
    error.mockRestore();
  });

  // ADR 0047 (OV-1): een gegenereerde handler gooit NOT_IMPLEMENTED; pas na sessie, input, rol en permissie.
  test('een handler met NOT_IMPLEMENTED geeft 501 aan wie het recht heeft, 403 aan wie het niet heeft', async () => {
    const todo = defineRoute(notesContract, () => {
      throw new AppError('NOT_IMPLEMENTED');
    });

    const allowed = await request(appWith(user, [todo]).app, '/api/notes/n1');
    const denied = await request(appWith({ ...user, role: null }, [todo]).app, '/api/notes/n1');
    expect([allowed.status, await codeOf(allowed)]).toStrictEqual([501, 'NOT_IMPLEMENTED']);
    expect([denied.status, await codeOf(denied)]).toStrictEqual([403, 'FORBIDDEN']);
  });

  test('createApp weigert een route die niet uit defineRoute komt', () => {
    const fake = unsafeCast<RouteDef>(
      { contract: notesContract, check: () => ({ ok: true }), handler: () => ({}) },
      'test: bewust een route buiten defineRoute om',
    );
    expect(() => createApp({ routes: [fake] })).toThrow('alleen routes uit defineRoute');
  });

  test('defineContract eist .strict() input, een pad zonder /api en een bestaande permissie', () => {
    const base = { method: 'GET', output: z.null() } as const;
    expect(() => defineContract({ ...base, path: '/a', input: z.object({}), permission: 'notes:read' })).toThrow(
      '.strict()',
    );
    expect(() =>
      defineContract({ ...base, path: '/api/a', input: z.object({}).strict(), permission: 'notes:read' }),
    ).toThrow('zonder /api');
  });
});
