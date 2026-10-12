import { createRouteKit } from '#core/api/route/kit.ts';
import { auditActions } from '#shared/audit.ts';
import { permissions, type Permission } from '#shared/permissions.ts';
import type { AppServices } from './services.ts';

// Compositie-root (ADR 0008): defineRoute met de permissietabel, de auditacties en de services van de app.
export const { defineRoute } = createRouteKit<Permission, AppServices, typeof auditActions>({
  permissions,
  audit: auditActions,
});
