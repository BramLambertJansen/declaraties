import { createHmac } from 'node:crypto';

// RFC 6238 (SHA-1, 30 s, 6 cijfers), zoals Better Auth: de sleutel is de tekst van het geheim als bytes. Alleen voor de
// dev-login met het vaste lokale geheim (seed-accounts.ts).
export function totpCode(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac('sha1', Buffer.from(secret, 'utf8')).update(counter).digest();
  const offset = (hmac.at(-1) ?? 0) & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7f_ff_ff_ff) % 1_000_000;
  return String(code).padStart(6, '0');
}
