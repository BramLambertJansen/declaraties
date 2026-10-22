import { z } from 'zod';

// Enige plek met process.env (framework §4). Het schema draait bij opstart: `env()` faalt met alle fouten tegelijk.
// Een app breidt uit met `readEnv(eigenSchema)` vanuit src/api/env.ts (ADR 0040).

const DEFAULT_API_PORT = 8787;
// Lokaal alleen bereikbaar vanaf de eigen machine; een containerimage zet API_HOST=0.0.0.0 expliciet.
const DEFAULT_API_HOST = '127.0.0.1';
// Ruim binnen de gebruikelijke 30 s die een containerhost na SIGTERM geeft.
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;
const MAX_SHUTDOWN_TIMEOUT_MS = 120_000;
const MIN_SECRET_BYTES = 32;

// Demo-waarden uit .env.example, db/init en compose: buiten local/test geweigerd (framework §6, Secrets).
// Bewust hier als lijst, niet ingelezen uit .env.example: dat bestand kan een agent aanpassen.
export const DEMO_SECRET_PARTS: readonly string[] = ['demo', 'change-per-environment', 'changeme', 'change-me'];
export const DEMO_DB_PASSWORDS: readonly string[] = [
  'postgres',
  'app_migrator',
  'api_user',
  'auth_service',
  'password',
];

