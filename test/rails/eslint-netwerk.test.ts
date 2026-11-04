import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { expect, test } from 'vitest';

// Netwerk- en geheimrails (spec netwerk-en-geheim-rails, ADR 0077): rails/netwerk-api weigert netwerk buiten de uitgaande
// client (R-CODE-12), rails/geheim een geheim van een koppeling buiten secret() (R-SEC-05). Per fixture is de ontdubbelde
// verzameling rail-meldingen precies de verwachte rail, of leeg.
const eslint = new ESLint({ cwd: process.cwd(), overrideConfig: [tseslint.configs.disableTypeChecked] });

interface Melding {
  readonly ruleId: string;
  readonly message: string;
}

async function meldingenIn(filePath: string, code: string): Promise<Melding[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .map((message) => ({ ruleId: message.ruleId ?? 'parse-fout', message: message.message }))
    .filter(({ ruleId }) => ruleId.startsWith('rails/') || ruleId === 'parse-fout');
}

async function railsIn(filePath: string, code: string): Promise<string[]> {
  const ids = (await meldingenIn(filePath, code)).map(({ ruleId }) => ruleId);
  return [...new Set(ids)].sort();
}

type Rail = 'rails/netwerk-api' | 'rails/geheim' | null;

interface Fixture {
  readonly name: string;
  readonly file: string;
  readonly code: string;
  readonly rule: Rail;
}

const API = 'src/api/x.ts';
const ENV = 'src/api/env.ts';
const NETWERK = 'rails/netwerk-api';
const GEHEIM = 'rails/geheim';

// Toegestane basis van src/api/env.ts (AC-12): alleen zod en core-env.
const ENV_IMPORTS = "import { z } from 'zod';\nimport { readEnv, secret } from '#core/api/env.ts';\n";

// Basis zonder melding: `secret` alleen als aanroep, zodat alleen de geteste vorm (sleutel, import, verbreding) meldt.
function schema(velden: string, voor = ''): string {
  return `${ENV_IMPORTS}${voor}export const e = readEnv((ctx) => z.object({ A: secret(ctx), ${velden} }));\n`;
}

function fixture(name: string, code: string, waar: Rail | readonly [Rail, string]): Fixture {
  const [rule, file] = waar === null || typeof waar === 'string' ? [waar, API] : waar;
  return { name, file, code, rule };
}

// AC-1: netwerkmodules.
const AC1: Fixture[] = [
  fixture("AC-1: import http from 'node:http'", "import http from 'node:http';\nexport const h = http;\n", NETWERK),
  fixture(
    "AC-1: import { request } from 'https'",
    "import { request } from 'https';\nexport const r = request;\n",
    NETWERK,
  ),
  ...['node:http2', 'net', 'node:tls', 'dgram', 'undici', 'undici/agent'].map((module) =>
    fixture(`AC-1: import uit '${module}'`, `import * as m from '${module}';\nexport const x = m;\n`, NETWERK),
  ),
  fixture(
    "AC-1: import nodemailer from 'nodemailer'",
    "import nodemailer from 'nodemailer';\nexport const n = nodemailer;\n",
    NETWERK,
  ),
  fixture(
    "AC-1: import { hc } from 'hono/client' in core-api",
    "import { hc } from 'hono/client';\nexport const c = hc;\n",
    [NETWERK, 'src/core/api/x.ts'],
  ),
];

