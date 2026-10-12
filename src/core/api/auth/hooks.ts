import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { z } from 'zod';
import { SESSION_FRESH_SECONDS } from '../../shared/limits.ts';
import type { Mailing } from './mailing.ts';

// Hooks rond Better Auth (ADR 0013, ADR 0021, ADR 0024; spec eigen-account). Elke regel heeft een integratietest
// (test/auth/*.int.test.ts, test/api/eigen-account*.int.test.ts). session_strength: 'password' bij inloggen; 'mfa' na TOTP;
// bij /change-password neemt de nieuwe sessie sterkte en createdAt van de oude over (OV-8).

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

// Paden waarvoor een gebruiker met TOTP een MFA-sessie nodig heeft (spec eigen-account, AC-14).
const MFA_PATHS: ReadonlySet<string> = new Set(['/change-password', '/change-email']);

const sessionFacts = z.object({
  session: z.object({ sessionStrength: z.enum(['password', 'mfa']), createdAt: z.date() }),
  user: z.object({
    name: z.string(),
    email: z.string(),
    twoFactorEnabled: z.boolean().nullish(),
  }),
});

type SessionFacts = z.infer<typeof sessionFacts>;

// De oude sessie van een lopende /change-password (de after-hook ziet hem niet meer: Better Auth heeft hem dan verwijderd).
// Sleutel: het AuthContext-object van deze ene aanroep, dat before- en after-hooks delen.
const previousSession = new WeakMap<object, SessionFacts['session']>();

function fail(status: 'BAD_REQUEST' | 'FORBIDDEN' | 'UNAUTHORIZED', code: string, message: string): never {
  throw new APIError(status, { code, message });
}

function isTrustDeviceRequested(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'trustDevice' in body && body.trustDevice !== false;
}

function isRevokeRequested(body: unknown): boolean {
  return (
    typeof body === 'object' && body !== null && 'revokeOtherSessions' in body && body.revokeOtherSessions === true
  );
}

// De sessie van de aanroeper, of null (dan weigert het endpoint zelf met 401).
async function currentSession(ctx: HookContext): Promise<SessionFacts | null> {
  const found = await getSessionFromCtx(ctx);
  if (found === null) return null;
  return sessionFacts.parse(found);
}

function requireMfaWhenEnabled(facts: SessionFacts): void {
  if (facts.user.twoFactorEnabled === true && facts.session.sessionStrength !== 'mfa') {
    fail('FORBIDDEN', 'MFA_REQUIRED', 'Deze actie vraagt een sessie met tweestapsverificatie');
  }
}

// Better Auth gebruikt hier sensitiveSessionMiddleware en geen freshAge (OV-4): een e-mailwijziging eist een verse sessie.
// createdAt, want een wachtwoordwijziging neemt die van de oude sessie over (OV-8).
function requireFreshSession(facts: SessionFacts, now: number): void {
  if (now - facts.session.createdAt.getTime() > SESSION_FRESH_SECONDS * 1000) {
    fail('FORBIDDEN', 'SESSION_NOT_FRESH', 'Log opnieuw in om dit te wijzigen');
  }
}

const changeEmailBody = z.object({ newEmail: z.email() });

// Bezet adres (OV-9): Better Auth antwoordt dan zonder mail, en dus meetbaar sneller. Hier gaat er een neutrale mail naar het
// oude adres en volgt hetzelfde antwoord als bij een vrij adres. Een ongeldig of gelijk adres laat het endpoint zelf afwijzen.
async function answerTakenAddress(ctx: HookContext, facts: SessionFacts, mailing: Mailing | null) {
  const body = changeEmailBody.safeParse(ctx.body);
  if (!body.success || mailing === null) return undefined;
  const newEmail = body.data.newEmail.toLowerCase();
  if (newEmail === facts.user.email.toLowerCase()) return undefined;
  if ((await ctx.context.internalAdapter.findUserByEmail(newEmail)) === null) return undefined;
  await mailing.taken(facts.user, newEmail);
  return ctx.json({ status: true });
}

export function createHooks(mailing: Mailing | null, now: () => number = Date.now) {
  const before = createAuthMiddleware(async (ctx) => {
    if (ctx.path === '/two-factor/verify-totp' && isTrustDeviceRequested(ctx.body)) {
      fail('BAD_REQUEST', 'TRUST_DEVICE_DISABLED', 'trustDevice staat uit (ADR 0013)');
    }
    if (ctx.path === '/verify-email') {
      // Vangnet naast disabledPaths: zonder sessie maakt Better Auth bij stap 2 zelf een sessie.
      if ((await currentSession(ctx)) === null) fail('UNAUTHORIZED', 'UNAUTHENTICATED', 'Geen sessie');
      return;
    }
    if (!MFA_PATHS.has(ctx.path)) return;
    const facts = await currentSession(ctx);
    if (facts === null) return;
    requireMfaWhenEnabled(facts);
    if (ctx.path === '/change-email') {
      requireFreshSession(facts, now());
      return answerTakenAddress(ctx, facts, mailing);
    }
    // Andere sessies intrekken is verplicht (framework §6); het veld komt uit de body.
    if (!isRevokeRequested(ctx.body)) fail('BAD_REQUEST', 'VALIDATION', 'revokeOtherSessions moet true zijn');
    previousSession.set(ctx.context, facts.session);
  });

  const after = createAuthMiddleware(async (ctx) => {
    if (ctx.path === '/change-password') return afterChangePassword(ctx);
    const session = ctx.context.newSession?.session;
    if (session === undefined) return;
    if (ctx.path === '/two-factor/verify-totp') {
      await ctx.context.internalAdapter.updateSession(session.token, { sessionStrength: 'mfa' });
    } else if (ctx.path === '/two-factor/disable') {
      await ctx.context.internalAdapter.updateSession(session.token, { sessionStrength: 'password' });
    }
  });

  return { before, after };
}

const changedPassword = z.object({ user: z.record(z.string(), z.unknown()) });

async function afterChangePassword(ctx: HookContext) {
  const previous = previousSession.get(ctx.context);
  previousSession.delete(ctx.context);
  const created = ctx.context.newSession?.session;
  if (previous !== undefined && created !== undefined) {
    // OV-8: geen nieuwe TOTP-stap, maar ook geen verlenging van de absolute duur of van freshAge.
    await ctx.context.internalAdapter.updateSession(created.token, {
      sessionStrength: previous.sessionStrength,
      createdAt: previous.createdAt,
    });
  }
  // Zonder token in de JSON (het staat al in de cookie); bij een fout blijft het antwoord zoals het is.
  const result = changedPassword.safeParse(ctx.context.returned);
  return result.success ? ctx.json({ user: result.data.user }) : undefined;
}
