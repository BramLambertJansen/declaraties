import {
  confirmEmailContract,
  meContract,
  renameContract,
  revokeOtherSessionsContract,
  revokeSessionContract,
  sessionsListContract,
} from '#shared/contracts/me.ts';
import { defineRoute } from '../kit.ts';

// De actor komt uit de sessie en de rol uit de database (createApp); geen eigen query nodig.
export const meRoute = defineRoute(meContract, ({ actor }) => ({
  id: actor.userId,
  naam: actor.name,
  email: actor.email,
  rol: actor.role,
}));

// Spec eigen-account: altijd het eigen account (ctx.actor), via Better Auth (better_auth."user" is van auth_service).
export const renameRoute = defineRoute(renameContract, async ({ actor, input, services }) => {
  await services.profile.rename(actor.userId, input.naam);
  return null;
});

// Eigen sessies en e-mailwijziging (spec eigen-account): altijd via ctx.actor, nooit een ID uit de invoer voor wie het is.
export const sessionsListRoute = defineRoute(sessionsListContract, async ({ actor, services }) => {
  const sessions = await services.sessions.list(actor);
  return {
    items: sessions.map((session) => ({
      id: session.id,
      apparaat: session.device,
      aangemaakt: session.createdAt,
      laatstActief: session.lastActiveAt,
      huidig: session.current,
    })),
  };
});

export const revokeSessionRoute = defineRoute(revokeSessionContract, async ({ actor, input, services }) => {
  await services.sessions.revoke(actor, input.id);
  return null;
});

export const revokeOtherSessionsRoute = defineRoute(revokeOtherSessionsContract, async ({ actor, services }) => {
  await services.sessions.revokeOthers(actor);
  return null;
});

export const confirmEmailRoute = defineRoute(confirmEmailContract, async ({ actor, input, services, headers }) => {
  return { stap: await services.profile.confirmEmail(actor, input.token, headers) };
});
