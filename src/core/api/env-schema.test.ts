import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { parseEnv, readEnv } from './env.ts';

// Secrets-regels uit framework §6: buiten local/test weigert het env-schema bij opstart elke regel apart.
const production = {
  APP_ENV: 'production',
  APP_ORIGIN: 'https://app.example.com',
  AUTH_BASE_URL: 'https://app.example.com',
  // Testwaarden uit herhaling: lang genoeg voor het schema, zonder te lijken op een echt geheim (Betterleaks).
  AUTH_SECRET: 'ab12'.repeat(10),
  DATABASE_URL: 'postgres://api_user:Kp4wQ9zL2xR7@db.example.com:5432/app',
  AUTH_DATABASE_URL: 'postgres://auth_service:Vb8nM3cT6yH1@db.example.com:5432/app',
  SMTP_URL: 'smtp://mail.example.com:587',
  CLIENT_IP_HEADER: 'x-real-ip',
};

const local = {
  APP_ENV: 'local',
  APP_ORIGIN: 'http://localhost:5173',
  AUTH_BASE_URL: 'http://localhost:5173',
  AUTH_SECRET: 'local-demo-secret-change-per-environment-000000',
  DATABASE_URL: 'postgres://api_user:api_user@127.0.0.1:54322/app',
  AUTH_DATABASE_URL: 'postgres://auth_service:auth_service@127.0.0.1:54322/app',
  SMTP_URL: 'smtp://127.0.0.1:54325',
};

describe('env-schema', () => {
  test('een geldige productie-omgeving wordt geaccepteerd', () => {
    expect(parseEnv(production)).toMatchObject({
      appEnv: 'production',
      apiPort: 8787,
      appOrigin: 'https://app.example.com',
    });
  });

  test.each(['local', 'test'])('%s accepteert de demo-waarden uit .env.example', (appEnv) => {
    expect(parseEnv({ ...local, APP_ENV: appEnv }).appEnv).toBe(appEnv);
  });

  test.each([
    ['APP_ENV ontbreekt', { APP_ENV: undefined }, 'APP_ENV'],
    ['onbekende APP_ENV', { APP_ENV: 'prod' }, 'APP_ENV'],
    ['AUTH_SECRET korter dan 32 bytes', { AUTH_SECRET: 'ab12'.repeat(7) }, 'AUTH_SECRET: korter dan 32 bytes'],
    [
      'AUTH_SECRET met demo-waarde',
      { AUTH_SECRET: `${production.AUTH_SECRET}-demo` },
      'AUTH_SECRET: bevat een demo-waarde',
    ],
    ['AUTH_SECRET uit .env.example', { AUTH_SECRET: local.AUTH_SECRET }, 'AUTH_SECRET: bevat een demo-waarde'],
    [
      'DATABASE_URL met demo-wachtwoord',
      { DATABASE_URL: 'postgres://api_user:api_user@db.example.com/app' },
      'DATABASE_URL: leeg of demo-wachtwoord',
    ],
    [
      'DATABASE_URL zonder wachtwoord',
      { DATABASE_URL: 'postgres://api_user@db.example.com/app' },
      'DATABASE_URL: leeg of demo-wachtwoord',
    ],
    [
      'AUTH_DATABASE_URL met demo-wachtwoord (geparsed, ook ge-encodeerd)',
      { AUTH_DATABASE_URL: 'postgres://svc:%70ostgres@db.example.com/app' },
      'AUTH_DATABASE_URL: leeg of demo-wachtwoord',
    ],
    [
      'APP_ORIGIN zonder https',
      { APP_ORIGIN: 'http://app.example.com', AUTH_BASE_URL: 'http://app.example.com' },
      'APP_ORIGIN: moet https zijn',
    ],
    ['AUTH_BASE_URL zonder https', { AUTH_BASE_URL: 'http://app.example.com' }, 'AUTH_BASE_URL: moet https zijn'],
    [
      'AUTH_BASE_URL ≠ APP_ORIGIN',
      { AUTH_BASE_URL: 'https://auth.example.com' },
      'AUTH_BASE_URL: moet gelijk zijn aan APP_ORIGIN',
    ],
    ['APP_ORIGIN met pad', { APP_ORIGIN: 'https://app.example.com/' }, 'APP_ORIGIN: alleen schema, host en poort'],
    ['DATABASE_URL geen postgres', { DATABASE_URL: 'mysql://a:b@db/app' }, 'DATABASE_URL: geen postgres-URL'],
    ['ongeldige API_PORT', { API_PORT: '70000' }, 'API_PORT: ongeldige poort'],
    ['CLIENT_IP_HEADER ontbreekt', { CLIENT_IP_HEADER: undefined }, 'CLIENT_IP_HEADER: verplicht'],
    ['CLIENT_IP_HEADER ongeldig', { CLIENT_IP_HEADER: 'X-Real-IP' }, 'CLIENT_IP_HEADER: kleine letters'],
  ])('weigert in productie: %s', (_, override, message) => {
    expect(() => parseEnv({ ...production, ...override })).toThrow(message);
  });

  test('meldt alle fouten tegelijk', () => {
    expect(() => parseEnv({ ...production, AUTH_SECRET: 'kort', APP_ORIGIN: 'http://x.example.com' })).toThrow(
      /AUTH_SECRET: korter[\s\S]*APP_ORIGIN: moet https/,
    );
  });
});

