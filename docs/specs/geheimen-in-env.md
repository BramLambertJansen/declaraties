---
status: gebouwd # #519
namespace: geheimen-in-env
---

# Geheimen van koppelingen in env via `secret()`

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Core levert `secret()`, het enige schema voor een geheim van een koppeling in de app-env, met één regelset die ook `AUTH_SECRET`
controleert (ADR 0077 punt 2 en 5; de werkstap "`secret()`" van ST-15).

## Rollen en wie wat ziet

Geen rol ziet iets nieuws. De beheerder ziet bij een fout geheim een opstartmelding met sleutel en regel, nooit de waarde; de app
leest het geheim alleen met `reveal()` in de compositie-root.

## Datawijzigingen (met grants)

n.v.t. — geen migratie, tabel of functie.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| — | geen route | — | geen; een fout geheim stopt de opstart |

**API** (`src/core/api/env.ts`; geen `any` of `as`, ≤ 3 parameters per functie):

```ts
readEnv<T>(schema: z.ZodType<T> | ((ctx: EnvContext) => z.ZodType<T>)): T; // bestaande vorm blijft werken
secret(ctx: EnvContext, options?: { minBytes?: number; livePattern?: RegExp; testPattern?: RegExp }): z.ZodType<Secret>;
class Secret { #value; reveal(): string } // toString, toJSON en util.inspect geven '[geheim]'

// src/api/env.ts van een app (functie, niet op moduleniveau):
export function appEnv() {
  return readEnv((ctx) => z.object({ PARTNER_API_KEY: secret(ctx, { livePattern: /^partner_live_/ }) }));
}
// src/api/server.ts (compositie-root), naast env():
const partner = createOutboundClient({ …, headers: { authorization: `Bearer ${appEnv().PARTNER_API_KEY.reveal()}` } });
```

`src/api/env.ts` bestaat nu niet en komt niet in deze PR; het is een beschermd pad (ADR 0040) en wordt gedeeld met spec
[bestandsopslag](bestandsopslag.md) (`FILES_LOCAL_DIR`).

**Context.** Krijgt `readEnv` een functie, dan parst het eerst `APP_ENV` met het enum uit `baseSchema` (fout: dezelfde melding
`Ongeldige omgeving (app-env)` met `- APP_ENV: …`) en roept de functie aan met een `EnvContext`: een klasse met `#`-veld, alleen
`export type { EnvContext }`. Alleen `readEnv` maakt hem, dus een app kan geen vaste omgeving meegeven zonder `unsafeCast`. De getter
`ctx.appEnv` geeft de omgeving terug, omdat de uitgaande client `appEnv` nodig heeft. Een schema zonder functie (`readEnv(z.object(…))`)
parst zoals nu, zonder `APP_ENV` te lezen.

**Geen waarde in de fout.** `readEnv` gooit een gewone `Error` zonder `cause` en parst nooit met `reportInput`; `secretIssues` en de
`superRefine` zetten geen `input` in een issue. `Secret` bewaart de waarde in het ES-privéveld `#value`.

**Regels**, in deze volgorde, elke geschonden regel een eigen melding (alle tegelijk, zoals `env()`):

| Regel | Geldt in | Melding |
|---|---|---|
| aanwezig en niet leeg (`z.string({ error: 'verplicht' }).min(1, { error: 'verplicht', abort: true })`) | overal | alleen `verplicht` |
| ten minste `minBytes` bytes (`Buffer.byteLength`) | `staging`, `production` | `korter dan <n> bytes` |
| bevat geen deel uit `DEMO_SECRET_PARTS` (hoofdletterongevoelig) | `staging`, `production` | `bevat een demo-waarde` |
| past niet op `livePattern` | alles behalve `production` | `live-sleutel buiten production` |
| past niet op `testPattern` | `production` | `testsleutel in production` |

De live-regel geldt ook in `local` en `test`: ADR 0077 punt 5 zegt "buiten `production`", en een live-sleutel op een laptop is precies
het risico. De meldingen bevatten alleen sleutelnaam (via het pad) en regel; nooit de waarde, een deel ervan of het patroon.

