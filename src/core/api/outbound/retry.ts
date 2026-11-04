import { OUTBOUND_BACKOFF_BASE_MS, OUTBOUND_BACKOFF_MAX_MS } from '../../shared/limits.ts';

// Herhalen (spec uitgaande-client, Herhalen): welke statussen, hoe lang wachten, en past dat in het budget.

const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504]);

export function retryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

// Een minimale poging: past de wachttijd plus dit niet meer in het restbudget, dan stopt de client.
const MIN_ATTEMPT_MS = 250;

export function minimalAttemptMs(timeoutMs: number): number {
  return Math.min(timeoutMs, MIN_ATTEMPT_MS);
}

// Full jitter: willekeurig tussen 0 en min(max, basis × 2^(n−1)); n is de poging die net afliep (vanaf 1).
export function backoffMs(attempt: number): number {
  const ceiling = Math.min(OUTBOUND_BACKOFF_MAX_MS, OUTBOUND_BACKOFF_BASE_MS * 2 ** (attempt - 1));
  return Math.random() * ceiling;
}

const DELAY_SECONDS = /^\d+$/;
// IMF-fixdate, RFC 850 en asctime beginnen alle drie met de dag van de week (RFC 9110 §5.6.7).
const HTTP_DATE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,? /;
const SECOND_MS = 1000;

// Retry-After in milliseconden: gehele seconden, of een HTTP-datum naar boven afgerond op seconden (in het verleden: 0).
// Ongeldig of afwezig: null, dan geldt de backoff.
export function retryAfterMs(value: string | null, now: number): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (DELAY_SECONDS.test(trimmed)) return Number(trimmed) * SECOND_MS;
  if (!HTTP_DATE.test(trimmed)) return null;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - now) / SECOND_MS) * SECOND_MS);
}