describe('API_HOST en SHUTDOWN_TIMEOUT_MS (draaien buiten pnpm dev)', () => {
  test('standaard alleen lokaal bereikbaar en 10 s om te stoppen', () => {
    expect(parseEnv(production)).toMatchObject({ apiHost: '127.0.0.1', shutdownTimeoutMs: 10_000 });
  });

  test('een lege waarde telt als niet gezet', () => {
    expect(parseEnv({ ...production, API_HOST: '', SHUTDOWN_TIMEOUT_MS: '' })).toMatchObject({
      apiHost: '127.0.0.1',
      shutdownTimeoutMs: 10_000,
    });
  });

  test.each(['0.0.0.0', '::', 'api.internal'])('accepteert API_HOST %s', (host) => {
    expect(parseEnv({ ...production, API_HOST: host }).apiHost).toBe(host);
  });

  test('leest SHUTDOWN_TIMEOUT_MS', () => {
    expect(parseEnv({ ...production, SHUTDOWN_TIMEOUT_MS: '25000' }).shutdownTimeoutMs).toBe(25_000);
  });

  test.each([
    ['API_HOST met spatie', { API_HOST: 'a b' }, 'API_HOST'],
    ['API_HOST als URL', { API_HOST: 'http://0.0.0.0' }, 'API_HOST'],
    ['SHUTDOWN_TIMEOUT_MS nul', { SHUTDOWN_TIMEOUT_MS: '0' }, 'SHUTDOWN_TIMEOUT_MS'],
    ['SHUTDOWN_TIMEOUT_MS geen getal', { SHUTDOWN_TIMEOUT_MS: 'tien' }, 'SHUTDOWN_TIMEOUT_MS'],
    ['SHUTDOWN_TIMEOUT_MS boven 120 s', { SHUTDOWN_TIMEOUT_MS: '120001' }, 'SHUTDOWN_TIMEOUT_MS'],
  ])('weigert %s', (_, override, message) => {
    expect(() => parseEnv({ ...local, ...override })).toThrow(message);
  });
});

describe('readEnv (uitbreidingsplek voor de app, ADR 0040)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('een app leest een eigen variabele zonder core te wijzigen', () => {
    vi.stubEnv('APP_FEATURE_LIMIT', '7');

    expect(readEnv(z.object({ APP_FEATURE_LIMIT: z.coerce.number().int() }))).toStrictEqual({ APP_FEATURE_LIMIT: 7 });
  });

  test('faalt bij opstart op een ongeldige app-variabele', () => {
    vi.stubEnv('APP_FEATURE_LIMIT', 'veel');

    expect(() => readEnv(z.object({ APP_FEATURE_LIMIT: z.coerce.number().int() }))).toThrow('APP_FEATURE_LIMIT');
  });
});

describe('WEB_DIR (productie-image, ADR 0049)', () => {
  test('niet gezet of leeg: geen SPA uit de API-server', () => {
    expect(parseEnv(production).webDir).toBeUndefined();
    expect(parseEnv({ ...production, WEB_DIR: '' }).webDir).toBeUndefined();
  });

  test('gezet: de map met de build', () => {
    expect(parseEnv({ ...production, WEB_DIR: '/app/dist/web' }).webDir).toBe('/app/dist/web');
  });
});