**Configuratiefout** (gewone `Error` bij het bouwen van het schema, dus bij opstart): `minBytes` geen geheel getal of lager dan
`MIN_SECRET_BYTES`; een patroon met vlag `g` of `y` (`lastIndex` maakt `test` dan wisselend). Melding: `secret(): minBytes lager dan 32`
of `secret(): patroon met vlag g of y`.

**Eén regelset.** Een pure functie `secretIssues(value, appEnv, rules): string[]` levert de meldingen uit de tabel behalve `verplicht`.
`secret()` roept haar aan in een `superRefine`; `checkSecrets` roept haar aan voor `AUTH_SECRET` met `{ minBytes: MIN_SECRET_BYTES }`,
zonder patronen. `AUTH_SECRET` blijft daarmee gelijk: `z.string().min(1)` overal, type `string`, dezelfde twee meldingen buiten `local`
en `test`.

## Kopieer de vorm van

- `src/core/api/env.ts` — `superRefine` met `ctx.addIssue({ code: 'custom', … })`, `describe()` voor de melding.
- `src/core/api/env-schema.test.ts` (stijl; de nieuwe tests staan in `src/core/api/env-secret.test.ts`) — `vi.stubEnv` en `test.each` per regel met fixtures uit herhaling (`'ab12'.repeat(n)`).

## Hergebruik en UX

n.v.t. — geen scherm; de opstartmelding volgt het bestaande formaat van `readEnv`.

## Acceptatiecriteria

Fixtures via `vi.stubEnv` en `readEnv((ctx) => z.object({ PARTNER_API_KEY: secret(ctx, opties) }))`; `geldig` is `'ab12'.repeat(10)`.

- **geheimen-in-env/AC-1** — Gegeven `PARTNER_API_KEY` ontbreekt of is leeg, dan faalt `readEnv` in elk van de vier omgevingen met precies één
  melding, `PARTNER_API_KEY: verplicht`.
- **geheimen-in-env/AC-2** — Gegeven `'ab12'.repeat(7)` (28 bytes), dan faalt `readEnv` in `staging` en `production` met
  `PARTNER_API_KEY: korter dan 32 bytes` en slaagt het in `local` en `test`. Met `minBytes: 64` faalt `geldig` (40 bytes) in `staging` met
  `korter dan 64 bytes`.
- **geheimen-in-env/AC-3** — Gegeven `geldig + '-Demo'`, dan faalt `readEnv` in `staging` en `production` met `bevat een demo-waarde`
  en slaagt het in `local` en `test`.
- **geheimen-in-env/AC-4** — Gegeven `livePattern: /^partner_live_/` en `'partner_live_' + geldig`, dan faalt `readEnv` in `local`, `test`
  en `staging` met `live-sleutel buiten production` en slaagt het in `production`.
- **geheimen-in-env/AC-5** — Gegeven `testPattern: /^partner_test_/` en `'partner_test_' + geldig`, dan faalt `readEnv` in `production`
  met `testsleutel in production` en slaagt het in de andere drie.
- **geheimen-in-env/AC-6** — Gegeven één waarde die tegelijk te kort is, `demo` bevat en op `livePattern` past, in `staging`, dan noemt
  de melding de drie regels, bevat de melding geen deelreeks van vier of meer tekens uit de waarde en is `error.cause` `undefined`.
- **geheimen-in-env/AC-7** — Gegeven een geldige waarde `k`, dan geeft `k.reveal()` haar terug; `String(k)`, `` `${k}` ``,
  `JSON.stringify({ k })` en `util.inspect(k)` bevatten alleen `[geheim]`; `{ ...k }` is gelijk aan `{}`; `structuredClone(k)` bevat de
  waarde niet.
- **geheimen-in-env/AC-8** — Gegeven `minBytes: 16`, `minBytes: 32.5` of een patroon `/x/g`, dan faalt `readEnv` met de
  configuratiefout, ook in `local`.
- **geheimen-in-env/AC-9** — Gegeven een ontbrekende of onbekende `APP_ENV` en een schemafunctie, dan faalt `readEnv` met `APP_ENV` in de
  melding en wordt de functie niet aangeroepen.
- **geheimen-in-env/AC-10** — De bestaande tests in `src/core/api/env-schema.test.ts` en `src/core/api/env.test.ts` blijven ongewijzigd
  groen, ook de `readEnv`-tests met een gewoon schema en de `AUTH_SECRET`-meldingen.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Waarde met spaties of witregel aan het eind | geen trim; telt mee in de bytes | — |
