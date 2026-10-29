import { createAuthApi } from '#core/web/lib/auth.ts';

// Inloggen, TOTP, wachtwoord instellen en uitloggen via Better Auth (same-origin).
export const auth = createAuthApi(window.location.origin);
