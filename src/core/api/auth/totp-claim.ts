import { APIError, type createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { TOTP_REUSE_BLOCK_SECONDS } from '../../shared/limits.ts';
import { type ClaimOnce, totpKey } from './one-time-use.ts';

// Een TOTP-code werkt één keer (ADR 0075, spec inloggat-dichten; RFC 6238 §5.2). Better Auth accepteert een code ongeveer
// 90 s (venster ±1 stap van 30 s) en onthoudt niet dat hij gebruikt is. Deze before-stap claimt gebruiker plus code vóór de
// controle, ook bij een foute code: alleen zo wint van twee gelijktijdige verzoeken met dezelfde code precies één.

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

function codeFrom(body: unknown): unknown {
  return typeof body === 'object' && body !== null && 'code' in body ? body.code : undefined;
}

// De gebruiker van deze poging: met een sessie die van de sessie (step-up, TOTP inschakelen), bij inloggen die van de
// two_factor-challenge (de ondertekende cookie, zoals Better Auth zelf in verifyTwoFactor). Null zonder geldige challenge: dan
// weigert Better Auth het verzoek zelf.
async function attemptUserId(ctx: HookContext): Promise<string | null> {
  const session = await getSessionFromCtx(ctx);
  if (session !== null) return session.user.id;
  const identifier = await ctx.getSignedCookie(ctx.context.createAuthCookie('two_factor').name, ctx.context.secret);
  if (!identifier) return null;
  const challenge = await ctx.context.internalAdapter.findVerificationValue(identifier);
  if (challenge === null || challenge.expiresAt.getTime() <= Date.now()) return null;
  return challenge.value;
}

export async function claimTotpCode(ctx: HookContext, claim: ClaimOnce): Promise<void> {
  if (ctx.path !== '/two-factor/verify-totp') return;
  // Een interne aanroep (auth.api.verifyTOTP zonder HTTP-verzoek) is alleen de lokale dev-login, die TOTP met een vast
  // geheim al omzeilt (spec OV-3; src/core/api/auth/totp-claim.test.ts bewaakt dat er geen andere aanroeper bijkomt).
  if (ctx.request === undefined) return;
  const userId = await attemptUserId(ctx);
  if (userId === null) return;
  const key = totpKey(userId, codeFrom(ctx.body));
  if (key === null) return;
  // Zelfde antwoord als een foute code van Better Auth: geen orakel "deze code is al gebruikt".
  if (!(await claim(key, TOTP_REUSE_BLOCK_SECONDS)))
    throw new APIError('UNAUTHORIZED', { code: 'INVALID_CODE', message: 'Invalid code' });
}
