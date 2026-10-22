import { Home, LayoutDashboard } from 'lucide-react';
import type { NavItem } from '#core/web/ui/sidebar.tsx';
import type { Permission } from '#shared/permissions.ts';
import { copy } from '#web/copy/ui.ts';

// Sidebar per rol (spec accountbeheer, ADR 0040): user ziet Home, admin ook Dashboard.
export const navItems: readonly NavItem<Permission>[] = [
  { label: copy.nav.home, href: '/', permission: 'app.use', icon: Home },
  { label: copy.nav.dashboard, href: '/admin', permission: 'accounts:read', icon: LayoutDashboard },
];
