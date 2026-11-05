import { redirect } from '@tanstack/react-router';
import type { CanActor, Permissions } from '../../shared/can.ts';
import { ApiError } from './api-client.ts';

// De can()-guard voor elke schermroute (framework §5): `beforeLoad: guard('accounts:read')`. Dezelfde can() als de API;
// de API blijft de echte controle. Niet ingelogd of nog zonder MFA → naar inloggen; geen recht → ForbiddenError, die de
// ErrorBoundary van de route toont ("Je hebt geen toegang tot deze pagina.").

export class ForbiddenError extends Error {
  constructor() {
    super('FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export interface GuardConfig<Permission extends string, Context> {
  readonly permissions: Permissions<Permission>;
  // De actor van de huidige sessie; null of een ApiError UNAUTHENTICATED/MFA_REQUIRED = niet (volledig) ingelogd.
  readonly loadActor: (context: Context) => Promise<CanActor | null>;
  readonly loginPath: string;
  // Extra zoekparameters voor de inlogpagina, bijv. een melding dat de sessie verlopen is.
  readonly loginSearch?: (context: Context) => Readonly<Record<string, string>>;
}

async function actorOrNull<Context>(
  loadActor: (context: Context) => Promise<CanActor | null>,
  context: Context,
): Promise<CanActor | null> {
  try {
    return await loadActor(context);
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'UNAUTHENTICATED' || error.code === 'MFA_REQUIRED')) return null;
    throw error;
  }
}

interface BeforeLoad<Context> {
  readonly context: Context;
  readonly location: { readonly href: string };
}

export function createGuard<Permission extends string, Context>(config: GuardConfig<Permission, Context>) {
  return (permission: Permission) =>
    async ({ context, location }: BeforeLoad<Context>): Promise<void> => {
      // Een 401 kan de actorcache tijdens loadActor wissen; onthoud daarvoor al of de sessie verlopen was.
      const loginSearch = config.loginSearch?.(context);
      const decision = config.permissions.check(await actorOrNull(config.loadActor, context), permission);
      if (decision.ok) return;
      if (decision.code === 'FORBIDDEN') throw new ForbiddenError();
      const search = new URLSearchParams({ redirect: location.href, ...loginSearch });
      // href in plaats van to: core kent de getypte routes van de app niet. throw: true laat de router de redirect gooien.
      redirect({ href: `${config.loginPath}?${search.toString()}`, throw: true });
    };
}
