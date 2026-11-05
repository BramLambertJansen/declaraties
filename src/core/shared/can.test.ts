import { describe, expect, test } from 'vitest';
import { type CanActor, definePermissions } from './can.ts';

const permissions = definePermissions({
  'notes:read': { roles: ['user', 'admin'] },
  'users:manage': { roles: ['admin'] },
});
const user: CanActor = { role: 'user', sessionStrength: 'password' };
const adminWithoutMfa: CanActor = { role: 'admin', sessionStrength: 'password' };
const admin: CanActor = { role: 'admin', sessionStrength: 'mfa' };

describe('can() (framework §6, ADR 0040)', () => {
  test('zonder actor: UNAUTHENTICATED', () => {
    expect(permissions.check(null, 'notes:read')).toStrictEqual({ ok: false, code: 'UNAUTHENTICATED' });
  });

  test('een rol zonder de permissie: FORBIDDEN', () => {
    expect(permissions.check(user, 'users:manage')).toStrictEqual({ ok: false, code: 'FORBIDDEN' });
  });

  test('een admin zonder MFA: MFA_REQUIRED, ook voor een permissie die users ook hebben', () => {
    expect(permissions.check(adminWithoutMfa, 'users:manage')).toStrictEqual({ ok: false, code: 'MFA_REQUIRED' });
    expect(permissions.check(adminWithoutMfa, 'notes:read')).toStrictEqual({ ok: false, code: 'MFA_REQUIRED' });
    expect(permissions.check(adminWithoutMfa, 'app.use')).toStrictEqual({ ok: false, code: 'MFA_REQUIRED' });
  });

  test('een user heeft geen MFA nodig; een admin met MFA mag alles van zijn rol', () => {
    expect(permissions.can(user, 'notes:read')).toBe(true);
    expect(permissions.can(admin, 'users:manage')).toBe(true);
  });

  test("core levert 'app.use' voor elke ingelogde rol", () => {
    expect(permissions.names).toContain('app.use');
    expect(permissions.can(user, 'app.use')).toBe(true);
  });

  test("een app kan 'app.use' niet herdefiniëren", () => {
    expect(() => definePermissions({ 'app.use': { roles: ['admin'] } })).toThrow('bestaat al in core');
  });
});
