import { APIError, type createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { deleteSessionCookie } from 'better-auth/cookies';
import type { Pool } from 'pg';
import { z } from 'zod';
import { accountRejection, sessionVersion } from './session-policy.ts';

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];
type RequiresMfa = (userId: string) => Promise<boolean>;
interface SessionHookContext {
  readonly context: {
    readonly internalAdapter: { findUserById: (userId: string) => Promise<object | null> };
    readonly session?: { readonly session: object } | null;
  };
}
interface Verification {
  readonly identifier: string;
  readonly value: string;
  readonly expiresAt: Date;
}
const loginSnapshot = z.object({ userId: z.string(), sessionVersion: z.number().int().nonnegative() });
type LoginSnapshot = z.output<typeof loginSnapshot>;

function rejectAccount(user: object) {
  const reason = accountRejection(user);
  if (reason !== null) {
    const code = reason === 'blocked' ? 'ACCOUNT_BLOCKED' : 'ACCOUNT_DEACTIVATED';
    throw new APIError('FORBIDDEN', { code, message: 'Account is niet beschikbaar' });
  }
}

function unauthenticated(): never {
  throw new APIError('UNAUTHORIZED', { code: 'UNAUTHENTICATED', message: 'Log opnieuw in' });
}

async function recordLogin(database: Pool, snapshot: LoginSnapshot, completedAt: number) {
  const result = await database.query(
    `update better_auth."user"
       set last_login_at = greatest(last_login_at, $3::timestamptz)
       where id = $1 and session_version = $2 and blocked_at is null and deactivated_at is null
       returning id`,
    [snapshot.userId, snapshot.sessionVersion, new Date(completedAt).toISOString()],
  );
  if (result.rowCount !== 1) unauthenticated();
}

interface LifecycleState {
  readonly database: Pool;
  readonly requiresMfa: RequiresMfa;
  readonly snapshots: WeakMap<object, LoginSnapshot>;
  readonly settingsOnly: WeakSet<object>;
}

async function prepareSession(
  { snapshots }: LifecycleState,
  session: { readonly userId: string },
  ctx: SessionHookContext | null | undefined,
) {
  if (ctx === null || ctx === undefined) return;
  const user = await ctx.context.internalAdapter.findUserById(session.userId);
  if (user === null) unauthenticated();
  rejectAccount(user);
  const currentVersion = sessionVersion(user);
  const previous = ctx.context.session?.session;
  const snapshot = snapshots.get(ctx.context);
  const version = previous === undefined ? (snapshot?.sessionVersion ?? currentVersion) : sessionVersion(previous);
  if (version < 0 || version !== currentVersion || (snapshot !== undefined && snapshot.userId !== session.userId))
    unauthenticated();
  snapshots.set(ctx.context, { userId: session.userId, sessionVersion: version });
  if ('sessionVersion' in user) return { data: { ...session, sessionVersion: version } };
  return;
}

async function bindChallenge(
  { snapshots }: LifecycleState,
  verification: Verification,
  { context, write }: { readonly context: object; readonly write: (verification: Verification) => Promise<unknown> },
) {
  if (!verification.identifier.startsWith('2fa-') || verification.identifier.startsWith('2fa-attempts-')) return;
  const snapshot = snapshots.get(context);
  if (snapshot === undefined || snapshot.userId !== verification.value) return;
  await write({
    identifier: `lifecycle:${verification.identifier}`,
    value: JSON.stringify(snapshot),
    expiresAt: verification.expiresAt,
  });
}

async function prepareChallenge({ snapshots, settingsOnly, requiresMfa }: LifecycleState, ctx: HookContext) {
  if (ctx.path !== '/two-factor/verify-totp') return;
  const existing = await getSessionFromCtx(ctx);
  if (existing !== null) {
    const alreadyMfa = 'sessionStrength' in existing.session && existing.session.sessionStrength === 'mfa';
    if (alreadyMfa || !(await requiresMfa(existing.user.id))) settingsOnly.add(ctx.context);
    return;
  }
  const name = ctx.context.createAuthCookie('two_factor').name;
  const identifier = await ctx.getSignedCookie(name, ctx.context.secret);
  if (!identifier) return;
  const verification = await ctx.context.internalAdapter.findVerificationValue(`lifecycle:${identifier}`);
  if (verification === null || verification.expiresAt.getTime() <= Date.now()) unauthenticated();
  const snapshot = loginSnapshot.parse(JSON.parse(verification.value));
  snapshots.set(ctx.context, snapshot);
}

async function completeLogin(
  { database, requiresMfa, snapshots, settingsOnly }: LifecycleState,
  ctx: HookContext,
  now: number,
) {
  const login = ctx.path === '/sign-in/email' || ctx.path === '/two-factor/verify-totp';
  const created = ctx.context.newSession;
  if (!login || created === null || settingsOnly.has(ctx.context)) return;
  try {
    const snapshot = snapshots.get(ctx.context);
    if (snapshot === undefined) unauthenticated();
    if (
      ctx.path === '/sign-in/email' &&
      (('twoFactorEnabled' in created.user && created.user.twoFactorEnabled === true) ||
        (await requiresMfa(created.user.id)))
    )
      return;
    await recordLogin(database, snapshot, now);
  } catch (error) {
    deleteSessionCookie(ctx);
    ctx.context.setNewSession(null);
    await ctx.context.internalAdapter.deleteSession(created.session.token).catch(() => undefined);
    throw error;
  }
}

export function createAccountLifecycle(database: Pool, requiresMfa: RequiresMfa = () => Promise.resolve(false)) {
  const state = {
    database,
    requiresMfa,
    snapshots: new WeakMap<object, LoginSnapshot>(),
    settingsOnly: new WeakSet<object>(),
  };
  return {
    beforeSession: (session: { readonly userId: string }, ctx: SessionHookContext | null | undefined) =>
      prepareSession(state, session, ctx),
    bindChallenge: (verification: Verification, context: object, write: (value: Verification) => Promise<unknown>) =>
      bindChallenge(state, verification, { context, write }),
    beforeEndpoint: (ctx: HookContext) => prepareChallenge(state, ctx),
    afterEndpoint: (ctx: HookContext, now: number) => completeLogin(state, ctx, now),
  };
}

export type AccountLifecycle = ReturnType<typeof createAccountLifecycle>;
