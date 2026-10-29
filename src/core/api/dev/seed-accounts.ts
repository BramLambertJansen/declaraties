import type { Role } from '../../shared/can.ts';

// Vaste lokale accounts (spec accountbeheer: "altijd iemand binnen"). Alleen voor APP_ENV=local: scripts/seed.mjs weigert
// elders, en de dev-switcher (PR 7) bestaat buiten local niet. Demo-waarden, bewust in de repo; nergens anders geldig.
export const SEED_DEMO_WACHTWOORD = 'lokaal-demo-wachtwoord';

// Vast TOTP-geheim van de lokale admin (32 tekens, zoals Better Auth ze maakt); de otpauth-URI staat in de README.
export const SEED_ADMIN_TOTP_SLEUTEL = 'lokaal-demo-totp-sleutel-0000000';

export interface SeedAccount {
  readonly email: string;
  readonly name: string;
}

// Eén account per rol (spec accountbeheer: één account heeft één rol). Record<Role, …>: een nieuwe rol in ROLES
// (src/core/shared/can.ts) zonder seed-account is een typefout, zodat de dev-rolwisselaar elke rol kan tonen.
export const SEED_ACCOUNTS = {
  user: { email: 'gebruiker@template.test', name: 'Lokale Gebruiker' },
  admin: { email: 'admin@template.test', name: 'Lokale Beheerder' },
} as const satisfies Record<Role, SeedAccount>;
