---
status: gebouwd # #525
namespace: netwerk-en-geheim-rails
---

# Netwerk- en geheimrails

## Doel

Twee lintregels (ST-15, ADR 0077) laten netwerk buiten de uitgaande client (R-CODE-12) en een geheim van een koppeling
buiten `secret()` (R-SEC-05) falen.

## Rollen en wie wat ziet

n.v.t. — lintregels voor ontwikkelaars, geen gedrag in de app.

## Datawijzigingen (met grants)

n.v.t. — geen migratie of tabel.

## Routes en foutcodes

n.v.t. — geen route of foutcode.

## Kopieer de vorm van

- `eslint.config.js` — rail `fetch` en `kooi`: `restrict(rule, files, ignores, message, selectors)`, naam in
  `ruleNames`, `fromModule` voor imports, `TESTS` als uitsluiting.
- `test/rails/eslint-web.test.ts` — fixtures als `{ name, file, code, rule }` via `railsIn`.

## Hergebruik en UX

- Bestaande componenten, staten, focus: n.v.t. — geen UI.
- Meldingen letterlijk:
  - `rails/netwerk-api`: "Netwerk vanuit api- en shared-code alleen via de uitgaande client: gebruik createOutboundClient
    uit '#core/api/outbound' (R-CODE-12, ADR 0077). Geen node:http(s), net, tls, undici, nodemailer, child_process,
    worker_threads, vm, node:module, data:-import, eval, globale fetch/WebSocket of globalThis."
  - `rails/geheim`: "Een geheim van een koppeling alleen via secret(ctx, …) uit '#core/api/env.ts' in readEnv((ctx) => …)
    (R-SEC-05, ADR 0077); geen eigen secret, geen andere imports, geen .partial/.or/.catch/z.union."

## Acceptatiecriteria

Fixtures in `test/rails/eslint-netwerk.test.ts`; per fixture is de verzameling rail-meldingen precies
`{'rails/netwerk-api'}`, `{'rails/geheim'}` of leeg. Bestand `src/api/x.ts`, tenzij anders genoemd; zone van
`rails/netwerk-api`: `src/api/**`, `src/core/api/**`, `src/shared/**`, `src/core/shared/**`, zonder `TESTS`.

- **netwerk-en-geheim-rails/AC-1** — Gegeven een netwerkmodule, dan meldt `rails/netwerk-api`: `import http from
'node:http'`, `import { request } from 'https'`, `'node:http2'`, `'net'`, `'node:tls'`, `'dgram'`, `'undici'`,
  `'undici/agent'` en `import nodemailer from 'nodemailer'`; `import { hc } from 'hono/client'` in `src/core/api/x.ts`.
- **netwerk-en-geheim-rails/AC-2** — Gegeven een omzeiling via een andere importvorm of laadweg, dan meldt de rail:
  `await import('node:https')`, `export * from 'node:net'`, `export { connect } from 'tls'`, `require('node:http')` (met
  `declare const require: (m: string) => unknown;`), `import { createRequire } from 'node:module'`,
  `import { spawn } from 'node:child_process'`, `import { Worker } from 'node:worker_threads'`, `import vm from 'vm'`,
  `await import('data:text/javascript,export default 1')`, `eval('1')`, `const e = eval;`, `import c from 'node:cluster'`, `import i from 'node:inspector'`, `import { Session } from 'node:inspector/promises'` en
  `import h = require('node:http')`.
- **netwerk-en-geheim-rails/AC-3** — Gegeven een globale netwerk-API, dan meldt de rail: `await fetch('https://x')`,
  `const f = fetch;`, `use({ fetch })`, `new WebSocket('wss://x')`, `new EventSource('x')`, `new XMLHttpRequest()`, en
  `await fetch('x')` in `src/shared/x.ts` en `src/core/shared/x.ts`.
- **netwerk-en-geheim-rails/AC-4** — Gegeven het globale object, dan meldt de rail: `globalThis.fetch('x')`,
  `globalThis['fetch']` als aanroep, `const g = globalThis;`, `self.fetch('x')`, `global.fetch('x')` en `obj['fetch']` als aanroep.
- **netwerk-en-geheim-rails/AC-5** — Gegeven een toegestane vorm, dan meldt de rail niets: `app.fetch(r); api.fetch(r);`,
  `const o = { fetch: async (r: Request) => app.fetch(r) };`, `interface F { readonly fetch: (r: Request) => Response }`,
  `class C { fetch() {} }`, `type F = typeof fetch;`, `const ok = re.global || x.self;`,
  `const o = { global: true, self: 1 };`, `import type { AddressInfo } from 'node:net'` en
  `export type { AddressInfo } from 'node:net'`, `type P = Parameters<typeof globalThis.fetch>;`,
  `abstract class A { abstract fetch(): void }`, `enum E { fetch = 1 }`, `type C = WebSocket;` en
  `interface W extends WebSocket {}`.
