import { z } from 'zod';

// Enige plek met process.env (framework §4). Het schema draait bij opstart: `env()` faalt met alle fouten tegelijk.
// Een app breidt uit met `readEnv(eigenSchema)` of `readEnv((ctx) => …)` met `secret(ctx)` vanuit src/api/env.ts (ADR 0040, 0077).

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

type AppEnvName = RawEnv['APP_ENV'];

export interface SecretRules {
  readonly minBytes: number;
  readonly livePattern?: RegExp | undefined;
  readonly testPattern?: RegExp | undefined;
}

// Eén regelset voor elk geheim (spec geheimen-in-env, ADR 0077): meldingen noemen de regel, nooit de waarde of het patroon.
export function secretIssues(value: string, appEnv: AppEnvName, rules: SecretRules): string[] {
  const issues: string[] = [];
  const strict = appEnv === 'staging' || appEnv === 'production';
  if (strict && Buffer.byteLength(value) < rules.minBytes) issues.push(`korter dan ${String(rules.minBytes)} bytes`);
  const lower = value.toLowerCase();
  if (strict && DEMO_SECRET_PARTS.some((part) => lower.includes(part))) issues.push('bevat een demo-waarde');
  if (appEnv !== 'production' && rules.livePattern?.test(value) === true) issues.push('live-sleutel buiten production');
  if (appEnv === 'production' && rules.testPattern?.test(value) === true) issues.push('testsleutel in production');
  return issues;
}

function checkSecrets(raw: RawEnv, issue: Issue): void {
  for (const message of secretIssues(raw.AUTH_SECRET, raw.APP_ENV, { minBytes: MIN_SECRET_BYTES })) {
    issue('AUTH_SECRET', message);
  }
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

// Alleen readEnv maakt een context, dus een app kan geen vaste omgeving meegeven (spec geheimen-in-env).
class EnvContext {
  readonly #appEnv: AppEnvName;
  constructor(appEnv: AppEnvName) {
    this.#appEnv = appEnv;
  }
  get appEnv(): AppEnvName {
    return this.#appEnv;
  }
}
export type { EnvContext };

const HIDDEN = '[geheim]';

// Geheim van een koppeling: de waarde staat alleen in het privéveld en komt er alleen uit via reveal().
export class Secret {
  readonly #value: string;
  constructor(value: string) {
    this.#value = value;
  }
  reveal(): string {
    return this.#value;
  }
  toString(): string {
    return HIDDEN;
  }
  toJSON(): string {
    return HIDDEN;
  }
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return HIDDEN;
  }
}

export interface SecretOptions {
  readonly minBytes?: number;
  readonly livePattern?: RegExp;
  readonly testPattern?: RegExp;
}

function assertSecretOptions(options: SecretOptions): void {
  const { minBytes } = options;
  if (minBytes !== undefined && (!Number.isInteger(minBytes) || minBytes < MIN_SECRET_BYTES)) {
    throw new Error(`secret(): minBytes lager dan ${String(MIN_SECRET_BYTES)}`);
  }
  for (const pattern of [options.livePattern, options.testPattern]) {
    if (pattern !== undefined && (pattern.global || pattern.sticky))
      throw new Error('secret(): patroon met vlag g of y');
  }
}

// Het enige schema voor een geheim van een koppeling (ADR 0077): overal verplicht, verder de regels uit secretIssues.
export function secret(ctx: EnvContext, options: SecretOptions = {}): z.ZodType<Secret> {
  assertSecretOptions(options);
  const appEnv = ctx.appEnv;
  const rules: SecretRules = {
    minBytes: options.minBytes ?? MIN_SECRET_BYTES,
    livePattern: options.livePattern,
    testPattern: options.testPattern,
  };
  return z
    .string({ error: 'verplicht' })
    .min(1, { error: 'verplicht', abort: true })
    .superRefine((value, refine) => {
      for (const message of secretIssues(value, appEnv, rules)) refine.addIssue({ code: 'custom', message });
    })
    .transform((value) => new Secret(value));
}

const appEnvSchema = z.object({ APP_ENV: baseSchema.shape.APP_ENV });

// Uitbreidingsplek voor de app (ADR 0040): src/api/env.ts geeft een eigen schema mee, of een functie die een EnvContext krijgt.
// Gewone Error zonder cause en zonder reportInput: een melding bevat nooit een waarde (spec geheimen-in-env).
export function readEnv<T>(schema: z.ZodType<T> | ((ctx: EnvContext) => z.ZodType<T>)): T {
  if (typeof schema === 'function') {
    const context = appEnvSchema.safeParse(process.env);
    if (!context.success) throw new Error(`Ongeldige omgeving (app-env):\n${describe(context.error)}`);
    return readEnv(schema(new EnvContext(context.data.APP_ENV)));
  }
  const result = schema.safeParse(process.env);
  if (!result.success) throw new Error(`Ongeldige omgeving (app-env):\n${describe(result.error)}`);
  return result.data;
}
