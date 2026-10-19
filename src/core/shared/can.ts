// Rechten (framework §6, ADR 0008): één functie voor API en frontend; de API blijft de echte controle, RLS de tweede laag.
// De app levert alleen de tabel (src/shared/permissions.ts). Core voegt 'app.use' toe (elke ingelogde rol) en leidt de
// MFA-eis af uit de rol: elke permissie die de rol admin heeft, eist voor een admin een MFA-sessie. De app kan dat niet uitzetten;
// de RLS-helper app.is_mfa_admin() hanteert dezelfde regel.
export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];
export type SessionStrength = 'password' | 'mfa';

export interface CanActor {
  readonly role: Role;
  readonly sessionStrength: SessionStrength;
}

export interface PermissionRule {
  readonly roles: readonly Role[];
}

export type Decision =
  { readonly ok: true } | { readonly ok: false; readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'MFA_REQUIRED' };

const CORE_PERMISSIONS = { 'app.use': { roles: ['user', 'admin'] } } as const satisfies Record<string, PermissionRule>;

export interface Permissions<Permission extends string> {
  readonly names: readonly Permission[];
  readonly check: (actor: CanActor | null, permission: Permission) => Decision;
  readonly can: (actor: CanActor | null, permission: Permission) => boolean;
}

export function definePermissions<const Table extends Record<string, PermissionRule>>(
  appTable: Table,
): Permissions<keyof typeof CORE_PERMISSIONS | (keyof Table & string)> {
  for (const name of Object.keys(appTable)) {
    if (name in CORE_PERMISSIONS) throw new Error(`Permissie '${name}' bestaat al in core`);
  }
  const table: Readonly<Record<string, PermissionRule>> = { ...CORE_PERMISSIONS, ...appTable };
  const check = (actor: CanActor | null, permission: string): Decision => {
    if (actor === null) return { ok: false, code: 'UNAUTHENTICATED' };
    const rule = Object.hasOwn(table, permission) ? table[permission] : undefined;
    if (rule === undefined || !rule.roles.includes(actor.role)) return { ok: false, code: 'FORBIDDEN' };
    if (actor.role === 'admin' && actor.sessionStrength !== 'mfa') return { ok: false, code: 'MFA_REQUIRED' };
    return { ok: true };
  };
  return {
    names: Object.keys(table),
    check,
    can: (actor, permission) => check(actor, permission).ok,
  };
}
