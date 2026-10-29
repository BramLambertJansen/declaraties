import { describe, expect, test } from 'vitest';
import { ROLES, type CanActor, type Role } from '#core/shared/can.ts';
import { check, permissions } from './permissions.ts';

// Per permissie de toegestane rollen, letterlijk (spec accountbeheer). Een nieuwe permissie laat de eerste test falen tot
// hij hier staat; daarmee krijgt elke permissie automatisch een test per verboden rol en voor een admin zonder MFA.
const expected: Record<string, readonly Role[]> = {
  'app.use': ['user', 'admin'],
  'me:read': ['user', 'admin'],
  'me:update': ['user', 'admin'],
  'accounts:read': ['admin'],
  'accounts:invite': ['admin'],
  'accounts:manage': ['admin'],
  'design-system:read': ['admin'],
};

const entries = Object.entries(expected).flatMap(([permission, allowed]) =>
  ROLES.flatMap((role) =>
    (['password', 'mfa'] as const).map((sessionStrength) => ({
      permission,
      role,
      sessionStrength,
      allowed: allowed.includes(role),
    })),
  ),
);

describe('permissietabel (src/shared/permissions.ts)', () => {
  test('de tabel bevat precies de verwachte permissies', () => {
    expect([...permissions.names].sort()).toStrictEqual(Object.keys(expected).sort());
  });

  test.each(entries)('$permission voor $role ($sessionStrength)', ({ permission, role, sessionStrength, allowed }) => {
    const actor: CanActor = { role, sessionStrength };
    const name = permissions.names.find((candidate) => candidate === permission);
    if (name === undefined) throw new Error(`onbekende permissie ${permission}`);

    const expectedDecision = !allowed
      ? { ok: false, code: 'FORBIDDEN' }
      : role === 'admin' && sessionStrength !== 'mfa'
        ? { ok: false, code: 'MFA_REQUIRED' }
        : { ok: true };
    expect(check(actor, name)).toStrictEqual(expectedDecision);
  });

  test('zonder actor is elke permissie UNAUTHENTICATED', () => {
    for (const name of permissions.names)
      expect(check(null, name)).toStrictEqual({ ok: false, code: 'UNAUTHENTICATED' });
  });
});