export function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Ongeldige poort: ${value}`);
  }
  return port;
}

const url = z.string().refine((value) => URL.canParse(value), 'geen geldige URL');
const origin = url.refine(
  (value) => new URL(value).origin === value,
  'alleen schema, host en poort, zonder slash achteraan',
);
// Een lege waarde in een .env-bestand telt als niet gezet, net als bij API_PORT.
const unsetIfEmpty = (value: unknown): unknown => (value === '' ? undefined : value);
const databaseUrl = url.refine((value) => /^postgres(ql)?:$/.test(new URL(value).protocol), 'geen postgres-URL');

const baseSchema = z.object({
  APP_ENV: z.enum(['local', 'test', 'staging', 'production']),
  APP_ORIGIN: origin,
  API_HOST: z.preprocess(unsetIfEmpty, z.union([z.ipv4(), z.ipv6(), z.hostname()]).default(DEFAULT_API_HOST)),
  API_PORT: z
    .string()
    .optional()
    .transform((value, ctx) => {
      try {
        return parsePort(value, DEFAULT_API_PORT);
      } catch {
        ctx.addIssue({ code: 'custom', message: `ongeldige poort: ${String(value)}` });
        return z.NEVER;
      }
    }),
  SHUTDOWN_TIMEOUT_MS: z.preprocess(
    unsetIfEmpty,
    z.coerce.number().int().min(1).max(MAX_SHUTDOWN_TIMEOUT_MS).default(DEFAULT_SHUTDOWN_TIMEOUT_MS),
  ),
  DATABASE_URL: databaseUrl,
  AUTH_DATABASE_URL: databaseUrl,
  AUTH_BASE_URL: origin,
  AUTH_SECRET: z.string().min(1),
  SMTP_URL: url,
  // Map met de build van de SPA (dist/web); gezet = de server serveert de SPA naast /api op één origin (ADR 0049).
  // Lokaal leeg: dan serveert Vite de SPA.
  WEB_DIR: z.preprocess(unsetIfEmpty, z.string().min(1).optional()),
  // Header met het client-IP die de host zet en de client niet kan vervalsen (framework §6, Verharding); voor de rate limit.
  CLIENT_IP_HEADER: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'kleine letters, cijfers en streepjes')
    .optional(),
});

type RawEnv = z.infer<typeof baseSchema>;
type Issue = (path: keyof RawEnv, message: string) => void;

function checkSecrets(raw: RawEnv, issue: Issue): void {
  if (Buffer.byteLength(raw.AUTH_SECRET) < MIN_SECRET_BYTES)
    issue('AUTH_SECRET', `korter dan ${String(MIN_SECRET_BYTES)} bytes`);
  const lower = raw.AUTH_SECRET.toLowerCase();
  if (DEMO_SECRET_PARTS.some((part) => lower.includes(part))) issue('AUTH_SECRET', 'bevat een demo-waarde');
  for (const key of ['DATABASE_URL', 'AUTH_DATABASE_URL'] as const) {
    const parsed = new URL(raw[key]);
    const password = decodeURIComponent(parsed.password);
    if (password === '' || password === decodeURIComponent(parsed.username) || DEMO_DB_PASSWORDS.includes(password)) {
      issue(key, 'leeg of demo-wachtwoord');
    }
  }
  for (const key of ['APP_ORIGIN', 'AUTH_BASE_URL'] as const) {
    if (new URL(raw[key]).protocol !== 'https:') issue(key, 'moet https zijn');
  }
  if (raw.AUTH_BASE_URL !== raw.APP_ORIGIN) issue('AUTH_BASE_URL', 'moet gelijk zijn aan APP_ORIGIN');
  if (raw.CLIENT_IP_HEADER === undefined) issue('CLIENT_IP_HEADER', 'verplicht: anders werkt de rate limit niet');
}

// Buiten local en test gelden de secrets-regels (framework §6); lokaal zijn de demo-waarden juist de bedoeling.
export const envSchema = baseSchema.superRefine((raw, ctx) => {
  if (raw.APP_ENV === 'local' || raw.APP_ENV === 'test') return;
  checkSecrets(raw, (path, message) => {
    ctx.addIssue({ code: 'custom', path: [path], message });
  });
});

export interface Env {
  readonly appEnv: RawEnv['APP_ENV'];
  readonly appOrigin: string;
  readonly apiHost: string;
  readonly apiPort: number;
  readonly shutdownTimeoutMs: number;
  readonly databaseUrl: string;
  readonly authDatabaseUrl: string;
  readonly authBaseUrl: string;
  readonly authSecret: string;
  readonly smtpUrl: string;
  readonly clientIpHeader: string | undefined;
  readonly webDir: string | undefined;
}

function describe(error: z.ZodError): string {
  return error.issues.map((issue) => `- ${issue.path.join('.') || '(env)'}: ${issue.message}`).join('\n');
}

export function parseEnv(source: Readonly<Record<string, string | undefined>>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) throw new Error(`Ongeldige omgeving (env):\n${describe(result.error)}`);
  const raw = result.data;
  return {
    appEnv: raw.APP_ENV,
    appOrigin: raw.APP_ORIGIN,
    apiHost: raw.API_HOST,
    apiPort: raw.API_PORT,
    shutdownTimeoutMs: raw.SHUTDOWN_TIMEOUT_MS,
    databaseUrl: raw.DATABASE_URL,
    authDatabaseUrl: raw.AUTH_DATABASE_URL,
    authBaseUrl: raw.AUTH_BASE_URL,
    authSecret: raw.AUTH_SECRET,
    smtpUrl: raw.SMTP_URL,
    clientIpHeader: raw.CLIENT_IP_HEADER,
    webDir: raw.WEB_DIR,
  };
}

// Leest en controleert process.env; alleen bij opstart aanroepen (server.ts, db/index.ts), niet per request.
export function env(): Env {
  return parseEnv(process.env);
}

export interface SignalHost {
  readonly once: (signal: NodeJS.Signals, listener: () => void) => unknown;
  readonly exit: (code: number) => void;
}

const processHost: SignalHost = {
  once: (signal, listener) => process.once(signal, listener),
  exit: (code) => process.exit(code),
};

// Signalen van de host (SIGTERM) en Ctrl+C (SIGINT) voor startServer: process alleen hier (framework §4). Na de afhandeling
// eindigt het proces expliciet (0, of 1 bij een fout), ook als er nog een verbinding openstaat. Een tweede keer hetzelfde signaal
// stopt direct (standaardgedrag van Node). host is alleen voor tests.
export function onProcessSignal(
  signal: NodeJS.Signals,
  handle: () => Promise<void>,
  host: SignalHost = processHost,
): void {
  host.once(signal, () => {
    handle().then(
      () => {
        host.exit(0);
      },
      (error: unknown) => {
        console.error(`${signal}: afhandeling mislukt`, error);
        host.exit(1);
      },
    );
  });
}

// Uitbreidingsplek voor de app (ADR 0040): src/api/env.ts geeft een eigen schema mee.
export function readEnv<T>(schema: z.ZodType<T>): T {
  const result = schema.safeParse(process.env);
  if (!result.success) throw new Error(`Ongeldige omgeving (app-env):\n${describe(result.error)}`);
  return result.data;
}
