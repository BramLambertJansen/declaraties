import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

// Eenmalig gebruik (ADR 0075, spec inloggat-dichten): een TOTP-code en een link van de e-mailwijziging werken één keer.
// De claim gaat via app.claim_one_time_use (security definer, alleen voor auth_service); de primaire sleutel maakt hem
// atomair. Een sleutel bevat nooit de code of het token zelf, alleen een sha256-hash.

// true: de claim is nieuw; false: deze sleutel is al gebruikt. Een fout van de database gaat door (fail-closed).
export type ClaimOnce = (key: string, ttlSeconds: number) => Promise<boolean>;

export function createClaimOnce(database: Pool): ClaimOnce {
  return async (key, ttlSeconds) => {
    const result = await database.query<{ claimed: boolean }>('select app.claim_one_time_use($1, $2) as claimed', [
      key,
      ttlSeconds,
    ]);
    return result.rows[0]?.claimed === true;
  };
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const TOTP_CODE = /^\d{6}$/;

// De sleutel van een TOTP-code van deze gebruiker, of null als de invoer geen code van zes cijfers is (dan claimt de hook
// niet en weigert Better Auth zelf).
export function totpKey(userId: string, code: unknown): string | null {
  if (typeof code !== 'string' || !TOTP_CODE.test(code)) return null;
  return `totp:${sha256(`${userId}:${code}`)}`;
}

// Een HS256-handtekening is 32 bytes: in base64url zonder opvulling precies 43 tekens.
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/;

// De ondertekende inhoud (header.payload) van een JWT met de vorm van een HS256-token, of null. Zonder de handtekening: die heeft
// in base64url meer dan één geldige spelling (de laatste twee bits van het laatste teken tellen niet), en zo geven alle
// spellingen dezelfde sleutel. Een afgekapt token heeft niet deze vorm en wordt dus niet geclaimd.
export function signedPart(token: string): string | null {
  if (!JWT_SHAPE.test(token)) return null;
  return token.slice(0, token.lastIndexOf('.'));
}

// De sleutel van een link van de e-mailwijziging: actor plus ondertekende inhoud. De claim valt vóór de controle van de
// handtekening, dus een vervalst token kan alleen een sleutel van de actor zelf bezetten.
export function emailLinkKey(userId: string, signed: string): string {
  return `email-link:${sha256(`${userId}:${signed}`)}`;
}
