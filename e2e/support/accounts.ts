import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import { createAuth } from '../../src/core/api/auth/index.ts';
import { ensureAccount } from '../../src/core/api/dev/ensure-account.ts';

// Accounts voor de e2e-tests in de runner (ADR 0044): direct via Better Auth en app.assign_role, zoals de lokale seed.
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} ontbreekt (alleen in de runner: pnpm ui:check)`);
  return value;
}

const auth = createAuth({
  origin: required('APP_ORIGIN'),
  secret: required('AUTH_SECRET'),
  databaseUrl: required('AUTH_DATABASE_URL'),
  sendInvitation: () => Promise.resolve(),
});
const migrator = new pg.Pool({ connectionString: required('MIGRATOR_DATABASE_URL'), max: 1 });

// Elke test is een eigen client voor de rate limit van Better Auth (framework §6): een eigen IP in CLIENT_IP_HEADER,
// zoals de host die in productie zet. Anders delen alle tests één teller en krijgt de vierde login RATE_LIMITED.
let clients = 0;
export function clientIpHeaders(): Record<string, string> {
  clients += 1;
  return { [required('CLIENT_IP_HEADER')]: `10.20.${String(process.pid % 250)}.${String(clients % 250)}` };
}

// Demo-wachtwoord, opgebouwd zodat het geen geheim lijkt (Betterleaks).
export const PASSWORD = 'e2e-'.repeat(4);

export interface TestAccount {
  readonly email: string;
  readonly name: string;
  readonly totpSecret?: string;
}

export async function createAccount(
  role: 'user' | 'admin',
  options: { readonly totp?: boolean; readonly name?: string } = {},
): Promise<TestAccount> {
  const id = randomUUID().slice(0, 8);
  const email = `${role}-${id}@e2e.test`;
  const name = options.name ?? (role === 'admin' ? 'Eva Beheer' : 'Gert Gebruiker');
  const totpSecret = options.totp === true ? `e2e-totp-${id}`.padEnd(32, '0') : undefined;
  const { userId } = await ensureAccount(auth, {
    email,
    name,
    password: PASSWORD,
    ...(totpSecret === undefined ? {} : { totpSecret }),
  });
  await migrator.query('select app.assign_role($1, $2)', [userId, role]);
  return { email, name, ...(totpSecret === undefined ? {} : { totpSecret }) };
}

// RFC 6238 zoals Better Auth: de sleutel is de tekst van het geheim als bytes.
export function totpFor(secret: Buffer | string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac('sha1', typeof secret === 'string' ? Buffer.from(secret, 'utf8') : secret)
    .update(counter)
    .digest();
  const offset = (hmac.at(-1) ?? 0) & 0x0f;
  return String((hmac.readUInt32BE(offset) & 0x7f_ff_ff_ff) % 1_000_000).padStart(6, '0');
}

// De sleutel op het scherm "Tweestapsverificatie instellen" is base32 (zoals in de otpauth-URI).
export function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of input.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
}

// De link uit de laatste mail aan dit adres (Mailpit in de runner).
export async function invitationLink(email: string): Promise<string> {
  const base = required('MAILPIT_URL');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const search = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const found: unknown = await search.json();
    const id = idOfFirst(found);
    if (id !== null) {
      const message: unknown = await (await fetch(`${base}/api/v1/message/${id}`)).json();
      const text = typeof message === 'object' && message !== null && 'Text' in message ? String(message.Text) : '';
      const link = /https?:\/\/\S+\/uitnodiging\?token=\S+/.exec(text)?.[0];
      if (link !== undefined) return new URL(link).pathname + new URL(link).search;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`geen uitnodiging aan ${email}`);
}

function idOfFirst(found: unknown): string | null {
  if (typeof found !== 'object' || found === null || !('messages' in found) || !Array.isArray(found.messages))
    return null;
  const first: unknown = found.messages[0];
  return typeof first === 'object' && first !== null && 'ID' in first && typeof first.ID === 'string' ? first.ID : null;
}