// AC-2: omzeiling via een andere importvorm of laadweg.
const AC2: Fixture[] = [
  fixture("AC-2: await import('node:https')", "export const m = await import('node:https');\n", NETWERK),
  fixture("AC-2: export * from 'node:net'", "export * from 'node:net';\n", NETWERK),
  fixture("AC-2: export { connect } from 'tls'", "export { connect } from 'tls';\n", NETWERK),
  fixture(
    "AC-2: require('node:http')",
    "declare const require: (m: string) => unknown;\nexport const h = require('node:http');\n",
    NETWERK,
  ),
  fixture(
    "AC-2: import { createRequire } from 'node:module'",
    "import { createRequire } from 'node:module';\nexport const r = createRequire;\n",
    NETWERK,
  ),
  fixture(
    "AC-2: import { spawn } from 'node:child_process'",
    "import { spawn } from 'node:child_process';\nexport const s = spawn;\n",
    NETWERK,
  ),
  fixture(
    "AC-2: import { Worker } from 'node:worker_threads'",
    "import { Worker } from 'node:worker_threads';\nexport const w = Worker;\n",
    NETWERK,
  ),
  fixture("AC-2: import vm from 'vm'", "import vm from 'vm';\nexport const v = vm;\n", NETWERK),
  fixture(
    'AC-2: dynamische data:-import',
    "export const m = await import('data:text/javascript,export default 1');\n",
    NETWERK,
  ),
  // Aanvulling op de spec: de statische vorm van een data:-import.
  fixture(
    'AC-2: statische data:-import',
    "import x from 'data:text/javascript,export default 1';\nexport const y = x;\n",
    NETWERK,
  ),
  fixture("AC-2: eval('1')", "export const r: unknown = eval('1');\n", NETWERK),
  fixture('AC-2: const e = eval', 'export const e = eval;\n', NETWERK),
  fixture("AC-2: import c from 'node:cluster'", "import c from 'node:cluster';\nexport const x = c;\n", NETWERK),
  fixture("AC-2: import i from 'node:inspector'", "import i from 'node:inspector';\nexport const x = i;\n", NETWERK),
  fixture(
    "AC-2: import { Session } from 'node:inspector/promises'",
    "import { Session } from 'node:inspector/promises';\nexport const x = Session;\n",
    NETWERK,
  ),
  fixture("AC-2: import h = require('node:http')", "import h = require('node:http');\nexport const x = h;\n", NETWERK),
];

// AC-3: globale netwerk-API.
const AC3: Fixture[] = [
  fixture("AC-3: await fetch('https://x')", "export const r = await fetch('https://x');\n", NETWERK),
  fixture('AC-3: const f = fetch', 'export const f = fetch;\n', NETWERK),
  fixture('AC-3: use({ fetch })', 'declare function use(o: unknown): void;\nuse({ fetch });\n', NETWERK),
  fixture("AC-3: new WebSocket('wss://x')", "export const w = new WebSocket('wss://x');\n", NETWERK),
  fixture("AC-3: new EventSource('x')", "export const s = new EventSource('x');\n", NETWERK),
  fixture('AC-3: new XMLHttpRequest()', 'export const x = new XMLHttpRequest();\n', NETWERK),
  fixture('AC-3: fetch in src/shared', "export const r = await fetch('x');\n", [NETWERK, 'src/shared/x.ts']),
  fixture('AC-3: fetch in src/core/shared', "export const r = await fetch('x');\n", [NETWERK, 'src/core/shared/x.ts']),
];

// AC-4: het globale object.
const AC4: Fixture[] = [
  fixture("AC-4: globalThis.fetch('x')", "export const r = globalThis.fetch('x');\n", NETWERK),
  fixture("AC-4: globalThis['fetch']('x')", "export const r = globalThis['fetch']('x');\n", NETWERK),
  fixture('AC-4: const g = globalThis', 'export const g = globalThis;\n', NETWERK),
  fixture(
    "AC-4: self.fetch('x')",
    "declare const self: { fetch: (u: string) => unknown };\nexport const r = self.fetch('x');\n",
    NETWERK,
  ),
  fixture(
    "AC-4: global.fetch('x')",
    "declare const global: { fetch: (u: string) => unknown };\nexport const r = global.fetch('x');\n",
    NETWERK,
  ),
  fixture(
    "AC-4: obj['fetch'](1)",
    "declare const obj: { fetch: (n: number) => unknown };\nexport const r = obj['fetch'](1);\n",
    NETWERK,
  ),
  // Aanvulling op de spec (OV-3: ook window als kale naam weigeren).
  fixture(
    "AC-4: window.fetch('x')",
    "declare const window: { fetch: (u: string) => unknown };\nexport const r = window.fetch('x');\n",
    NETWERK,
  ),
];

