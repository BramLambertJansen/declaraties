import { queryOptions, type QueryClient } from '@tanstack/react-query';
import type { CanActor, Role } from '#core/shared/can.ts';
import { createGuard } from '#core/web/lib/guard.ts';
import { permissions } from '#shared/permissions.ts';
import { api } from './api.ts';

// De context van elke route (main.tsx) en de can()-guard van de app: `beforeLoad: guard('accounts:read')`.
export interface RouterContext {
  readonly queryClient: QueryClient;
}

export const LOGIN_PATH = '/login';
const REDIRECT_ORIGIN = 'https://redirect.invalid';

export const meQuery = queryOptions({ queryKey: ['me'], queryFn: () => api.call('GET /me', {}) });

// /api/me geeft geen sessiesterkte, maar een admin krijgt /me alleen met een MFA-sessie (me:read; core eist MFA voor
// elke permissie van een admin). Voor een user telt de sterkte in can() niet.
export function actorFromMe(me: { readonly rol: CanActor['role'] }): CanActor {
  return { role: me.rol, sessionStrength: me.rol === 'admin' ? 'mfa' : 'password' };
}

// Na inloggen per rol (spec accountbeheer): user → /, admin → /admin.
export function homeFor(role: Role): '/' | '/admin' {
  return role === 'admin' ? '/admin' : '/';
}

// Alleen een pad binnen de app als terugweg na inloggen; nooit een andere origin (//host) of de inlogpagina zelf.
export function safeRedirect(target: string | undefined): string | null {
  if (target === undefined || !target.startsWith('/') || target.startsWith('//')) return null;
  try {
    // URL normaliseert ook backslashes, tabs/regeleinden en dot-segmenten, zoals de browser.
    const normalized = target.replaceAll('\\', '/').replaceAll('\t', '').replaceAll('\r', '').replaceAll('\n', '');
    if (normalized.startsWith('//')) return null;
    const resolved = new URL(normalized, REDIRECT_ORIGIN);
    return resolved.origin !== REDIRECT_ORIGIN || resolved.pathname.startsWith(LOGIN_PATH) ? null : target;
  } catch {
    return null;
  }
}

// Er was een sessie in dit tabblad (de actor staat in de cache): dan is een 401 een verlopen sessie, geen eerste bezoek.
export function hadSession(queryClient: QueryClient): boolean {
  return queryClient.getQueryData(meQuery.queryKey) !== undefined;
}

export const guard = createGuard({
  permissions,
  loadActor: async ({ queryClient }: RouterContext) => actorFromMe(await queryClient.query(meQuery)),
  loginPath: LOGIN_PATH,
  loginSearch: ({ queryClient }: RouterContext) => (hadSession(queryClient) ? { sessie: 'verlopen' } : {}),
});
