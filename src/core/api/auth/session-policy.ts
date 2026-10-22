import { SESSION_ABSOLUTE_SECONDS } from '../../shared/limits.ts';

interface SessionFacts {
  readonly session: { readonly createdAt: Date };
  readonly user: object;
}

// ADR 0041 en 0043: dezelfde beslissing voor de app-gateway en de directe Better Auth-endpoints.
export function sessionRejection({ session, user }: SessionFacts, now: number): 'expired' | 'blocked' | null {
  if (now - session.createdAt.getTime() > SESSION_ABSOLUTE_SECONDS * 1000) return 'expired';
  if ('blockedAt' in user && user.blockedAt !== null && user.blockedAt !== undefined) return 'blocked';
  return null;
}