// AC-5: toegestane vormen.
const AC5: Fixture[] = [
  fixture(
    'AC-5: app.fetch en api.fetch',
    'declare const app: { fetch: (r: Request) => Response };\ndeclare const api: typeof app;\n' +
      'declare const r: Request;\napp.fetch(r);\napi.fetch(r);\n',
    null,
  ),
  fixture(
    'AC-5: eigenschap fetch in een objectliteral',
    'declare const app: { fetch: (r: Request) => Response };\n' +
      'export const o = { fetch: async (r: Request) => app.fetch(r) };\n',
    null,
  ),
  fixture(
    'AC-5: fetch in een interface',
    'export interface F {\n  readonly fetch: (r: Request) => Response;\n}\n',
    null,
  ),
  fixture('AC-5: methode fetch in een klasse', 'export class C {\n  fetch() {}\n}\n', null),
  fixture('AC-5: type F = typeof fetch', 'export type F = typeof fetch;\n', null),
  fixture(
    'AC-5: eigenschappen global en self',
    'declare const re: RegExp;\ndeclare const x: { self: boolean };\nexport const ok = re.global || x.self;\n',
    null,
  ),
  fixture('AC-5: sleutels global en self', 'export const o = { global: true, self: 1 };\n', null),
  fixture(
    "AC-5: import type uit 'node:net'",
    "import type { AddressInfo } from 'node:net';\nexport type A = AddressInfo;\n",
    null,
  ),
  fixture("AC-5: export type uit 'node:net'", "export type { AddressInfo } from 'node:net';\n", null),
  fixture(
    'AC-5: type P = Parameters<typeof globalThis.fetch>',
    'export type P = Parameters<typeof globalThis.fetch>;\n',
    null,
  ),
  fixture('AC-5: abstracte methode fetch', 'export abstract class A {\n  abstract fetch(): void;\n}\n', null),
  fixture('AC-5: type C = WebSocket', 'export type C = WebSocket;\n', null),
  fixture('AC-5: interface W extends WebSocket', 'export interface W extends WebSocket {}\n', null),
  fixture('AC-5: enum-lid fetch', 'export enum E {\n  fetch = 1,\n}\n', null),
];

// AC-6: een inline type-import laadt de module onder verbatimModuleSyntax.
const AC6: Fixture[] = [
  fixture(
    "AC-6: import { type AddressInfo } from 'node:net'",
    "import { type AddressInfo } from 'node:net';\nexport type A = AddressInfo;\n",
    NETWERK,
  ),
];

// AC-7: toegestane plekken.
const NETWERK_CODE = "import http from 'node:http';\nexport const h = http;\nexport const r = await fetch('x');\n";
const AC7: Fixture[] = [
  ...[
    'src/core/api/outbound/client.ts',
    'src/core/api/outbound/testing.ts',
    'src/core/api/outbound/config.ts',
    'src/core/api/mail/smtp.ts',
    'src/core/api/http/serve.ts',
    'src/api/x.test.ts',
    'src/shared/x.int.test.ts',
  ].map((file) => fixture(`AC-7: mag in ${file}`, NETWERK_CODE, [null, file])),
  fixture('AC-7: rest van outbound/ valt onder de rail', NETWERK_CODE, [NETWERK, 'src/core/api/outbound/retry.ts']),
  fixture('AC-7: nodemailer in smtp.ts', "import nodemailer from 'nodemailer';\nexport const n = nodemailer;\n", [
    null,
    'src/core/api/mail/smtp.ts',
  ]),
];

