import { SESSION_ABSOLUTE_SECONDS } from '../../shared/limits.ts';

interface SessionFacts {
  readonly session: { readonly createdAt: Date };
  readonly user: object;
}

export function sessionVersion(value: object): number {
  if (!('sessionVersion' in value)) return 0;
  const version = value.sessionVersion;
  return typeof version === 'number' && Number.isSafeInteger(version) && version >= 0 ? version : -1;
}

export function accountRejection(user: object): 'blocked' | 'deactivated' | null {
  if ('blockedAt' in user && user.blockedAt !== null && user.blockedAt !== undefined) return 'blocked';
  if ('deactivatedAt' in user && user.deactivatedAt !== null && user.deactivatedAt !== undefined) return 'deactivated';
  return null;
}

// ADR 0003 en 0026: dezelfde beslissing voor de app-gateway en de directe Better Auth-endpoints.
export function sessionRejection({ session, user }: SessionFacts, now: number) {
  if (now - session.createdAt.getTime() > SESSION_ABSOLUTE_SECONDS * 1000) return 'expired';
  const disabled = accountRejection(user);
  if (disabled !== null) return disabled;
  if (sessionVersion(session) !== sessionVersion(user) || sessionVersion(user) < 0) return 'revoked';
  return null;
}
