// Eerste admin en nooduitgang (spec accountbeheer; runbook docs/operations/eerste-admin.md). Werkt in elke omgeving, voor
// wie MIGRATOR_DATABASE_URL heeft. Nieuw adres: account + uitnodigingsmail; bestaand account: rol admin, optioneel
// 2FA wissen en/of een nieuwe wachtwoord-link (alle sessies vervallen dan).
// Gebruik: pnpm admin:create --email <adres> [--name "<naam>"] [--reset-mfa] [--reset-password]
import { parseArgs } from 'node:util';
import pg from 'pg';
import { invitationMail } from '../src/api/mail/invitation.ts';
import { createAuth, inviteUser } from '../src/core/api/auth/index.ts';
import { createSmtpMailer } from '../src/core/api/mail/smtp.ts';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    'reset-mfa': { type: 'boolean', default: false },
    'reset-password': { type: 'boolean', default: false },
  },
});

/** @param {string} name */
function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} ontbreekt`);
  return value;
}

const email = values.email?.trim().toLowerCase();
if (email === undefined || email === '') {
  console.error('Gebruik: pnpm admin:create --email <adres> [--name "<naam>"] [--reset-mfa] [--reset-password]');
  process.exit(2);
}

const origin = required('APP_ORIGIN');
const sendMail = createSmtpMailer(required('SMTP_URL'), `no-reply@${new URL(origin).hostname}`);
const auth = createAuth({
  origin,
  secret: required('AUTH_SECRET'),
  databaseUrl: required('AUTH_DATABASE_URL'),
  sendInvitation: (invitation) => sendMail(invitationMail(invitation)),
});
const context = await auth.$context;
const migrator = new pg.Pool({ connectionString: required('MIGRATOR_DATABASE_URL'), max: 1 });

try {
  const existing = await context.internalAdapter.findUserByEmail(email);
  if (existing === null) {
    const { userId } = await inviteUser(auth, { email, name: values.name ?? email });
    await migrator.query("select app.assign_role($1, 'admin')", [userId]);
    console.info(`✓ ${email}: nieuw admin-account; uitnodiging verstuurd (wachtwoord instellen, daarna TOTP).`);
  } else {
    const userId = existing.user.id;
    await migrator.query("select app.assign_role($1, 'admin')", [userId]);
    console.info(`✓ ${email}: rol admin`);
    if (values['reset-mfa']) {
      await context.adapter.deleteMany({ model: 'twoFactor', where: [{ field: 'userId', value: userId }] });
      await context.internalAdapter.updateUser(userId, { twoFactorEnabled: false });
      await context.internalAdapter.deleteUserSessions(userId);
      console.info('✓ 2FA gewist en sessies ingetrokken; bij de volgende login stelt de admin TOTP opnieuw in.');
    }
    if (values['reset-password']) {
      await auth.api.requestPasswordReset({ body: { email } });
      console.info('✓ link om een nieuw wachtwoord in te stellen verstuurd; na instellen vervallen alle sessies.');
    }
  }
} finally {
  await migrator.end();
}
process.exit(process.exitCode ?? 0);
