import type { BetterAuthOptions } from 'better-auth';
import { twoFactor } from 'better-auth/plugins/two-factor';
import type { Pool } from 'pg';
import type { SendMail } from '../mail/smtp.ts';
import { createHooks } from './hooks.ts';
import { createMailing, type Mailing } from './mailing.ts';
import {
  EMAIL_CHANGE_TTL_SECONDS,
  INVITATION_TTL_SECONDS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  SESSION_FRESH_SECONDS,
  SESSION_IDLE_SECONDS,
  SESSION_REFRESH_SECONDS,
} from '../../shared/limits.ts';

export interface Invitation {
  readonly email: string;
  readonly name: string;
  // Link naar het scherm "Wachtwoord instellen" van de SPA, met het eenmalige token.
  readonly url: string;
}

export interface AuthConfig {
  // Exact APP_ORIGIN (framework §6: AUTH_BASE_URL = APP_ORIGIN); Better Auth hangt onder /api/auth.
  readonly origin: string;
  readonly secret: string;
  readonly sendInvitation: (invitation: Invitation) => Promise<void>;
  // Zonder: geen enkele header vertrouwd (geen spoofbare x-forwarded-for); lokaal valt Better Auth terug op 127.0.0.1.
  readonly clientIpHeader?: string | undefined;
  // De mails van een e-mailwijziging (spec eigen-account). Zonder staat changeEmail uit.
  readonly sendMail?: SendMail | undefined;
  // Naam in die mails; zonder de hostnaam van de origin (core kent de naam van de app niet).
  readonly appName?: string | undefined;
}

const NO_TRUSTED_IP_HEADER = 'x-template-geen-ip-header';

export const AUTH_BASE_PATH = '/api/auth';
export const INVITATION_PATH = '/uitnodiging';

// Publiek dicht (ADR 0013): 404 in de router; interne aanroepen via auth.api.* blijven werken. disabledPaths vergelijkt
// letterlijk, dus een pad met een parameter staat apart in DISABLED_PREFIXES (afgevangen in authHandler).
export const DISABLED_PREFIXES: readonly string[] = ['/reset-password/'];
export const DISABLED_PATHS: readonly string[] = [
  '/sign-up/email',
  '/request-password-reset',
  '/two-factor/send-otp',
  '/two-factor/verify-otp',
  '/two-factor/verify-backup-code',
  '/two-factor/generate-backup-codes',
  '/two-factor/view-backup-codes',
  // Spec eigen-account: naam, sessies en e-mailbevestiging via eigen routes (zod, limits.ts, geen tokens naar de browser).
  '/update-user',
  '/update-session',
  '/list-sessions',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
  // Account zelf verwijderen blijft buiten scope (spec eigen-account); verwijderen is een admin-actie (ADR 0022).
  '/delete-user',
  // Anoniem; zou elk account met emailVerified = false (elke uitnodiging) mailen zodra sendVerificationEmail bestaat.
  '/send-verification-email',
  // GET; bevestigen gaat via de eigen POST-route (framework §6: een GET-link bevestigt met een POST).
  '/verify-email',
];

// __Host-: alleen Secure, Path=/ en zonder Domain (ADR 0003). Better Auth zou zelf __Secure- ervoor zetten; daarom
// staat useSecureCookies uit en zet elke cookie zelf `secure: true`.
const HOST_COOKIES = ['session_token', 'session_data', 'dont_remember', 'two_factor'] as const;
const cookies = Object.fromEntries(
  HOST_COOKIES.map((name) => [name, { name: `__Host-auth.${name}`, attributes: { secure: true, path: '/' } }]),
);

interface AccountHookContext {
  readonly context: {
    readonly internalAdapter: { updateUser: (userId: string, data: { emailVerified: boolean }) => Promise<unknown> };
  };
}

// Stap 1 gaat naar het oude adres, stap 2 naar het nieuwe (user.email is dan het nieuwe adres); de links wijzen naar de SPA.
function emailChangeOptions(mailing: Mailing | null) {
  if (mailing === null) return {};
  return {
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: ({ user, newEmail, token }: ChangeConfirmation) =>
          mailing.confirmOld(user, newEmail, token),
      },
    },
    emailVerification: {
      expiresIn: EMAIL_CHANGE_TTL_SECONDS,
      sendVerificationEmail: ({ user, token }: { user: MailUser; token: string }) => mailing.verifyNew(user, token),
    },
  };
}

interface MailUser {
  readonly name: string;
  readonly email: string;
}

interface ChangeConfirmation {
  readonly user: MailUser;
  readonly newEmail: string;
  readonly token: string;
}

// database: een pg-pool als auth_service (search_path better_auth, alleen DML op dat schema, ADR 0010).
export function createAuthOptions(config: AuthConfig, database: Pool) {
  const mailing = createMailing(config);
  return {
    ...emailChangeOptions(mailing),
    baseURL: config.origin,
    basePath: AUTH_BASE_PATH,
    secret: config.secret,
    database,
    trustedOrigins: [config.origin],
    disabledPaths: [...DISABLED_PATHS],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      resetPasswordTokenExpiresIn: INVITATION_TTL_SECONDS,
      revokeSessionsOnPasswordReset: true,
      // Uitnodigen gebruikt de reset-flow (ADR 0013): de mail gaat naar het scherm in de SPA, niet naar de GET-redirect.
      sendResetPassword: async ({ user, token }) => {
        const url = `${config.origin}${INVITATION_PATH}?token=${encodeURIComponent(token)}`;
        await config.sendInvitation({ email: user.email, name: user.name, url });
      },
    },
    session: {
      expiresIn: SESSION_IDLE_SECONDS,
      updateAge: SESSION_REFRESH_SECONDS,
      freshAge: SESSION_FRESH_SECONDS,
      cookieCache: { enabled: false },
      additionalFields: {
        sessionStrength: {
          type: 'string',
          input: false,
          required: true,
          defaultValue: 'password',
          fieldName: 'session_strength',
        },
      },
    },
    rateLimit: { enabled: true, storage: 'database' },
    advanced: {
      useSecureCookies: false,
      cookies,
      ipAddress: { ipAddressHeaders: [config.clientIpHeader ?? NO_TRUSTED_IP_HEADER] },
    },
    hooks: createHooks(mailing),
    databaseHooks: {
      // Een uitgenodigde gebruiker heeft geen credential-account; dat ontstaat pas als hij via de link zijn wachtwoord
      // instelt. Dat bewijst het e-mailadres (ADR 0013).
      account: {
        create: {
          // Buiten een request (seed, admin:create) geeft Better Auth 1.7.7 hier `undefined` mee, ondanks het type `| null`.
          after: async (account, ctx: AccountHookContext | null | undefined) => {
            if (account.providerId !== 'credential' || ctx === null || ctx === undefined) return;
            await ctx.context.internalAdapter.updateUser(account.userId, { emailVerified: true });
          },
        },
      },
    },
    plugins: [twoFactor({ issuer: new URL(config.origin).hostname })],
    telemetry: { enabled: false },
  } satisfies BetterAuthOptions;
}
