import { expect, test } from 'vitest';
import { definePermissions, type PermissionRule } from './can.ts';

const table: Record<string, PermissionRule> = { 'notes:read': { roles: ['user', 'admin'] } };
const permissions = definePermissions(table);

test.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
  'onbekende permissie %s wordt geweigerd',
  (name) => {
    expect(permissions.check({ role: 'user', sessionStrength: 'password' }, name)).toStrictEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(permissions.can({ role: 'admin', sessionStrength: 'mfa' }, name)).toBe(false);
  },
);

test('zonder sessie blijft ook een onbekende permissie UNAUTHENTICATED', () => {
  expect(permissions.check(null, 'constructor')).toStrictEqual({ ok: false, code: 'UNAUTHENTICATED' });
});
