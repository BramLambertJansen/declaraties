import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z, ZodError } from 'zod';
import { defineAuditActions, type AuditAction, type AuditDetails } from '../../shared/audit.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { Tx, WithUser } from '../db/types.ts';
import { createApp } from '../http/create-app.ts';
import { parseErrorBody } from '../http/error-body.test-helper.ts';
import { request } from '../http/request.test-helper.ts';
import { defineContract, fakeDeps, permissions } from './fixture.test-helper.ts';
import { createRouteKit, type AuditFn } from './kit.ts';

// ctx.audit (spec audit-log AC-29, ADR 0021): getypt op de geregistreerde acties, runtime-controle op de actie en op details.
// Zonder database: tx.execute is een spy. Het effect in de database (geen regel bij een fout) staat in audit.int.test.ts.
const audit = defineAuditActions({
  'note.archive': { target: 'note', details: z.object({ reason: z.string() }) },
});
const { defineRoute } = createRouteKit({ permissions, audit });

type Archive = (action: string, targetId: string, details: object) => Promise<void>;

const contract = defineContract({
  method: 'POST',
  path: '/notes/archive',
  input: z.object({ case: z.string() }).strict(),
  output: z.object({ caught: z.string().nullable() }).strict(),
  permission: 'notes:read',
});

// De handler vangt de fout van ctx.audit zelf op, zodat de test het soort fout ziet; `loose` omzeilt de typecontrole.
const route = defineRoute(contract, async ({ input, audit: record }) => {
  const loose = unsafeCast<Archive>(
    record,
    'test: de runtime-controle op een niet-geregistreerde actie of foute details',
  );
  const calls: Record<string, () => Promise<void>> = {
    ok: () => record('note.archive', 'n1', { reason: 'dubbel' }),
    unknown: () => loose('note.onbekend', 'n1', {}),
    wrongType: () => loose('note.archive', 'n1', { reason: 1 }),
    missing: () => loose('note.archive', 'n1', {}),
    extra: () => loose('note.archive', 'n1', { reason: 'dubbel', extra: 'x' }),
  };
  try {
    await calls[input.case]?.();
    return { caught: null };
  } catch (error) {
    if (input.case === 'rethrow') throw error;
    return { caught: error instanceof ZodError ? 'ZodError' : error instanceof Error ? error.message : 'onbekend' };
  }
});

const rethrow = defineRoute(contract, async ({ audit: record }) => {
  const loose = unsafeCast<Archive>(record, 'test: een niet-geregistreerde actie');
  await loose('note.onbekend', 'n1', {});
  return { caught: null };
});

function setup() {
  const deps = fakeDeps({ role: 'user', sessionStrength: 'password' });
  const execute = vi.fn(() => Promise.resolve({ rows: [] }));
  const tx = unsafeCast<Tx>({ execute }, 'test: alleen execute wordt gebruikt');
  const withUser: WithUser = async (_actor, work) => work(tx, { role: 'user' });
  const app = createApp({ appOrigin: 'http://localhost:5173', auth: deps.auth, withUser, routes: [route] });
  const call = (name: string) =>
    request(app, '/api/notes/archive', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({ case: name }),
    });
  return { call, execute, app, withUser, deps };
}

describe('ctx.audit: types', () => {
  test('alleen geregistreerde acties compileren, met de z.input van hun details', () => {
    expectTypeOf<AuditAction<typeof audit>>().toEqualTypeOf<'note.archive'>();
    expectTypeOf<'note.onbekend'>().not.toExtend<AuditAction<typeof audit>>();
    expectTypeOf<AuditDetails<typeof audit, 'note.archive'>>().toEqualTypeOf<{ reason: string }>();
    expectTypeOf<Parameters<AuditFn<typeof audit>>[0]>().toEqualTypeOf<'note.archive'>();
    expectTypeOf<Parameters<AuditFn<typeof audit>>[1]>().toEqualTypeOf<string>();
  });
});

describe('ctx.audit: runtime', () => {
  test('een geregistreerde actie met geldige details gaat in één statement naar de eigen tx', async () => {
    const { call, execute } = setup();
    const response = await call('ok');

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ caught: null });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('een niet-geregistreerde actie gooit een Error met de actienaam, zonder database-aanroep', async () => {
    const { call, execute } = setup();
    const body = z.object({ caught: z.string() }).parse(await (await call('unknown')).json());

    expect(body.caught).toContain('note.onbekend');
    expect(body.caught).not.toBe('ZodError');
    expect(execute).not.toHaveBeenCalled();
  });

  test.each(['wrongType', 'missing', 'extra'])(
    'details %s gooit een ZodError, zonder database-aanroep',
    async (name) => {
      const { call, execute } = setup();

      expect(await (await call(name)).json()).toStrictEqual({ caught: 'ZodError' });
      expect(execute).not.toHaveBeenCalled();
    },
  );

  test('een fout van ctx.audit die de handler niet vangt: 500 INTERNAL_ERROR, geen details naar buiten', async () => {
    const { deps, withUser } = setup();
    const app = createApp({ appOrigin: 'http://localhost:5173', auth: deps.auth, withUser, routes: [rethrow] });
    const response = await request(app, '/api/notes/archive', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({ case: 'x' }),
    });
    const body = parseErrorBody(await response.json());

    expect([response.status, body.code]).toStrictEqual([500, 'INTERNAL_ERROR']);
    expect(JSON.stringify(body)).not.toContain('note.onbekend');
  });
});
