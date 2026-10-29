import type { LucideIcon } from 'lucide-react';
import type { CanActor } from '../../shared/can.ts';
import { uiTexts } from '../copy/ui.ts';
import { NavLink } from './nav-link.tsx';

// Navigatie per rol (ADR 0040): de app registreert items met een permissie; de sidebar toont alleen wat can() toestaat.
// Verbergen is gemak, geen beveiliging: de guard van de route en de API blijven de controle.
export interface NavItem<Permission extends string> {
  readonly label: string;
  readonly href: string;
  readonly permission: Permission;
  readonly icon?: LucideIcon;
}

export function visibleNavItems<Permission extends string>(
  items: readonly NavItem<Permission>[],
  actor: CanActor | null,
  can: (actor: CanActor | null, permission: Permission) => boolean,
): NavItem<Permission>[] {
  return items.filter((item) => can(actor, item.permission));
}

export function Sidebar({ items }: { readonly items: readonly NavItem<string>[] }) {
  return (
    <nav aria-label={uiTexts.mainMenu} className="flex flex-col gap-1 p-3">
      {items.map(({ label, href, icon: Icon }) => (
        <NavLink key={href} href={href}>
          {Icon === undefined ? null : <Icon aria-hidden="true" />}
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
