import { APIError } from 'better-auth/api';
import { z } from 'zod';
import { SESSION_ABSOLUTE_SECONDS } from '../../shared/limits.ts';
import type { Auth } from './auth.ts';
import { describeDevice } from './user-agent.ts';

// Het eigen account (spec eigen-account): naam wijzigen buiten /update-user om (dat endpoint is dicht: het accepteert ook
// `image` en kent de grenzen van de app niet), eigen sessies zonder tokens naar de browser (/list-sessions is dicht) en het
// bevestigen van een e-mailwijziging via de eigen POST-route (/verify-email is dicht). De route valideert de invoer; de
// gebruiker en de sessie komen uit ctx.actor, nooit uit de invoer.
export async function renameUser(auth: Auth, userId: string, name: string): Promise<void> {
  const context = await auth.$context;
  await context.internalAdapter.updateUser(userId, { name });
}

// Wie vraagt: de gebruiker en zijn huidige sessie, uit ctx.actor.
export interface SessionOwner {
  readonly userId: string;
  readonly sessionId: string;
}

export interface OwnSession {
  readonly id: string;
  readonly device: string;
  readonly createdAt: string;
  readonly lastActiveAt: string;
  readonly current: boolean;
}

// Een sessie die niet van deze gebruiker is of niet bestaat (zelfde fout: geen enumeratie).
export class SessionNotFoundError extends Error {}
// De eigen huidige sessie beëindig je met uitloggen, niet hier.
export class CurrentSessionError extends Error {}
// Verlopen, vervalst, al gebruikt of van een ander account.
export class EmailLinkInvalidError extends Error {
  constructor(options?: ErrorOptions) {
    super('EMAIL_LINK_INVALID', options);
  }
}

// Nieuwste eerst. Sessies ouder dan de absolute duur weigert authGateway.getSession al, dus ze staan er niet in.
export async function listOwnSessions(auth: Auth, who: SessionOwner, now: number = Date.now()): Promise<OwnSession[]> {
  const { internalAdapter } = await auth.$context;
  const sessions = await internalAdapter.listSessions(who.userId, { onlyActiveSessions: true });
  return sessions
    .filter(
      (session) =>
        session.expiresAt.getTime() > now && now - session.createdAt.getTime() <= SESSION_ABSOLUTE_SECONDS * 1000,
    )
    .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((session) => ({
      id: session.id,
      device: describeDevice(session.userAgent),
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.updatedAt.toISOString(),
      current: session.id === who.sessionId,
    }));
}

export async function revokeOwnSession(auth: Auth, who: SessionOwner, id: string): Promise<void> {
  const { internalAdapter } = await auth.$context;
  const target = (await internalAdapter.listSessions(who.userId)).find((session) => session.id === id);
  if (target === undefined) throw new SessionNotFoundError();
  if (target.id === who.sessionId) throw new CurrentSessionError();
  await internalAdapter.deleteSession(target.token);
}

export async function revokeOtherSessions(auth: Auth, who: SessionOwner): Promise<void> {
  const { internalAdapter } = await auth.$context;
  const others = (await internalAdapter.listSessions(who.userId)).filter((session) => session.id !== who.sessionId);
  if (others.length > 0) await internalAdapter.deleteSessions(others.map((session) => session.token));
}

// De twee soorten link van een e-mailwijziging; alleen deze stappen bevestigt de route (een gewone verificatielink niet).
const STEPS: ReadonlyMap<string, 'oud' | 'nieuw'> = new Map([
  ['change-email-confirmation', 'oud'],
  ['change-email-verification', 'nieuw'],
]);

const tokenPayload = z.object({ email: z.string(), updateTo: z.string(), requestType: z.string() });

// Het token is een JWT; de handtekening controleert Better Auth zelf in verifyEmail. Hier alleen wat we nodig hebben.
function readToken(token: string): { step: 'oud' | 'nieuw'; oldEmail: string; newEmail: string } {
  try {
    const [, payload = ''] = token.split('.');
    const parsed = tokenPayload.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    const step = STEPS.get(parsed.requestType);
    if (step === undefined) throw new EmailLinkInvalidError();
    return { step, oldEmail: parsed.email, newEmail: parsed.updateTo };
  } catch (error) {
    throw error instanceof EmailLinkInvalidError ? error : new EmailLinkInvalidError();
  }
}

function isUniqueViolation(error: unknown): boolean {
  for (let current = error, depth = 0; depth < 3 && typeof current === 'object' && current !== null; depth += 1) {
    if ('code' in current && current.code === '23505') return true;
    current = 'cause' in current ? current.cause : null;
  }
  return false;
}

export interface ConfirmEmailInput extends SessionOwner {
  readonly name: string;
  readonly token: string;
  // De headers van het verzoek: Better Auth controleert dat de link bij de ingelogde gebruiker hoort (INVALID_USER).
  readonly headers: Headers;
}

// Stap 1 (oud adres) stuurt de link naar het nieuwe adres; stap 2 wijzigt het adres, trekt de andere sessies in en meldt het
// oude adres (OV-7). Elke fout van Better Auth (verlopen, vervalst, andere gebruiker, onbekend account) en een adres dat
// tussendoor bezet raakte (23505) is één fout: EmailLinkInvalidError.
export async function confirmEmail(auth: Auth, input: ConfirmEmailInput): Promise<'oud' | 'nieuw'> {
  const { step, oldEmail, newEmail } = readToken(input.token);
  try {
    await auth.api.verifyEmail({ query: { token: input.token }, headers: input.headers });
  } catch (error) {
    if (error instanceof APIError || isUniqueViolation(error)) throw new EmailLinkInvalidError({ cause: error });
    throw error;
  }
  if (step === 'nieuw') {
    await revokeOtherSessions(auth, input);
    // Een mislukte melding maakt de wijziging niet ongedaan: het adres is al gewijzigd.
    await auth.mailing?.changed({ name: input.name, email: oldEmail }, newEmail).catch((error: unknown) => {
      console.warn(`e-mailwijziging: melding aan het oude adres mislukt (${String(error)})`);
    });
  }
  return step;
}
