import type { Auth } from './auth.ts';

// Uitnodigen via de reset-flow van Better Auth (ADR 0043): de gebruiker bestaat meteen, zonder credential-account
// (status "uitgenodigd"), en krijgt een eenmalige link om zijn wachtwoord in te stellen.

export class AccountAlreadyActiveError extends Error {
  constructor() {
    super('Dit account is al actief');
  }
}

export class AccountExistsError extends Error {
  constructor() {
    super('Er bestaat al een account met dit e-mailadres');
  }
}

export class AccountNotFoundError extends Error {
  constructor() {
    super('Account bestaat niet');
  }
}

export interface InvitationLifecycle {
  readonly afterCommit: (effect: () => Promise<unknown>) => void;
  readonly afterRollback: (effect: () => Promise<unknown>) => void;
}

interface InvitationSetup extends Partial<InvitationLifecycle> {
  readonly beforeMail: (userId: string) => Promise<void>;
}

// Routes registreren mail na commit en compensatie na rollback (geen delete die op hun eigen FK-lock wacht).
// Rechtstreekse aanroepen zonder app-transactie blijven synchroon, met cleanup bij iedere fout vóór succes.
export async function inviteUser(
  auth: Auth,
  input: { name: string; email: string },
  setup: InvitationSetup | ((userId: string) => Promise<void>) = () => Promise.resolve(),
): Promise<{ userId: string }> {
  const steps: InvitationSetup = typeof setup === 'function' ? { beforeMail: setup } : setup;
  const context = await auth.$context;
  const email = input.email.toLowerCase();
  if ((await context.internalAdapter.findUserByEmail(email)) !== null) throw new AccountExistsError();
  // Uniek op e-mail in de database: van twee gelijktijdige uitnodigingen slaagt er één (23505 → ALREADY_EXISTS).
  const user = await context.internalAdapter.createUser(
    { name: input.name, email, emailVerified: false },
    { method: 'admin' },
  );
  const cleanup = () => context.internalAdapter.deleteUser(user.id);
  steps.afterRollback?.(cleanup);
  try {
    await steps.beforeMail(user.id);
    const send = () => auth.api.requestPasswordReset({ body: { email: user.email } });
    if (steps.afterCommit === undefined) await send();
    else steps.afterCommit(send);
  } catch (error) {
    if (steps.afterRollback === undefined) await cleanup();
    throw error;
  }
  return { userId: user.id };
}

// Met lifecycle.afterCommit gaan tokenverwijdering en mail pas na commit van de route-transactie (een trage mailserver
// houdt dan geen transactie vast); de controles blijven synchroon en gooien vóór er iets geregistreerd wordt.
export async function reinviteUser(
  auth: Auth,
  userId: string,
  lifecycle?: Pick<InvitationLifecycle, 'afterCommit'>,
): Promise<void> {
  const context = await auth.$context;
  const user = await context.internalAdapter.findUserById(userId);
  if (user === null) throw new AccountNotFoundError();
  if ((await context.internalAdapter.findCredentialAccount(userId)) !== null) throw new AccountAlreadyActiveError();
  const resend = async () => {
    // Alleen de nieuwste link werkt: oude reset-tokens van deze gebruiker gaan eerst weg.
    await context.adapter.deleteMany({
      model: 'verification',
      where: [
        { field: 'value', value: userId },
        { field: 'identifier', operator: 'starts_with', value: 'reset-password:' },
      ],
    });
    await auth.api.requestPasswordReset({ body: { email: user.email } });
  };
  if (lifecycle === undefined) await resend();
  else lifecycle.afterCommit(resend);
}