| `livePattern` en `testPattern` passen allebei | buiten `production` de live-melding, in `production` de test-melding | — |

## Raakt ook

- Gewijzigd: `src/core/api/env.ts` (`secret`, `Secret`, `EnvContext`, `secretIssues`, `readEnv`, kopcommentaar regel 4) en
  `src/core/api/env-secret.test.ts` (nieuwe tests; bestaande ongewijzigd). Core, dus volledige route met eigenaarmerge.
- `docs/framework.md` §6 R-SEC-05, voorstel (de eigenaarmerge is het akkoord): na "`AUTH_BASE_URL` ≠ `APP_ORIGIN`" komt "; een geheim
  van een koppeling staat alleen in env, in `src/api/env.ts` via `readEnv((ctx) => …)` met `secret(ctx, opties)`: overal verplicht,
  buiten `local`/`test` ten minste 32 bytes (per geheim hoger) zonder demo-waarde, buiten `production` niet passend op het live-patroon en
  in `production` niet passend op het testpatroon uit het app-ADR; de lengte- en demoregel gelden ook voor `AUTH_SECRET`; de melding noemt sleutel en
  regel, nooit de waarde (0077)".
- `docs/roadmap.md` ST-15: niet afvinken; uit "Eisen uit het regelboek" gaat "geheimen alleen in env via `secret()`: buiten
  `local`/`test` geen lege, korte of demowaarde, buiten `production` geen live-sleutel (aanvulling R-SEC-05)" (R-DOC-10).
- `docs/gouden-pad.md`: n.v.t. — nog geen hoofdstuk over koppelingen; dat komt met de skill `nieuwe-koppeling`.
- `.env.example`: niet in deze PR; een app-koppeling zet er met eigenaarakkoord een demo-waarde in voor de nep-partner.
- Niet geraakt: `check:migrations`, `check:secdef`, policies, `test/security/resources.ts`, permissietests.

## Buiten scope

Een optioneel geheim (koppeling uit, geen sleutel): komt met register en schakelaar. Een lintregel die `z.string()` voor een
geheim weigert; geheimen in de database of via de UI (ADR 0077 punt 5); rotatie; de overige werkstappen van ST-15. De leesbare
waarde blijft in `process.env` staan; dat is inherent aan env en lost `Secret` niet op.

## Testplan

- **Unit** (`src/core/api/env-secret.test.ts`, `vi.stubEnv`): AC-1 tot en met AC-5 als `test.each` over de vier omgevingen; AC-6 tot
  en met AC-9 als losse tests, AC-6 met een hulpfunctie die alle deelreeksen van vier tekens zoekt.
- **Regressie**: AC-10 door de bestaande suites ongewijzigd te draaien (`pnpm test`); de bestaande `readEnv`-tests blijven zonder
  `APP_ENV` werken.
- Geen integratietest: geen database of netwerk.

## Open vragen

- **OV-1** — Vorm van de omgevingscontext: schemafunctie met `EnvContext` (gekozen), `superRefine` die `process.env.APP_ENV` leest, of
  een merkteken dat `readEnv` na het parsen controleert. Aanbeveling: de schemafunctie; puur en testbaar, de bestaande vorm blijft
  werken, en een merkteken valt stil weg zodra een app `.optional()` of `.transform()` om het schema zet.
- **OV-2** — Lokaal leeg toestaan. Aanbeveling: nee; zoals `AUTH_SECRET` overal verplicht, met een demo-waarde in `.env.example` die
  buiten `local`/`test` vanzelf geweigerd wordt; het type blijft dan `Secret` zonder `undefined`.
- **OV-3** — `testPattern` opnemen. Aanbeveling: ja; één regel vangt een testsleutel in productie vóór de eerste aanroep.
- **OV-4** — Typemerk. Aanbeveling: de klasse `Secret` met `reveal()` in plaats van een merk op `string`; een merk houdt `console.log`
  niet tegen, de klasse wel. `AUTH_SECRET` blijft `string`, omdat de auth-bibliotheek een tekenreeks verwacht.
