import { MAX_PAGE_SIZE, type RateLimits } from '#core/shared/limits.ts';

// Grenzen van de app (ADR 0008); nooit boven een harde grens uit core (test in limits.test.ts).
export const ACCOUNTS_PAGE_SIZE = 25;
export const APP_LIMITS = { ACCOUNTS_PAGE_SIZE } as const;
export { MAX_PAGE_SIZE };

// Accounts (spec accountbeheer): naam bij het uitnodigen, e-mailadres (RFC 5321).
export const MAX_NAME_LENGTH = 100;
export const MAX_EMAIL_LENGTH = 254;

// Rate limit per gebruiker per venster van 60 s (spec rate-limit, OV-1); per categorie hooguit de harde grens uit core.
export const RATE_LIMITS: RateLimits = { lezen: 300, schrijven: 60, duur: 10 };