// AC-8: een geheime sleutel zonder secret(…).
const AC8: Fixture[] = [
  'PARTNER_TOKEN',
  'HOOK_SECRET',
  'DB_PASSWORD',
  'X_PASSPHRASE',
  'X_API_KEY',
  'X_PRIVATE_KEY',
  'X_SIGNING_KEY',
  'AWS_SECRET_KEY',
  'X_ACCESS_KEY',
  'SECRET',
  'api_token',
  'apiToken',
  'clientSecret',
].map((sleutel) => fixture(`AC-8: ${sleutel} zonder secret()`, schema(`${sleutel}: z.string()`), [GEHEIM, ENV]));

// Controle: dezelfde basis met een gewone sleutel meldt niets, dus de melding hierboven komt van de sleutel.
const AC8_BASIS: Fixture[] = [
  fixture('AC-8: basis met NOT_A_KEY meldt niets', schema('NOT_A_KEY: z.string()'), [null, ENV]),
];

// AC-9: omzeiling van de sleutel.
const S_DECL = 'declare const s: (c: unknown) => z.ZodString;\n';
const AC9: Fixture[] = [
  fixture("AC-9: sleutel als string 'X_SECRET'", schema("'X_SECRET': z.string()"), [GEHEIM, ENV]),
  fixture("AC-9: berekende sleutel ['X_SECRET']", schema("['X_SECRET']: z.string()"), [GEHEIM, ENV]),
  fixture('AC-9: berekende template-sleutel', schema('[`X_SECRET`]: z.string()'), [GEHEIM, ENV]),
  fixture('AC-9: spread van een objectliteral', schema('...{ X_SECRET: z.string() }'), [GEHEIM, ENV]),
  fixture('AC-9: secret(ctx).optional()', schema('X_TOKEN: secret(ctx).optional()'), [GEHEIM, ENV]),
  fixture('AC-9: andere functie s(ctx)', schema('X_TOKEN: s(ctx)', S_DECL), [GEHEIM, ENV]),
  fixture('AC-9: controle: s(ctx) onder een gewone sleutel meldt niets', schema('PORT: s(ctx)', S_DECL), [null, ENV]),
];

// AC-10: een eigen secret.
const ZOD = "import { z } from 'zod';\nexport const zz = z;\n";
const AC10: Fixture[] = [
  fixture('AC-10: const secret = …', `${ZOD}export const secret = (c: unknown) => z.string();\n`, [GEHEIM, ENV]),
  fixture('AC-10: function secret() {}', `${ZOD}export function secret() {}\n`, [GEHEIM, ENV]),
  fixture('AC-10: parameter secret', `${ZOD}export const f = (secret: unknown) => 1;\n`, [GEHEIM, ENV]),
  fixture(
    'AC-10: destructuring naar secret',
    `${ZOD}declare const x: { secret: unknown };\nexport const { secret } = x;\n`,
    [GEHEIM, ENV],
  ),
  fixture(
    "AC-10: import { secret } from './fake.ts'",
    `${ZOD}import { secret } from './fake.ts';\nexport const s: unknown = secret(1);\n`,
    [GEHEIM, ENV],
  ),
  fixture(
    'AC-10: readEnv as secret',
    `${ZOD}import { readEnv as secret } from '#core/api/env.ts';\nexport const s: unknown = secret(1);\n`,
    [GEHEIM, ENV],
  ),
  fixture(
    'AC-10: import * as secret',
    `${ZOD}import * as secret from '#core/api/env.ts';\nexport const s: unknown = secret(1);\n`,
    [GEHEIM, ENV],
  ),
];

// AC-11: imports buiten zod en core-env, en verbreding van het schema.
const VELD = 'B: z.number()';
const DECLS =
  'declare const a: z.ZodObject;\ndeclare const b: z.ZodObject;\ndeclare const s: z.ZodObject;\n' +
  'declare const k: z.ZodString;\ndeclare const f: (v: unknown) => unknown;\n';
