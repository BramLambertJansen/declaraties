import type { Auth } from '../auth/auth.ts';
import type { DevLogin } from '../http/create-app.ts';
import { SEED_ACCOUNTS, SEED_ADMIN_TOTP_SLEUTEL, SEED_DEMO_WACHTWOORD } from './seed-accounts.ts';
import { totpCode } from './totp.ts';

// Dev-login (spec accountbeheer, ADR 0043): logt echt in via Better Auth als het seed-account van de rol, voor de admin met
// de TOTP-code uit het vaste lokale geheim. Alleen voor APP_ENV=local; server.ts geeft hem elders niet aan createApp.
//
// Via auth.api (server-side) en niet via de HTTP-handler: dezelfde hooks (session_strength 'mfa' na de TOTP-stap), maar
// buiten de rate limit van de router. Anders telt elke wissel als inlogpoging en weigert Better Auth na drie wissels.

// De twee stappen; elke stap geeft de Set-Cookie-regels terug. Smal gehouden, zodat de unit-test hem kan nabootsen.
export interface DevAuthSteps {
  readonly signIn: (email: string, password: string, headers: Headers) => Promise<string[]>;
  readonly verifyTotp: (code: string, headers: Headers) => Promise<string[]>;
}

function failed(path: string, error: unknown): Error {
  return new Error(`dev-login: ${path} mislukte (draait de seed?)`, { cause: error });
}

export function devAuthSteps(auth: Auth): DevAuthSteps {
  return {
    signIn: async (email, password, headers) => {
      try {
        const result = await auth.api.signInEmail({ body: { email, password }, headers, returnHeaders: true });
        return result.headers.getSetCookie();
      } catch (error) {
        throw failed('/sign-in/email', error);
      }
    },
    verifyTotp: async (code, headers) => {
      try {
        const result = await auth.api.verifyTOTP({ body: { code }, headers, returnHeaders: true });
        return result.headers.getSetCookie();
      } catch (error) {
        throw failed('/two-factor/verify-totp', error);
      }
    },
  };
}

function cookiePairs(setCookie: readonly string[]): string {
  return setCookie.map((line) => line.split(';', 1)[0] ?? '').join('; ');
}

// De headers van de browser (user-agent en IP voor de sessie), zonder zijn cookies: de wissel begint altijd schoon.
function headersWith(incoming: Headers, cookies: readonly string[]): Headers {
  const headers = new Headers(incoming);
  headers.delete('content-length');
  headers.delete('content-type');
  if (cookies.length === 0) headers.delete('cookie');
  else headers.set('cookie', cookiePairs(cookies));
  return headers;
}

export function createDevLogin(steps: DevAuthSteps): DevLogin {
  return async (role, incoming) => {
    const account = SEED_ACCOUNTS[role];
    const signedIn = await steps.signIn(account.email, SEED_DEMO_WACHTWOORD, headersWith(incoming, []));
    if (role !== 'admin') return signedIn;
    const verified = await steps.verifyTotp(totpCode(SEED_ADMIN_TOTP_SLEUTEL), headersWith(incoming, signedIn));
    return [...signedIn, ...verified];
  };
}
