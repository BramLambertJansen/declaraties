import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { z } from 'zod';
import { createAuth, inviteUser } from '../../src/core/api/auth/index.ts';

// Hulp voor e2e/rate-limit.spec.ts (spec rate-limit/AC-6), alleen in de runner (ADR 0009).
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} ontbreekt (alleen in de runner: pnpm ui:check)`);
  return value;
}

// Uitnodigen buiten de UI en zonder mail (sendInvitation doet niets): de eerste mail aan dit adres komt dan van
// "Opnieuw uitnodigen", en de uitnodiging zelf telt niet mee in de rate limit van de admin.
const auth = createAuth({
  origin: required('APP_ORIGIN'),
  secret: required('AUTH_SECRET'),
  databaseUrl: required('AUTH_DATABASE_URL'),
  sendInvitation: () => Promise.resolve(),
});
const migrator = new pg.Pool({ connectionString: required('MIGRATOR_DATABASE_URL'), max: 1 });

export async function createInvitedAccount(): Promise<{ email: string }> {
  const email = `uitgenodigd-${randomUUID().slice(0, 8)}@e2e.test`;
  const { userId } = await inviteUser(auth, { name: 'Nog Niet Actief', email });
  await migrator.query('select app.assign_role($1, $2)', [userId, 'user']);
  return { email };
}

const search = z.object({ messages: z.array(z.object({ ID: z.string() })) });

// Het aantal mails aan dit adres in Mailpit.
export async function mailCount(email: string): Promise<number> {
  const query = encodeURIComponent(`to:"${email}"`);
  const response = await fetch(`${required('MAILPIT_URL')}/api/v1/search?query=${query}&limit=100`);
  return search.parse(await response.json()).messages.length;
}
