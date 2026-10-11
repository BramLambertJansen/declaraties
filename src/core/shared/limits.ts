// Harde grenzen van de template (framework §6). App-grenzen staan in src/shared/limits.ts (ADR 0008).
export const MAX_BODY_BYTES = 100 * 1024;

// Accounts en sessies (ADR 0003, ADR 0013, spec accountbeheer).
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;
export const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_IDLE_SECONDS = 12 * 60 * 60;
export const SESSION_REFRESH_SECONDS = 60 * 60;
export const SESSION_ABSOLUTE_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_FRESH_SECONDS = 10 * 60;

// Paginering (framework §5): een app mag kleiner, nooit groter dan MAX_PAGE_SIZE.
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// Rate limit van app-routes (spec rate-limit, framework §6 Verharding): vast venster per gebruiker per categorie. Een app
// kiest per contract een categorie (`rateLimit` in defineContract; zonder: GET → lezen, anders schrijven) en mag de
// maxima in src/shared/limits.ts lager zetten, nooit hoger (createApp weigert dan bij opstart; test in limits.test.ts).
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_CATEGORIES = ['lezen', 'schrijven', 'duur'] as const;
export type RateLimitCategory = (typeof RATE_LIMIT_CATEGORIES)[number];
export type RateLimits = Readonly<Record<RateLimitCategory, number>>;
export const RATE_LIMIT_MAX: RateLimits = { lezen: 300, schrijven: 60, duur: 10 };

// De categorieën waarvan het maximum geen geheel getal ≥ 1 is of boven de harde grens ligt; leeg = in orde.
export function invalidRateLimits(limits: RateLimits): RateLimitCategory[] {
  return RATE_LIMIT_CATEGORIES.filter((category) => {
    const max = limits[category];
    return !Number.isInteger(max) || max < 1 || max > RATE_LIMIT_MAX[category];
  });
}

// Zoeken in lijstpagina's (spec lijstpagina).
export const MAX_SEARCH_LENGTH = 100;
