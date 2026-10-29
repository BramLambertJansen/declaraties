import { symmetricEncrypt } from 'better-auth/crypto';
import type { Auth } from '../auth/auth.ts';

// Een account met wachtwoord (en eventueel een vast TOTP-geheim), idempotent. Voor de lokale seed (scripts/seed.mjs, die
// buiten APP_ENV=local weigert) en de e2e-tests in de runner. Nooit vanuit de API aanroepen.
export interface EnsureAccountInput {
  readonly email: string;
  readonly name: string;
  readonly password: string;
  // Alleen voor een admin met TOTP: het geheim als tekst, zoals Better Auth het maakt (32 tekens).
  readonly totpSecret?: string;
}

export async function ensureAccount(auth: Auth, input: EnsureAccountInput): Promise<{ userId: string }> {
  const context = await auth.$context;
  const existing = await context.internalAdapter.findUserByEmail(input.email);
  let userId = existing?.user.id;
  if (userId === undefined) {
    const created = await context.internalAdapter.createUser(
      { email: input.email, name: input.name, emailVerified: true },
      { method: 'admin' },
    );
    await context.internalAdapter.createAccount({
      userId: created.id,
      providerId: 'credential',
      accountId: created.id,
      password: await context.password.hash(input.password),
    });
    userId = created.id;
  }
  if (input.totpSecret !== undefined) await ensureTotp(auth, userId, input.totpSecret);
  return { userId };
}

async function ensureTotp(auth: Auth, userId: string, secret: string): Promise<void> {
  const context = await auth.$context;
  const existing = await context.adapter.findOne({ model: 'twoFactor', where: [{ field: 'userId', value: userId }] });
  if (existing !== null) return;
  await context.adapter.create({
    model: 'twoFactor',
    data: {
      userId,
      secret: await symmetricEncrypt({ key: context.secretConfig, data: secret }),
      backupCodes: '[]',
      verified: true,
    },
  });
  await context.internalAdapter.updateUser(userId, { twoFactorEnabled: true });
}