const AC11: Fixture[] = [
  fixture(
    "AC-11: import uit '#shared/limits.ts'",
    schema(VELD, "import { x } from '#shared/limits.ts';\nexport const l = x;\n"),
    [GEHEIM, ENV],
  ),
  fixture("AC-11: import type uit './x.ts'", schema(VELD, "import type { X } from './x.ts';\nexport type Y = X;\n"), [
    GEHEIM,
    ENV,
  ]),
  ...[
    'z.object({}).partial()',
    'z.object({}).deepPartial()',
    'z.object({}).or(z.object({}))',
    'z.union([a, b])',
    'z.preprocess(f, s)',
    'a.catch({})',
    'z.object({}).catchall(s)',
    'z.object({}).passthrough()',
    'z.object({}).loose()',
    'z.object({}).merge(s)',
    'z.object({}).and(s)',
    'z.record(k, s)',
    'z.looseObject({})',
  ].map((expressie) =>
    fixture(`AC-11: verbreding ${expressie}`, schema(VELD, `${DECLS}export const v = ${expressie};\n`), [GEHEIM, ENV]),
  ),
  fixture(
    'AC-11: controle: basis met declaraties en z.object({}) meldt niets',
    schema(VELD, `${DECLS}export const v = z.object({});\n`),
    [null, ENV],
  ),
];

// AC-12: toegestane vormen voor rails/geheim.
const GOED_SCHEMA =
  `${ENV_IMPORTS}export const e = readEnv((ctx) => z.object({ PARTNER_API_KEY: secret(ctx, { minBytes: 48 }), ` +
  'PORT: z.number().default(1), TOKEN_TTL: z.number(), tokenTtl: z.number() }));\n';
const AC12: Fixture[] = [
  fixture('AC-12: secret(ctx, …) en gewone velden', GOED_SCHEMA, [null, ENV]),
  fixture(
    'AC-12: destructuring van API_TOKEN',
    'declare const env: { API_TOKEN: string };\nexport const { API_TOKEN } = env;\n',
    [null, ENV],
  ),
  fixture(
    'AC-12: X_TOKEN in core-env',
    "import { z } from 'zod';\nexport const s = z.object({ X_TOKEN: z.string() });\n",
    [null, 'src/core/api/env.ts'],
  ),
  fixture(
    'AC-12: X_TOKEN buiten env.ts',
    "import { z } from 'zod';\nexport const s = z.object({ X_TOKEN: z.string() });\n",
    [null, API],
  ),
];

test.each([
  ...AC1,
  ...AC2,
  ...AC3,
  ...AC4,
  ...AC5,
  ...AC6,
  ...AC7,
  ...AC8,
  ...AC8_BASIS,
  ...AC9,
  ...AC10,
  ...AC11,
  ...AC12,
])('$name', async ({ file, code, rule }) => {
  expect(await railsIn(file, code)).toStrictEqual(rule === null ? [] : [rule]);
});

// AC-14: de meldingen noemen de juiste helper en regel.
test.each([
  {
    name: 'AC-14: melding van rails/netwerk-api',
    file: API,
    code: "export const r = await fetch('x');\n",
    rule: NETWERK,
    teksten: ['createOutboundClient', 'R-CODE-12'],
  },
  {
    name: 'AC-14: melding van rails/geheim',
    file: ENV,
    code: schema('PARTNER_TOKEN: z.string()'),
    rule: GEHEIM,
    teksten: ['secret(ctx, …)', 'R-SEC-05'],
  },
])('$name', async ({ file, code, rule, teksten }) => {
  const tekst = (await meldingenIn(file, code))
    .filter(({ ruleId }) => ruleId === rule)
    .map(({ message }) => message)
    .join('\n');
  for (const deel of teksten) {
    expect(tekst).toContain(deel);
  }
});