- **netwerk-en-geheim-rails/AC-6** — Gegeven `import { type AddressInfo } from 'node:net'`, dan meldt de rail: onder
  `verbatimModuleSyntax` blijft die import als laadopdracht staan.
- **netwerk-en-geheim-rails/AC-7** — Gegeven `import http from 'node:http'; await fetch('x');` in
  `src/core/api/outbound/client.ts`, `outbound/testing.ts`, `outbound/config.ts`, `src/core/api/mail/smtp.ts`,
  `src/core/api/http/serve.ts`, `src/api/x.test.ts` en `src/shared/x.int.test.ts`, dan meldt de rail niets; in
  `src/core/api/outbound/retry.ts` wel. `import nodemailer from 'nodemailer'` in `smtp.ts` zwijgt.
- **netwerk-en-geheim-rails/AC-8** — Gegeven in `src/api/env.ts` een sleutel van een objectliteral die eindigt op
  `SECRET`, `TOKEN`, `PASSWORD`, `PASSPHRASE`, `API_KEY`, `PRIVATE_KEY`, `SIGNING_KEY`, `SECRET_KEY` of `ACCESS_KEY` (na
  `_` of als hele naam, in hoofd- of kleine letters, of camelCase als `apiToken`, `clientSecret`) met een waarde die geen
  aanroep `secret(…)` is, dan meldt `rails/geheim`: `z.object({ PARTNER_TOKEN: z.string() })`, en zo ook
  `HOOK_SECRET`, `DB_PASSWORD`, `X_PASSPHRASE`, `X_PRIVATE_KEY`, `X_SIGNING_KEY`, `AWS_SECRET_KEY`, `X_ACCESS_KEY`,
  `SECRET`, `api_token`, `apiToken` en `clientSecret`.
- **netwerk-en-geheim-rails/AC-9** — Gegeven een omzeiling van de sleutel in `src/api/env.ts`, dan meldt `rails/geheim`:
  `{ 'X_SECRET': z.string() }`, `{ ['X_SECRET']: z.string() }`, `` { [`X_SECRET`]: z.string() } ``,
  `{ ...{ X_SECRET: z.string() } }`, `{ X_TOKEN: secret(ctx).optional() }` en `{ X_TOKEN: s(ctx) }`.
- **netwerk-en-geheim-rails/AC-10** — Gegeven een eigen `secret` in `src/api/env.ts`, dan meldt `rails/geheim`:
  `const secret = (c: unknown) => z.string();`, `function secret() {}`, `const f = (secret: unknown) => 1;`,
  `const { secret } = x;`, `import { secret } from './fake.ts'`, `import { readEnv as secret } from '#core/api/env.ts'`
  en `import * as secret from '#core/api/env.ts'`.
- **netwerk-en-geheim-rails/AC-11** — Gegeven in `src/api/env.ts` een import buiten `zod` en `#core/api/env.ts`
  (`import { x } from '#shared/limits.ts'`, `import type { X } from './x.ts'`) of een verbreding van het schema
  (`z.object({}).partial()`, `.deepPartial()`, `.or(z.object({}))`, `z.union([a, b])`, `z.preprocess(f, s)`,
  `a.catch({})`, `.catchall(s)`, `.passthrough()`, `.loose()`, `.merge(s)`, `.and(s)`, `z.record(k, s)`, `z.looseObject({})`), dan meldt
  `rails/geheim`. Elke fixture gebruikt `secret` alleen als aanroep, zodat alleen de geteste vorm de melding geeft.
- **netwerk-en-geheim-rails/AC-12** — Gegeven in `src/api/env.ts` `import { z } from 'zod'; import { readEnv, secret }
from '#core/api/env.ts'; export const e = readEnv((ctx) => z.object({ PARTNER_API_KEY: secret(ctx, { minBytes: 48 }),
PORT: z.number().default(1), TOKEN_TTL: z.number(), tokenTtl: z.number() }));` of `const { API_TOKEN } = env;`, of
  `{ X_TOKEN: z.string() }` in `src/core/api/env.ts` en `src/api/x.ts`, dan meldt `rails/geheim` niets.
- **netwerk-en-geheim-rails/AC-13** — Gegeven de huidige repo, dan is `pnpm lint` groen zonder nieuwe regels in
  `eslint-suppressions.json`. Een proef met de selectors op alle 82 niet-testbestanden van de zone gaf geen melding;
  `src/core/api/env.ts` (met `pattern.global`) valt onder `rails/netwerk-api` maar buiten `rails/geheim`.
- **netwerk-en-geheim-rails/AC-14** — De meldingen bevatten letterlijk `createOutboundClient` en `R-CODE-12`, resp.
  `secret(ctx, …)` en `R-SEC-05`; `pnpm test:unit` is groen.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| `import()` met berekend pad, `process.getBuiltinModule` | al geweigerd door `rails/import`, `rails/process-env` | n.v.t. |
