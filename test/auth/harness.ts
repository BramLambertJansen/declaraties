import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { buildApp } from '../../src/api/app.ts';
import { createServices } from '../../src/api/services.ts';
import { invitationMail } from '../../src/api/mail/invitation.ts';
import { authGateway, createAuth } from '../../src/core/api/auth/index.ts';
import { createPool, createWithUser } from '../../src/core/api/db/testing.ts';
import { createSmtpMailer } from '../../src/core/api/mail/smtp.ts';

// Testopzet voor de auth-integratietests (runner, ADR 0009): echte database als auth_service, echte SMTP naar Mailpit.
export function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} ontbreekt: draai via pnpm test:db`);
  return value;
}

export const APP_ORIGIN = required('APP_ORIGIN');

export function createTestApp() {
  const sendMail = createSmtpMailer(required('SMTP_URL'), 'no-reply@template.test');
  const auth = createAuth({
    origin: APP_ORIGIN,
    secret: required('AUTH_SECRET'),
    databaseUrl: required('AUTH_DATABASE_URL'),
    clientIpHeader: required('CLIENT_IP_HEADER'),
    sendInvitation: (invitation) => sendMail(invitationMail(invitation)),
    // Spec eigen-account: de algemene `sendMail` van AuthConfig (de vier mails van de e-mailwijziging). Als spread, zodat
    // dit ook compileert voordat de developer de optie toevoegt; daarna is het gewoon de optie.
    ...{ sendMail },
  });
  const pool = createPool(required('DATABASE_URL'));
  const withUser = createWithUser(pool);
  const services = createServices(auth);
  return {
    auth,
    pool,
    withUser,
    app: buildApp({ appOrigin: APP_ORIGIN, auth: authGateway(auth), withUser, services }),
  };
}

type App = ReturnType<typeof createTestApp>['app'];

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.${String(process.pid % 250)}.${String(Math.floor(ipCounter / 250))}.${String(ipCounter % 250)}`;
}

// Een browser met cookies, die de CSRF-headers stuurt zoals de SPA (ADR 0007).
export class Browser {
  readonly cookies = new Map<string, string>();
  private readonly app: App;
  // Elke browser een eigen IP, zodat de rate limit per test geldt (zoals bij echte clients).
  readonly ip = nextIp();

  constructor(app: App) {
    this.app = app;
  }

  async post(path: string, body: unknown = {}): Promise<Response> {
    return this.send(path, { method: 'POST', body: JSON.stringify(body) });
  }

  async get(path: string): Promise<Response> {
    return this.send(path, { method: 'GET' });
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers({
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
      origin: APP_ORIGIN,
    });
    headers.set(required('CLIENT_IP_HEADER'), this.ip);
    if (this.cookies.size > 0) {
      headers.set('cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    const response = await this.app.fetch(new Request(`${APP_ORIGIN}${path}`, { ...init, headers }));
    for (const line of response.headers.getSetCookie()) {
      const [pair = ''] = line.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (value === '' || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }
}

// RFC 6238 (SHA-1, 30 s, 6 cijfers); het geheim staat base32 in de otpauth-URI.
export function totp(otpauthUri: string, at = Date.now()): string {
  const secret = new URL(otpauthUri).searchParams.get('secret') ?? '';
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = (hmac.at(-1) ?? 0) & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7f_ff_ff_ff) % 1_000_000;
  return String(code).padStart(6, '0');
}

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of input.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

// Haalt de laatste mail aan dit adres uit Mailpit en geeft de tekst terug.
export async function latestMailTo(email: string): Promise<{ subject: string; text: string }> {
  const base = required('MAILPIT_URL');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const search = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages } = z
      .object({ messages: z.array(z.object({ ID: z.string(), Subject: z.string() })) })
      .parse(await search.json());
    const [latest] = messages;
    if (latest !== undefined) {
      const message = z
        .object({ Text: z.string() })
        .parse(await (await fetch(`${base}/api/v1/message/${latest.ID}`)).json());
      return { subject: latest.Subject, text: message.Text };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`geen mail aan ${email}`);
}

export function tokenFrom(text: string): string {
  const match = /\/uitnodiging\?token=([^\s]+)/.exec(text);
  if (match?.[1] === undefined) throw new Error('geen uitnodigingslink in de mail');
  return decodeURIComponent(match[1]);
}

let counter = 0;
export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(Date.now())}-${String(counter)}@template.test`;
}
