import { definePermissions } from '#core/shared/can.ts';

// Permissietabel van de app (spec accountbeheer). Core voegt 'app.use' toe en eist MFA voor elke permissie van een admin.
// Een nieuwe permissie krijgt een test per verboden rol (src/shared/permissions.test.ts doet dat voor de hele tabel).
export const permissions = definePermissions({
  'me:read': { roles: ['user', 'admin'] },
  // Spec eigen-account: het eigen account (naam, sessies, e-mailbevestiging); altijd het account uit de sessie.
  'me:update': { roles: ['user', 'admin'] },
  'accounts:read': { roles: ['admin'] },
  'accounts:invite': { roles: ['admin'] },
  // Spec accountbeheer-uitbreiding (OV-2, ADR 0026): blokkeren en deblokkeren.
  'accounts:manage': { roles: ['admin'] },
  // Spec design-system (OV-1): de catalogus, ook in productie; de guard verbergt hem, hij beschermt geen geheim.
  'design-system:read': { roles: ['admin'] },
});

export type Permission = (typeof permissions.names)[number];
export const { can, check } = permissions;