| `new Function(…)` | al geweigerd door `@typescript-eslint/no-implied-eval` | n.v.t. |
| `(async function () {}).constructor(…)` | niet gezien (bekend gat); review | n.v.t. |
| geheim onder een naam buiten de lijst (`PARTNER_KEY`, `X_TOKEN_V2`, `X_CREDENTIALS`) | niet gezien; review en R-SEC-05 | n.v.t. |
| sleutel uit een expressie of constante (`` [`X_${t}`] ``, `[K]`, `Object.fromEntries`) | niet gezien (bekend gat); review | n.v.t. |
| label of `export { a as fetch }` | geweigerd; kies een andere naam | n.v.t. |
| `.optional()`, `.transform()` of `z.lazy` om het hele object | niet gezien (bekend gat); review | n.v.t. |
| optioneel geheim (koppeling uit) | geweigerd; register en schakelaar beslissen later | n.v.t. |
| lokale binding `fetch` of `global` | geweigerd; kies een andere naam | n.v.t. |

## Raakt ook

- `eslint.config.js`: twee namen in `ruleNames`, twee `restrict()`-blokken; voorReview-pad, de hoofdsessie schrijft het.
  Regex in een selector zonder `/` (esquery): `[/]` of `.`.
- `docs/framework.md` R-CODE-12: na "…en `deploy/<host>/`)" komt "; de lintregel `rails/netwerk-api` weigert daarbuiten,
  ook in `src/shared` en `src/core/shared`, netwerkmodules, `child_process`, `worker_threads`, `vm`, `node:module`,
  `eval` en globale `fetch`/`WebSocket`/`globalThis` (eigen server: `src/core/api/http/serve.ts`)".
- `docs/framework.md` R-SEC-05: na "met `secret(ctx, opties)`" komt "(`rails/geheim` weigert daar een sleutel op `SECRET`,
  `TOKEN`, `PASSWORD`, `PASSPHRASE`, `API_KEY`, `PRIVATE_KEY`, `SIGNING_KEY`, `SECRET_KEY` of `ACCESS_KEY` zonder
  `secret(…)`, een eigen `secret` en imports buiten `zod` en core-env)".
- `docs/roadmap.md` ST-15: niet afvinken; uit "Eisen uit het regelboek" gaat "een lintregel weigert netwerk buiten de
  uitgaande client (R-CODE-12) en een geheim van een koppeling buiten `secret()` (R-SEC-05); " (R-DOC-10); de eis voor
  `withJob` blijft.
- `pnpm lint`, `pnpm test:unit`, `pnpm ratchet`, `pnpm check:docs-drift`.
- Niet geraakt: `check:migrations`, `check:secdef`, `test:db`/policies, `test/security/resources.ts`, permissietests.

## Buiten scope

Andere HTTP-bibliotheken (eerst dependency-akkoord, R-SEC-06, dan in de lijst); `node:dns`; `deploy/<host>/` en
opslagadapters (pad bij hun ADR); de `withJob`-eis en de overige werkstappen van ST-15.

## Testplan

- **Unit** (`test/rails/eslint-netwerk.test.ts`, vorm van `eslint-web.test.ts`, maar met ontdubbelde rule-ids):
  AC-1 tot en met AC-12 als `test.each`; AC-14 met een fixture die de meldingstekst controleert.
- **Regressie**: AC-13 met `pnpm lint` op de hele repo en een test die `eslint.lintFiles` over de zone draait
  (`test/rails/eslint-netwerk.test.ts`). Geen integratietest.

## Open vragen

- **OV-1** — Type-imports van netwerkmodules? Aanbeveling: alleen `import type`/`export type`; inline `type` laadt.
- **OV-2** — Welke sleutels? Aanbeveling: de negen uit AC-8 plus camelCase; een kale `_KEY` niet (publieke sleutels).
- **OV-3** — `globalThis`, `global`, `self`, `window` als kale naam weigeren? Aanbeveling: ja; een alias is anders niet
  te volgen. Eigenschappen en sleutels met die naam blijven vrij.
- **OV-4** — Welke toegestane plekken? Aanbeveling: alleen `outbound/client.ts`, `outbound/testing.ts`,
  `outbound/config.ts` (`isIP`), `mail/smtp.ts`, `http/serve.ts`; de rest van `outbound/` valt onder de rail.
- **OV-5** — Schemaverbreding in `src/api/env.ts`? Aanbeveling: `.partial`, `.deepPartial`, `.or`, `.catch`,
  `z.union`, `z.discriminatedUnion`, `z.preprocess` weigeren; `.optional()`/`.transform()` om het hele object blijft
  een bekend gat, omdat `.optional()` op een gewoon veld mag.
