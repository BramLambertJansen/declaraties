import { inspect } from 'node:util';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { parseEnv, readEnv, Secret, secret, type SecretOptions } from './env.ts';

// Spec geheimen-in-env: secret() als enige schema voor een geheim van een koppeling.
// Testwaarden uit herhaling met een fictief voorvoegsel, zodat Betterleaks ze niet als echte sleutel ziet.
const geldig = 'ab12'.repeat(10); // 40 bytes
const KEY = 'PARTNER_API_KEY';
const ENVS = ['local', 'test', 'staging', 'production'] as const;
type AppEnvName = (typeof ENVS)[number];

function stub(appEnv: string | undefined, value: string | undefined): void {
  vi.stubEnv('APP_ENV', appEnv);
  vi.stubEnv(KEY, value);
}

function readPartner(options?: SecretOptions): { PARTNER_API_KEY: Secret } {
  return readEnv((ctx) => z.object({ PARTNER_API_KEY: secret(ctx, options) }));
}

// Geeft de gegooide fout terug; faalt de test als readEnv niet gooit.
function caught(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) return error;
    return new Error(`geen Error gegooid: ${String(error)}`);
  }
  throw new Error('readEnv gooide niet');
}

// De meldingsregels in het formaat van readEnv: '- <pad>: <regel>'.
function issueLines(error: Error): string[] {
  return error.message.split('\n').filter((line) => line.startsWith('- '));
}

// Alle deelreeksen van vier tekens uit de waarde (AC-6).
function substrings4(value: string): string[] {
  return Array.from({ length: value.length - 3 }, (_, index) => value.slice(index, index + 4));
}

function expectAccepted(value: string, options?: SecretOptions): void {
  const parsed = readPartner(options).PARTNER_API_KEY;
  expect(parsed).toBeInstanceOf(Secret);
  expect(parsed.reveal()).toBe(value);
}

