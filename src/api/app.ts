import type { AuthGateway } from '#core/api/auth/index.ts';
import type { WithUser } from '#core/api/db/types.ts';
import { createApp, type DevLogin } from '#core/api/http/create-app.ts';
import type { Readiness } from '#core/api/http/readiness.ts';
import type { RequestLog } from '#core/api/obs/request-log.ts';
import type { RateLimits } from '#core/shared/limits.ts';
import { errors } from '#shared/errors.ts';
import { RATE_LIMITS } from '#shared/limits.ts';
import { accountsListRoute, inviteRoute, reinviteRoute } from './routes/accounts.ts';
import {
  confirmEmailRoute,
  meRoute,
  renameRoute,
  revokeOtherSessionsRoute,
  revokeSessionRoute,
  sessionsListRoute,
} from './routes/me.ts';
import type { AppServices } from './services.ts';

// Compositie-root van de app (ADR 0008): routes, foutcodes en wat server.ts aanlevert (auth, withUser, services, devLogin).
export const routes = [
  meRoute,
  renameRoute,
  sessionsListRoute,
  revokeSessionRoute,
  revokeOtherSessionsRoute,
  confirmEmailRoute,
  accountsListRoute,
  inviteRoute,
  reinviteRoute,
] as const;

export interface BuildAppConfig {
  readonly appOrigin: string;
  readonly auth: AuthGateway;
  readonly withUser: WithUser;
  readonly services: AppServices;
  // Alleen bij APP_ENV=local (server.ts); anders bestaat /api/dev/login-as niet.
  readonly devLogin?: DevLogin;
  // Eén regel per request; server.ts geeft writeJsonLine mee, tests laten hem weg.
  readonly log?: RequestLog;
  // GET /api/ready; server.ts geeft hem mee, tests laten hem weg.
  readonly ready?: Readiness;
  // Alleen in integratietests: een lagere rate limit dan die van de app (spec rate-limit); server.ts laat hem weg.
  readonly rateLimits?: RateLimits;
}

export function buildApp(config: BuildAppConfig) {
  return createApp<AppServices>({ ...config, routes, errors, rateLimits: config.rateLimits ?? RATE_LIMITS });
}
