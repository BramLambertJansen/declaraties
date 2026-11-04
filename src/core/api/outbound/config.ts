import { isIP } from 'node:net';
import {
  OUTBOUND_BUDGET_MAX_MS,
  OUTBOUND_BUDGET_MS,
  OUTBOUND_MAX_ATTEMPTS,
  OUTBOUND_MAX_ATTEMPTS_MAX,
  OUTBOUND_MAX_RESPONSE_BYTES,
  OUTBOUND_TIMEOUT_MAX_MS,
  OUTBOUND_TIMEOUT_MS,
} from '../../shared/limits.ts';
import { OutboundConfigError } from './errors.ts';
import { writeOutboundLine } from './log.ts';
import type { OutboundConfig, OutboundLog } from './types.ts';

// Opstartcontrole van createOutboundClient (spec uitgaande-client, Opstart). Elke fout is een OutboundConfigError.

export interface Target {
  readonly name: string;
  // Origin van baseUrl, bijv. `https://api.partner.nl`.
  readonly origin: string;
  // Padprefix van baseUrl zonder slot-`/`; leeg zonder prefix.
  readonly prefix: string;
  // De vaste headers van de app; per aanroep gekopieerd.
  readonly headers: Headers;
  readonly timeoutMs: number;
  readonly budgetMs: number;
  readonly maxAttempts: number;
  readonly maxResponseBytes: number;
  readonly log: OutboundLog;
}

const NAME = /^[a-z][a-z0-9-]*$/;

// Headers die de client zelf zet of die per verbinding gelden (RFC 9110 §7.6.1, plus Transfer-Encoding en Proxy-*).
const FORBIDDEN_HEADERS = new Set([
  'idempotency-key',
  'content-type',
  'content-length',
  'host',
  'connection',
  'proxy-connection',
  'keep-alive',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const fail = (message: string): never => {
  throw new OutboundConfigError(`createOutboundClient: ${message}`);
};

// `new URL('https://' + h).hostname`; null als dat niet lukt.
function normalizeHost(host: string): string | null {
  try {
    return new URL(`https://${host}`).hostname;
  } catch {
    return null;
  }
}

// Exacte hostnamen: geen schema, poort, pad, userinfo of `*`; daarna genormaliseerd.
const NOT_A_HOSTNAME = /[*/@?#\\]|:\d*$/;

function allowedHosts(hosts: readonly string[]): ReadonlySet<string> {
  if (hosts.length === 0) fail('hosts is leeg');
  return new Set(
    hosts.map((host) => {
      const normalized = normalizeHost(host);
      if (normalized === null || NOT_A_HOSTNAME.test(host))
        fail('hosts bevat een schema, poort, `*` of ongeldige naam');
      return normalized ?? '';
    }),
  );
}

function parseBaseUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return fail('baseUrl is geen geldige URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') fail('baseUrl moet http: of https: zijn');
  if (url.search !== '' || url.hash !== '' || baseUrl.includes('?') || baseUrl.includes('#')) {
    fail('baseUrl mag geen query of hash hebben');
  }
  if (url.username !== '' || url.password !== '') fail('baseUrl mag geen userinfo hebben');
  return url;
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  return isIP(bare) !== 0 || bare === 'localhost' || bare.endsWith('.localhost');
}

function checkTarget(config: OutboundConfig, url: URL): void {
  const hosts = allowedHosts(config.hosts);
  if (!hosts.has(normalizeHost(url.hostname) ?? '')) fail('de host van baseUrl staat niet in hosts');
  if (config.appEnv === 'local' || config.appEnv === 'test') return;
  if (url.protocol !== 'https:') fail('buiten local en test alleen https:');
  if (isLocalHost(url.hostname)) fail('buiten local en test geen IP-adres of localhost');
}

function fixedHeaders(headers: Readonly<Record<string, string>>): Headers {
  for (const name of Object.keys(headers)) {
    const lower = name.toLowerCase();
    if (FORBIDDEN_HEADERS.has(lower) || lower.startsWith('proxy-')) fail('headers bevat een header die niet mag');
  }
  try {
    return new Headers(headers);
  } catch {
    return fail('headers bevat een ongeldige naam of waarde');
  }
}

// Een grens is een geheel getal van 1 t/m de harde grens; zonder waarde de standaard.
function limit(value: number | undefined, fallback: number, max: number): number {
  const chosen = value ?? fallback;
  if (!Number.isInteger(chosen) || chosen < 1 || chosen > max) fail('een grens ligt buiten 1 t/m de harde grens');
  return chosen;
}

export function resolveConfig(config: OutboundConfig): Target {
  if (!NAME.test(config.name)) fail('name moet voldoen aan /^[a-z][a-z0-9-]*$/');
  const url = parseBaseUrl(config.baseUrl);
  checkTarget(config, url);
  const headers = fixedHeaders(config.headers ?? {});
  const timeoutMs = limit(config.timeoutMs, OUTBOUND_TIMEOUT_MS, OUTBOUND_TIMEOUT_MAX_MS);
  const budgetMs = limit(config.budgetMs, OUTBOUND_BUDGET_MS, OUTBOUND_BUDGET_MAX_MS);
  if (timeoutMs > budgetMs) fail('timeoutMs is groter dan budgetMs');
  return {
    name: config.name,
    origin: url.origin,
    prefix: url.pathname.replace(/\/+$/, ''),
    headers,
    timeoutMs,
    budgetMs,
    maxAttempts: limit(config.maxAttempts, OUTBOUND_MAX_ATTEMPTS, OUTBOUND_MAX_ATTEMPTS_MAX),
    maxResponseBytes: limit(config.maxResponseBytes, OUTBOUND_MAX_RESPONSE_BYTES, OUTBOUND_MAX_RESPONSE_BYTES),
    log: config.log ?? writeOutboundLine,
  };
}
