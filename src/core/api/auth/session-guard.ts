import { type createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { deleteSessionCookie } from 'better-auth/cookies';
import { sessionRejection } from './session-policy.ts';

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

// Deze acties gebruiken de oude sessie niet als machtiging en moeten herstel met een oude cookie toelaten.
export const SESSION_RECOVERY_PATHS: ReadonlySet<string> = new Set(['/sign-in/email', '/reset-password', '/sign-out']);

export async function dropRejectedSession(ctx: HookContext, now: number): Promise<boolean> {
  // get-session is al uitgevoerd in de after-hook. Andere endpoints worden vóór hun actie gecontroleerd.
  const found = ctx.path === '/get-session' ? ctx.context.session : await getSessionFromCtx(ctx);
  if (found === null) return false;
  const reason = sessionRejection(found, now);
  if (reason === null) return false;
  ctx.context.session = null;
  deleteSessionCookie(ctx);
  try {
    const adapter = ctx.context.internalAdapter;
    if (reason === 'blocked') await adapter.deleteUserSessions(found.user.id);
    else await adapter.deleteSession(found.session.token);
  } catch {
    // Een fout bij opruimen mag de eerder vastgestelde weigering niet veranderen in een bruikbare sessie.
    ctx.context.logger.warn('Opruimen van een geweigerde sessie is mislukt');
  }
  return true;
}