function expectRejected(rule: string, options?: SecretOptions): void {
  const error = caught(() => readPartner(options));
  expect(error.message).toContain('Ongeldige omgeving (app-env)');
  expect(issueLines(error)).toContain(`- ${KEY}: ${rule}`);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('secret(): regels per omgeving', () => {
  const missing = ENVS.flatMap(
    (appEnv) =>
      [
        [appEnv, 'ontbreekt', undefined],
        [appEnv, 'leeg', ''],
      ] as const,
  );

  test.each(missing)(
    'geheimen-in-env/AC-1: %s, %s → precies één melding verplicht',
    (appEnv: AppEnvName, _label: string, value: string | undefined) => {
      stub(appEnv, value);

      const error = caught(() => readPartner({ livePattern: /^partner_live_/, testPattern: /^partner_test_/ }));

      expect(issueLines(error)).toStrictEqual([`- ${KEY}: verplicht`]);
    },
  );

  test.each([
    ['local', null],
    ['test', null],
    ['staging', 'korter dan 32 bytes'],
    ['production', 'korter dan 32 bytes'],
  ] as const)('geheimen-in-env/AC-2: 28 bytes in %s → %s', (appEnv: AppEnvName, rule: string | null) => {
    const short = 'ab12'.repeat(7);
    stub(appEnv, short);

    if (rule === null) expectAccepted(short);
    else expectRejected(rule);
  });

  test('geheimen-in-env/AC-2: minBytes 64 weigert 40 bytes in staging', () => {
    stub('staging', geldig);

    expectRejected('korter dan 64 bytes', { minBytes: 64 });
  });

  test.each([
    ['local', null],
    ['test', null],
    ['staging', 'bevat een demo-waarde'],
    ['production', 'bevat een demo-waarde'],
  ] as const)('geheimen-in-env/AC-3: demo-waarde in %s → %s', (appEnv: AppEnvName, rule: string | null) => {
    const demo = `${geldig}-Demo`;
    stub(appEnv, demo);

    if (rule === null) expectAccepted(demo);
    else expectRejected(rule);
  });

  test.each([
    ['local', 'live-sleutel buiten production'],
    ['test', 'live-sleutel buiten production'],
    ['staging', 'live-sleutel buiten production'],
    ['production', null],
  ] as const)('geheimen-in-env/AC-4: live-sleutel in %s → %s', (appEnv: AppEnvName, rule: string | null) => {
    const live = `partner_live_${geldig}`;
    const options = { livePattern: /^partner_live_/ };
    stub(appEnv, live);

    if (rule === null) expectAccepted(live, options);
    else expectRejected(rule, options);
  });

  test.each([
    ['local', null],
    ['test', null],
    ['staging', null],
    ['production', 'testsleutel in production'],
  ] as const)('geheimen-in-env/AC-5: testsleutel in %s → %s', (appEnv: AppEnvName, rule: string | null) => {
    const testKey = `partner_test_${geldig}`;
    const options = { testPattern: /^partner_test_/ };
    stub(appEnv, testKey);

    if (rule === null) expectAccepted(testKey, options);
    else expectRejected(rule, options);
  });
});

describe('secret(): melding zonder waarde', () => {
  test('geheimen-in-env/AC-6: drie geschonden regels in staging, geen deel van de waarde, geen cause', () => {
    // Te kort (20 bytes), bevat 'demo' (hoofdletterongevoelig) en past op livePattern. Hoofdletters in de waarde zodat
    // de vaste regeltekst ('live-sleutel', 'demo-waarde') zelf geen deelreeks van de waarde is.
    const value = 'partner_LIVE_Demo_q7';
    stub('staging', value);

    const error = caught(() => readPartner({ livePattern: /^partner_LIVE_/ }));

    expect(issueLines(error)).toStrictEqual([
      `- ${KEY}: korter dan 32 bytes`,
      `- ${KEY}: bevat een demo-waarde`,
      `- ${KEY}: live-sleutel buiten production`,
    ]);
    const leaked = substrings4(value).filter((part) => error.message.includes(part));
    expect(leaked).toStrictEqual([]);
    expect(error.cause).toBeUndefined();
  });
});

describe('Secret: lekt niet bij serialiseren', () => {
  test('geheimen-in-env/AC-7: alleen reveal() geeft de waarde', () => {
    stub('local', geldig);
    const k = readPartner().PARTNER_API_KEY;
    // Als unknown: zo toetst de test de runtime, niet wat het type belooft. String() en een template literal
    // lopen allebei via ToPrimitive met hint 'string', dus String() dekt ook `${k}`.
    const loose: unknown = k;

    expect(k.reveal()).toBe(geldig);
    expect(String(loose)).toBe('[geheim]');
    expect(JSON.stringify({ k })).toBe('{"k":"[geheim]"}');
    expect(inspect(k)).toBe('[geheim]');
    // { ...k } kopieert precies de eigen opsombare sleutels; er mag er geen zijn.
    expect(Reflect.ownKeys(k)).toStrictEqual([]);
    const clone: unknown = structuredClone(k);
    expect(JSON.stringify(clone)).not.toContain(geldig);
    expect(inspect(clone)).not.toContain(geldig);
  });
});

describe('secret(): configuratiefout bij opstart', () => {
  test.each([
    ['minBytes 16', { minBytes: 16 }, 'secret(): minBytes lager dan 32'],
    ['minBytes 32.5', { minBytes: 32.5 }, 'secret(): minBytes'],
    ['livePattern met vlag g', { livePattern: /x/g }, 'secret(): patroon met vlag g of y'],
    ['testPattern met vlag g', { testPattern: /x/g }, 'secret(): patroon met vlag g of y'],
    ['livePattern met vlag y', { livePattern: /x/y }, 'secret(): patroon met vlag g of y'],
  ] as const)(
    'geheimen-in-env/AC-8: %s faalt ook in local',
    (_label: string, options: SecretOptions, message: string) => {
      stub('local', geldig);

      const error = caught(() => readPartner(options));

      expect(error.message).toContain(message);
      expect(error.message).not.toContain('nog niet gebouwd');
      expect(error.message).not.toContain('Ongeldige omgeving');
    },
  );
});

describe('readEnv met schemafunctie: APP_ENV eerst', () => {
  test.each([
    ['ontbreekt', undefined],
    ['onbekend', 'prod'],
  ] as const)(
    'geheimen-in-env/AC-9: APP_ENV %s → fout en functie niet aangeroepen',
    (_label: string, appEnv: string | undefined) => {
      stub(appEnv, geldig);
      const build = vi.fn(() => z.object({ [KEY]: z.string() }));

      const error = caught(() => readEnv(build));

      expect(error.message).toContain('Ongeldige omgeving (app-env)');
      expect(issueLines(error).some((line) => line.startsWith('- APP_ENV: '))).toBe(true);
      expect(build).not.toHaveBeenCalled();
    },
  );

  test.each(ENVS)('geheimen-in-env/AC-9: APP_ENV %s komt als ctx.appEnv binnen', (appEnv: AppEnvName) => {
    stub(appEnv, geldig);
    const seen: string[] = [];

    readEnv((ctx) => {
      seen.push(ctx.appEnv);
      return z.object({ [KEY]: z.string() });
    });

    expect(seen).toStrictEqual([appEnv]);
  });
});

describe('regressie: bestaande vorm blijft werken', () => {
  test.each([
    ['ontbreekt', undefined],
    ['onbekend', 'prod'],
  ] as const)(
    'geheimen-in-env/AC-10: gewoon schema leest APP_ENV niet (APP_ENV %s)',
    (_label: string, appEnv: string | undefined) => {
      stub(appEnv, geldig);

      expect(readEnv(z.object({ [KEY]: z.string() }))).toStrictEqual({ [KEY]: geldig });
    },
  );

  test('geheimen-in-env/AC-10: AUTH_SECRET blijft string met dezelfde meldingen', () => {
    const production = {
      APP_ENV: 'production',
      APP_ORIGIN: 'https://app.example.com',
      AUTH_BASE_URL: 'https://app.example.com',
      AUTH_SECRET: geldig,
      DATABASE_URL: 'postgres://api_user:Kp4wQ9zL2xR7@db.example.com:5432/app',
      AUTH_DATABASE_URL: 'postgres://auth_service:Vb8nM3cT6yH1@db.example.com:5432/app',
      SMTP_URL: 'smtp://mail.example.com:587',
      CLIENT_IP_HEADER: 'x-real-ip',
    };

    expect(parseEnv(production).authSecret).toBe(geldig);
    const error = caught(() => parseEnv({ ...production, AUTH_SECRET: 'ab12-Demo' }));
    expect(issueLines(error)).toStrictEqual([
      '- AUTH_SECRET: korter dan 32 bytes',
      '- AUTH_SECRET: bevat een demo-waarde',
    ]);
  });
});
