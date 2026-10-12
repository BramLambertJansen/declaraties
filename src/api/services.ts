import {
  AccountAlreadyActiveError,
  AccountExistsError,
  AccountNotFoundError,
  confirmEmail,
  CurrentSessionError,
  EmailLinkInvalidError,
  inviteUser,
  listOwnSessions,
  reinviteUser,
  renameUser,
  revokeOtherSessions,
  revokeOwnSession,
  SessionNotFoundError,
  type Auth,
  type OwnSession,
  type SessionOwner,
} from '#core/api/auth/index.ts';
import { AppError } from '#core/api/errors.ts';

// Wat handlers via ctx.services krijgen (ADR 0008): uitnodigen via Better Auth (ADR 0013). De fouten van core worden hier
// foutcodes uit het register; de handler vangt niets af.
export interface AppServices {
  readonly invitations: {
    readonly invite: (
      input: { readonly name: string; readonly email: string },
      beforeMail: (userId: string) => Promise<void>,
    ) => Promise<{ userId: string }>;
    readonly reinvite: (userId: string) => Promise<void>;
  };
  // Het eigen account (spec eigen-account); userId komt altijd uit ctx.actor.
  readonly profile: {
    readonly rename: (userId: string, name: string) => Promise<void>;
    // Stap 1 of 2 van een e-mailwijziging; headers: die van het verzoek (Better Auth leest de sessie eruit).
    readonly confirmEmail: (
      who: SessionOwner & { readonly name: string },
      token: string,
      headers: Headers,
    ) => Promise<'oud' | 'nieuw'>;
  };
  // De eigen sessies (spec eigen-account); who komt altijd uit ctx.actor. Nooit tokens of IP naar buiten.
  readonly sessions: {
    readonly list: (who: SessionOwner) => Promise<OwnSession[]>;
    readonly revoke: (who: SessionOwner, id: string) => Promise<void>;
    readonly revokeOthers: (who: SessionOwner) => Promise<void>;
    // Alle sessies van een account, na het blokkeren (ADR 0026); opruimen als auth_service, de garantie zit in getSession.
    readonly revokeAll: (userId: string) => Promise<void>;
  };
}

function translate(error: unknown): unknown {
  if (error instanceof AccountExistsError) return new AppError('ALREADY_EXISTS', { cause: error });
  if (error instanceof AccountNotFoundError) return new AppError('NOT_FOUND', { cause: error });
  if (error instanceof AccountAlreadyActiveError) return new AppError('ALREADY_ACTIVE', { cause: error });
  if (error instanceof SessionNotFoundError) return new AppError('NOT_FOUND', { cause: error });
  if (error instanceof CurrentSessionError) return new AppError('VALIDATION', { cause: error });
  if (error instanceof EmailLinkInvalidError) return new AppError('EMAIL_LINK_INVALID', { cause: error });
  return error;
}

// Zet een fout van core om in een foutcode uit het register; de handler vangt niets af.
function translated<T>(work: Promise<T>): Promise<T> {
  return work.catch((error: unknown) => {
    throw translate(error);
  });
}

export function createServices(auth: Auth): AppServices {
  return {
    invitations: {
      invite: (input, beforeMail) =>
        inviteUser(auth, input, beforeMail).catch((error: unknown) => {
          throw translate(error);
        }),
      reinvite: (userId) =>
        reinviteUser(auth, userId).catch((error: unknown) => {
          throw translate(error);
        }),
    },
    profile: {
      rename: (userId, name) => renameUser(auth, userId, name),
      confirmEmail: (who, token, headers) => translated(confirmEmail(auth, { ...who, token, headers })),
    },
    sessions: {
      list: (who) => listOwnSessions(auth, who),
      revoke: (who, id) => translated(revokeOwnSession(auth, who, id)),
      revokeOthers: (who) => revokeOtherSessions(auth, who),
      revokeAll: async (userId) => {
        await (await auth.$context).internalAdapter.deleteUserSessions(userId);
      },
    },
  };
}
