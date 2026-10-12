import { describe, expect, expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { defineAuditActions, type AuditAction, type AuditDetails } from '../../shared/audit.ts';
import { definePermissions } from '../../shared/can.ts';
import { createContracts } from '../../shared/contract.ts';
import { createRouteKit, isRouteDef, type RouteContext } from './kit.ts';

// De registratie van een app bereikt ctx.audit zonder src/core te wijzigen (spec audit-log AC-30). De database-kant
// (regel met actor en request_id, niets bij een fout) staat in test/audit/ctx-audit.int.test.ts: een bestand onder
// src/core mag process.env niet lezen (rails/process-env), dus de testkit met de echte database kan hier niet starten.
const audit = defineAuditActions({
  'note.archive': { target: 'note', details: z.object({ reason: z.string() }) },
});
const permissions = definePermissions({ 'notes:write': { roles: ['user', 'admin'] } });
const { defineContract } = createContracts(permissions);

describe('createRouteKit met de auditacties van een app', () => {
  test('ctx.audit is getypt op de acties die de app registreerde', () => {
    expectTypeOf<AuditAction<typeof audit>>().toEqualTypeOf<'note.archive'>();
    expectTypeOf<RouteContext<object, unknown, typeof audit>['audit']>().parameter(0).toEqualTypeOf<'note.archive'>();
  });

  test('de details van ctx.audit volgen de z.input van het schema van de registratie', () => {
    expectTypeOf<AuditDetails<typeof audit, 'note.archive'>>().toEqualTypeOf<{ reason: string }>();
  });

  test('een kit zonder app-acties kent geen enkele sleutel', () => {
    const none = defineAuditActions({});

    expect(Object.keys(none)).toStrictEqual([]);
    expectTypeOf<AuditAction<typeof none>>().toEqualTypeOf<never>();
  });

  test('een route met de auditacties van de app is een gewone route uit defineRoute', () => {
    const { defineRoute } = createRouteKit({ permissions, audit });
    const route = defineRoute(
      defineContract({
        method: 'POST',
        path: '/notes/archive',
        input: z.object({ id: z.string() }).strict(),
        output: z.null(),
        permission: 'notes:write',
      }),
      () => null,
    );

    expect(isRouteDef(route)).toBe(true);
  });

  test('het schema van de registratie is te gebruiken door de app zelf (strict)', () => {
    expect(audit['note.archive'].details.safeParse({ reason: 'dubbel' }).success).toBe(true);
    expect(audit['note.archive'].details.safeParse({ reason: 'dubbel', extra: 1 }).success).toBe(false);
  });
});
