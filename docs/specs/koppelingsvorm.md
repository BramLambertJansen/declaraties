---
status: gebouwd # #539
namespace: koppelingsvorm
---

# Vaste vorm per koppeling, contracttest en check

Geen kop weglaten; "n.v.t. — reden" mag. Ontbreekt een antwoord, dan vraagt de agent het.

## Doel

Elke koppeling krijgt dezelfde vorm (poort, adapter, schema's, contracttest, fixtures), één contracttestsuite uit core die
tegen de nep-partner en, met de hand, tegen de testomgeving van de partner draait, en een check die een afwijkende map laat
falen (ADR 0077 punt 2 en 6; ST-15, bouwsteen M3). Geen nieuw ADR: vorm, contracttest en handmatige run zijn in 0077 besloten.

## Rollen en wie wat ziet

n.v.t. — geen gebruiker, rol of scherm. Wie een koppeling bouwt (developer, tester) volgt de vorm; de check en de suite houden
een afwijking tegen. De partner ziet alleen bij de handmatige run iets: de verzoeken van de adapter, met testsleutels.

## Datawijzigingen (met grants)

n.v.t. — geen migratie, tabel of functie. De suite raakt geen database (OV-1).

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| — | geen nieuwe route | — | bestaand: `UPSTREAM_INVALID` 502, `UPSTREAM_UNAVAILABLE` 503, `UPSTREAM_TIMEOUT` 504 |

### De vaste vorm

Eén map per koppeling: `src/api/integrations/<naam>/`, met `<naam>` gelijk aan de naam in het register
(`src/api/integrations/index.ts`, patroon `^[a-z][a-z0-9-]*$`). Precies deze vijf onderdelen, niets anders (OV-3):

| Onderdeel | Rol | Mag niet |
|---|---|---|
| `port.ts` | `interface <Naam>Port` in domeintermen: methoden met domeinwaarden in en uit (bijv. `item(id): Promise<Item>`), types uit `src/shared` of eigen types | importeren uit `src/core/api/outbound`, `src/core/api/integrations`, `./adapter.ts` of `./schemas.ts` (depcruise `poort-zonder-http`); HTTP-status, headers of `OutboundResult` in de signatuur |
| `adapter.ts` | `export const create<Naam>Adapter: Adapter<<Naam>Port>`: de enige plek die `client.call` aanroept, met `call.reading` en `call.requestId`; vertaalt het partnerantwoord naar het domein; een verwachte status via `expect` naar een eigen uitkomst (bijv. `null` of een eigen foutcode) | een `UPSTREAM_*`-fout afvangen of omzetten (de route beslist over een uitval, spec partnerstap); eigen `fetch` (`rails/netwerk-api`); `readSwitch` of een transactie |
| `schemas.ts` | zod-schema's voor de partnerantwoorden, alleen de velden die de adapter gebruikt; gewoon `z.object` (onbekende velden worden gestript) | `.strict()`, `.passthrough()` of `.loose()`: een partner voegt velden toe zonder aankondiging, en een onbekend veld mag het domein niet bereiken (OV-10) |
| `contract.test.ts` | roept `describeContract(contract, cases)` aan met `name: '<naam>'` als letterlijke tekst | de generieke gevallen weglaten (kan niet: de fabriek voegt ze toe) |
| `fixtures/` | map met vastgelegde antwoorden van de testomgeving van de partner, minstens één bestand (submappen tellen mee), bij voorkeur `.json` (`import … with { type: 'json' }`) | geheimen, tokens, echte persoonsgegevens of echte account-ID's: waarden worden bij het vastleggen vervangen door fictieve (OV-9) |

De adapter krijgt zijn `IntegrationClient` van buiten: de compositie-root maakt hem met `integrations.client(naam, config)` en
geeft hem aan `create<Naam>Adapter`; de route krijgt de poort via `ctx.services` en kent alleen `port.ts` (depcruise
`koppeling-via-poort`). In een partnerstap: `call: ({ input, reading, requestId, services }) =>
services.<naam>({ reading, requestId }).item(input.id)`.

**Env per partner.** `src/api/env.ts` exporteert per partner één schemafunctie `(ctx: EnvContext) => z.ZodType<…>` met
`secret(ctx, { livePattern })` voor de sleutel; de app-env en `live()` (hieronder) gebruiken dezelfde functie, er is geen tweede
schema.

### Nieuwe types in core

In `src/core/api/integrations/types.ts`, geëxporteerd via `index.ts` (geen `any`, ≤ 3 parameters):

```ts
interface AdapterCall { readonly reading: SwitchReading; readonly requestId: string }
type Adapter<Port> = (client: IntegrationClient) => (call: AdapterCall) => Port;
```

### Testlezing (OV-1, OV-2)

`IntegrationClient.call` eist een `SwitchReading` die `readSwitch` maakte; `readSwitch` werkt alleen onder de markering en
leest via `readIntegrationSwitch` de transactie. `testing.ts` maakt de testlezing zoals `src/core/api/integrations/client.test.ts`:
`guardWithUser` om een `withUser` zonder database, met een stub-transactie
`unsafeCast<Tx>({ execute: async () => ({ rows: [{ enabled }] }) }, 'testlezing: readIntegrationSwitch leest alleen rows[0].enabled')`,
en daarin de echte `readSwitch(tx, name)`. `reading.ts`, de `WeakSet` en de controles in `IntegrationClient.call` (markering,
lezing, leeftijd, stand) veranderen niet: de bescherming uit spec koppelingsregister blijft zoals ze is.

### Contracttestfabriek

`src/core/api/integrations/testing.ts` (alleen tests). Hij importeert `describe` en `test` uit `vitest` (OV-4),
`startFakePartner` uit `src/core/api/outbound/testing.ts`, `guardWithUser` uit `src/core/api/outbound/index.ts`, `readSwitch`
uit `index.ts`, `registerIntegrations` uit `src/core/api/integrations/register.ts` en `readEnv` uit `src/core/api/env.ts`.

```ts
describeContract<Port>(contract: ContractDef<Port>, cases: readonly ContractCase<Port>[]): void;
contractCases<Port>(contract: ContractDef<Port>, cases: readonly ContractCase<Port>[], target: 'fake' | 'live')
  : readonly { readonly name: string; readonly run: () => Promise<void> }[];
contractTarget(name: string, vars: { readonly CONTRACT_LIVE?: string; readonly CI?: string }): 'fake' | 'live';
class ContractError extends Error {}

interface ContractDef<Port> {
  readonly integrations: Integrations;         // het register van de app (src/api/integrations/index.ts)
  readonly name: string;                       // = mapnaam, letterlijk; niet in het register: ContractError
  readonly adapter: Adapter<Port>;             // uit adapter.ts
  readonly probe: {
    readonly route: string;                    // sleutel op de nep-partner, bijv. 'GET /items/i-1'
    readonly ok: FakeResponse;                 // uit fixtures/; status 2xx (of leeg), json een object of lijst van objecten
    readonly run: (port: Port) => Promise<unknown>; // één poortaanroep die precies die route raakt
  };
  readonly live: () => IntegrationClientConfig; // alleen in live-modus aangeroepen
}
interface ContractCase<Port> {
  readonly name: string;                       // uniek, niet gelijk aan een generiek geval
  readonly fake: FakeRoutes;                   // antwoorden uit fixtures/
  readonly run: (port: Port, partner: FakePartner | null) => Promise<void>; // eigen expect; partner null bij live
  readonly live?: true;                        // ook in de handmatige run (alleen vorm toetsen, geen vaste waarden)
}
```

- `describeContract` = `describe('contract <naam>', …)` met per element van `contractCases(contract, cases,
  contractTarget(name, readEnv(schema)))` één `test(name, run)`. In live-modus begint elke testnaam met `live: `.
- **Elk geval** start een eigen nep-partner (fake) of gebruikt `live()` (live), maakt een verse testlezing (stand aan, tenzij
  anders vermeld) en een eigen `requestId` `contract-<n>-<willekeurig>`, roept `adapter(client)({ reading, requestId })` aan en
  sluit de nep-partner in `finally`. Client in fake-modus: een eigen register met dezelfde naam, `hosts: ['127.0.0.1']` en vaste
  test-kenmerken, config `{ baseUrl: partner.url, appEnv: 'test', timeoutMs: 250, budgetMs: 1000, maxAttempts: 1, log }` met een
  opgevangen log. Client in live-modus: `contract.integrations.client(name, contract.live())`, dus met de echte hosts.
- **Opbouwfouten** (`ContractError` bij het opbouwen, vóór elke aanroep): naam niet in `integrations`; `probe.ok.status` gezet en
  niet 2xx; `probe.ok.json` geen object of lijst van objecten; dubbele of generieke casenaam; in live-modus: geen geval met
  `live: true`, of `live().appEnv` niet `'test'`.

**Generieke gevallen**, altijd toegevoegd in fake-modus, elk op `probe.route` (melding bij falen: `ContractError` met het geval
en wat afwijkt, nooit een partnerbody):

| Geval | Nep-partner op `probe.route` | Verwacht |
|---|---|---|
| geslaagd | `probe.ok` | `probe.run` slaagt; `partner.requests.length` is 1; elke logregel heeft `outbound` = naam en `requestId` = die van het geval |
| extra veld | `probe.ok` met veld `contractExtraVeld: 'x'` in het object (of in elk object van de lijst) | `probe.run` slaagt |
| uitgezet | `probe.ok`, testlezing met stand uit | `AppError` `UPSTREAM_UNAVAILABLE`, 0 aanroepen |
| time-out | `probe.ok` met `delayMs` 1000 | `AppError` `UPSTREAM_TIMEOUT`, 1 aanroep |
| niet bereikbaar | `destroy: true` | `AppError` `UPSTREAM_UNAVAILABLE` |
| tijdelijk niet beschikbaar | status 503 | `AppError` `UPSTREAM_UNAVAILABLE` |
| serverfout | status 500, body met `partner-geheim` | `AppError` `UPSTREAM_UNAVAILABLE`; `partner-geheim` niet in `message` of `JSON.stringify` van de fout |
| geen JSON | status 200, `content-type: text/plain`, body `geen json` | `AppError` `UPSTREAM_INVALID` |
| ongeldig antwoord | status 200, `json: 'x'` | `AppError` `UPSTREAM_INVALID` |

Daarna de eigen gevallen van de app, in fake-modus allemaal, in live-modus alleen die met `live: true` (de generieke gevallen
kunnen tegen een echte partner niet worden afgedwongen).

**Doel kiezen** (`contractTarget`, OV-5), zonder `process.env` buiten `src/core/api/env.ts` (R-LAAG-08): `describeContract` leest
`CONTRACT_LIVE` en `CI` met `readEnv`. Beide zijn testvariabelen; ze komen niet in `.env.example` (geen check eist dat).

| `CONTRACT_LIVE` | `CI` (niet leeg) | Uitkomst |
|---|---|---|
| leeg of niet gezet | — | `fake` |
| buiten het naampatroon | — | `ContractError` (geen stille fake) |
| gezet | gezet | `ContractError` "handmatige run nooit in CI" |
| gelijk aan `name` | niet gezet | `live` |
| andere geldige naam | niet gezet | `fake` |

**Handmatige run** (R-UIT-07). `live()` leest baseUrl en sleutel met de schemafunctie van de partner uit `src/api/env.ts`
(`readEnv`); met `APP_ENV=test` weigert `secret()` een live-sleutel. De waarden staan alleen in de shell van die run, nooit in een
`.env*`-bestand; `test:unit` laadt geen `.env`. Terminal in de werkmap van de app, sleutel uit de wachtwoordkluis:

1. Typ de testsleutel (niet zichtbaar, niet in de geschiedenis):

```
read -rs <PARTNER>_KEY
```

2. Draai de suite; de variabelen gelden alleen voor dit commando:

```
<PARTNER>_KEY="$<PARTNER>_KEY" <PARTNER>_BASE_URL='<testomgeving>' APP_ENV=test CONTRACT_LIVE=<naam> pnpm exec vitest run --project unit src/api/integrations/<naam>/contract.test.ts
```

Verwachte uitkomst: alle tests met `live: ` groen; commando (zonder waarden) en uitkomst gaan in de PR.

### Check

`scripts/kit/check-koppelingsvorm.mjs` (vorm van `check-policies.mjs`: pure functies, aangeroepen door een test; geen nieuw
`package.json`-script en geen wijziging in `scripts/kit/gates.mjs`, want `test:unit` dekt `test/rails` al):

```js
koppelingsmappen(root = '.'): Item[]  // leest src/api/integrations (ontbreekt de map: []); per item naam, soort (map, bestand
                                      // of symlink), de onderdelen op het eerste niveau met hun soort, het aantal bestanden in
                                      // fixtures/ (recursief) en de tekst van contract.test.ts
koppelingsvormFouten({ items, names }): string[]  // names: de geregistreerde namen
```

Namen die met `.` beginnen negeert de check overal (ook in `fixtures/`, waar ze niet als bestand tellen). Een fout per
afwijking, met map en regel:

- een los bestand naast `index.ts` (bijv. `helper.ts`);
- een symlink, waar ook onder `src/api/integrations/`;
- een map met een naam buiten het patroon;
- een map zonder `port.ts`, `adapter.ts`, `schemas.ts`, `contract.test.ts` of `fixtures/` (per ontbrekend onderdeel een fout);
- een onderdeel van de verkeerde soort (bijv. een map `port.ts` of een bestand `fixtures`);
- een map met een ander onderdeel dan die vijf;
- `fixtures/` zonder bestand;
- `contract.test.ts` zonder `describeContract(` of zonder de mapnaam als letterlijke tekst (`'<naam>'` of `"<naam>"`);
- een map waarvan de naam niet in `names` staat;
- een naam in `names` zonder map.

De namen komen uit het register zelf: de test importeert `integrations` uit `src/api/integrations/index.ts` (bijwerkingvrij,
spec koppelingsregister) en geeft `integrations.names` door; het script hoeft dus geen `.ts` te laden.

De test `test/rails/koppelingsvorm.test.ts` draait de check op de repo (verwacht `[]`) en op fixture-mappen die hij in een
tijdelijke map onder `TMPDIR` aanmaakt (`test/setup/tmp-root.ts` ruimt op), zodat er geen `.ts`-fixtures in typecheck, lint of
depcruise komen. In een app blijft hij staan: `test/**` is een gate-pad, een verwijderde test valt buiten de feature-lane en
R-TEST-02 vraagt eigenaarakkoord; een template-update brengt hem mee.

### Depcruise (OV-7)

`.dependency-cruiser.mjs`, elk met een fixture in `test/rails/fixtures/depcruise/` en een rij in `test/rails/depcruise.test.ts`:

- `koppeling-via-poort`: van `^src/api/routes/` naar `^src/api/integrations/[^/]+/(adapter|schemas)\.ts$`.
- `poort-zonder-http`: van `^src/api/integrations/[^/]+/port\.ts$` naar `^src/core/api/(outbound|integrations)/` of
  `^src/api/integrations/[^/]+/(adapter|schemas)\.ts$`.
- `testing-alleen-in-tests`: `to.path` wordt `^src/core/api/(db|outbound|integrations)/testing\.ts$`, en `from.pathNot` laat
  naast testbestanden ook die drie `testing.ts`-modules toe (de fabriek gebruikt de nep-partner). Deze regel is de grens die
  `vitest` en de testlezing uit productiecode houdt; `deploy/` valt buiten de cruise (vervolgpunt, niet in deze PR).

## Kopieer de vorm van

- `scripts/kit/check-policies.mjs` — check als pure functie plus bestandslezer, zonder eigen script.
- `test/rails/check-policies.test.ts` — test die de check op de repo en op invoer met een fout draait.
- `src/core/api/outbound/testing.ts` — testhulp alleen voor tests; nep-partner met teller.
- `src/core/api/integrations/client.test.ts` — lezing via `guardWithUser` zonder database, client tegen de nep-partner, teller 0.
- `test/rails/depcruise.test.ts` — fixture per depcruise-regel.

## Hergebruik en UX

n.v.t. — geen scherm; de teksten van de `UPSTREAM_*`-codes bestaan (spec uitgaande-client).

## Acceptatiecriteria

"Proefpartner" is een fictieve koppeling `proefpartner` die alleen in `src/core/api/integrations/testing.test.ts` bestaat
(poort, adapter en schema in dat bestand). "Aanroep" telt de nep-partner.

- **koppelingsvorm/AC-1** — Gegeven een geregistreerde map met alle vijf onderdelen, een bestand in `fixtures/` en
  `describeContract(` plus de mapnaam als letterlijke tekst in `contract.test.ts`, dan geeft de check `[]`. Ontbreekt één van
  `port.ts`, `adapter.ts`, `schemas.ts`, `contract.test.ts` of `fixtures/` (elk apart), dan precies één fout die de map en dat
  onderdeel noemt.
- **koppelingsvorm/AC-2** — Gegeven een map die niet in `names` staat, een naam in `names` zonder map, een los bestand naast
  `index.ts`, een extra bestand in een map, een lege `fixtures/`, een `contract.test.ts` zonder `describeContract(`, of een
  `contract.test.ts` zonder de mapnaam als letterlijke tekst, dan elk een fout; op de repo zelf geeft de check `[]`.
- **koppelingsvorm/AC-3** — Gegeven een map `Proef_Partner` (buiten het patroon), een map `port.ts` in plaats van een bestand,
  een bestand `fixtures`, of een symlink als onderdeel of in `fixtures/`, dan elk een fout.
- **koppelingsvorm/AC-4** — Gegeven `fixtures/` met alleen `.gitkeep`, dan de fout "fixtures zonder bestand"; met alleen een
  bestand in een submap geen fout; een `.DS_Store` naast de vijf onderdelen geeft geen fout. Ontbreekt `src/api/integrations`,
  dan `[]` zonder uitzondering.
- **koppelingsvorm/AC-5** — Gegeven de proefpartner met een juiste adapter, dan slagen in fake-modus alle negen generieke
  gevallen en de eigen gevallen; de casenamen bevatten de negen generieke; "geslaagd" telt `partner.requests.length` 1 en
  "uitgezet" 0; twee gevallen hebben nooit dezelfde `requestId`.
- **koppelingsvorm/AC-6** — Gegeven een foute adapter, dan faalt het genoemde geval met `ContractError`: (a) schema met
  `.strict()`: "extra veld"; (b) adapter vangt elke `AppError` af en geeft een standaardwaarde: "uitgezet", "time-out", "niet
  bereikbaar", "tijdelijk niet beschikbaar", "serverfout", "geen JSON" en "ongeldig antwoord"; (c) adapter geeft een vaste
  `requestId` mee: "geslaagd"; (d) adapter roept de client twee keer aan: "geslaagd". Bij a en b slaagt "geslaagd".
- **koppelingsvorm/AC-7** — Gegeven een eigen geval waarvan `run` een mislukte `expect` bevat, dan wijst `run` uit `contractCases`
  af met die fout; een eigen geval krijgt de nep-partner en ziet de verzoeken van de adapter.
- **koppelingsvorm/AC-8** — `contractTarget` geeft de uitkomsten uit de tabel "Doel kiezen", ook `ContractError` bij
  `CONTRACT_LIVE` en `CI` samen (voor dezelfde en een andere naam) en bij `CONTRACT_LIVE` `Proef!`.
- **koppelingsvorm/AC-9** — Gegeven `contractCases(…, 'live')` met `live()` naar een tweede nep-partner met `appEnv: 'test'`
  (die als testomgeving in een register met `127.0.0.1` staat), dan draaien alleen de gevallen met `live: true`, tegen die tweede
  partner; de eerste telt 0. Met `appEnv` `local`, `staging` of `production` in `live()`, of zonder geval met `live: true`:
  `ContractError` vóór elke aanroep. In fake-modus wordt `live()` niet aangeroepen (spion telt 0).
- **koppelingsvorm/AC-10** — Gegeven een naam die niet in `integrations` staat, een `probe.ok` met status 404, een
  `probe.ok.json` dat een tekst is, of een eigen geval met de naam van een generiek geval of een dubbele naam, dan
  `ContractError` bij het opbouwen, vóór elke aanroep.
- **koppelingsvorm/AC-11** — Een testlezing uit `testing.ts` wordt door `IntegrationClient.call` aanvaard; een kopie of
  nagemaakt object ervan niet (`OutboundUsageError`, 0 aanroepen). `reading.ts` is ongewijzigd en de bestaande tests van
  `readSwitch` en `call` blijven ongewijzigd groen.
- **koppelingsvorm/AC-12** — Depcruise: een route die `adapter.ts` of `schemas.ts` van een koppeling importeert faalt op
  `koppeling-via-poort`; een `port.ts` die uit `src/core/api/outbound` of uit `./adapter.ts` importeert op `poort-zonder-http`; een
  niet-testbestand dat `src/core/api/integrations/testing.ts` importeert op `testing-alleen-in-tests`; `integrations/testing.ts`
  zelf schendt geen regel.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Probe-antwoord is een lijst | "extra veld" zet het veld in elk object van de lijst | — |
| Adapter gebruikt `expect: [404]` en geeft `null` | toegestaan; een eigen geval toetst het | — |
| `CONTRACT_LIVE` met een geldige maar verkeerde naam | alles draait fake; de testnamen missen `live: `, dus de PR-uitkomst laat het zien | — |
| Handmatige run met een live-sleutel | `secret()` weigert hem buiten `production` (patroon uit het app-ADR) | — |
| `readIntegrationSwitch` krijgt een andere queryvorm | de testlezing faalt in de eigen test van `testing.ts` (OV-2) | — |
| Template zonder koppeling | check `[]`, geen contracttest | — |

## Raakt ook

- **Lane: feature.** Geen pad uit `KRITIEK` (`scripts/kit/lane.mjs`) of `altijdVragen` (`.claude/gates.json`): niet
  `package.json`, `.github/**`, `.claude/hooks/**`, `src/core/api/db/**`, `src/core/api/auth/**` of `scripts/kit/gates.mjs`; geen
  migratie, geen gewijzigde pgTAP-test, geen verwijderde test. Spec en bouw in één PR (ADR 0062). Paden met `voorReview`
  (`scripts/**`, `.dependency-cruiser.*`, `docs/framework.md`) schrijft de hoofdsessie.
- Code, nieuw: `src/core/api/integrations/testing.ts`, `scripts/kit/check-koppelingsvorm.mjs`. Gewijzigd:
  `src/core/api/integrations/types.ts` en `index.ts` (`AdapterCall`, `Adapter`), `.dependency-cruiser.mjs`. Niet gewijzigd:
  `reading.ts`, `client.ts`, `register.ts`.
- Tests, nieuw: `src/core/api/integrations/testing.test.ts` (AC-5 t/m AC-11), `test/rails/koppelingsvorm.test.ts` (AC-1 t/m
  AC-4), fixtures in `test/rails/fixtures/depcruise/`. Gewijzigd, alleen nieuwe rijen: `test/rails/depcruise.test.ts` (AC-12);
  de bestaande rijen blijven (R-TEST-02).
- Checks: `pnpm test:unit`, `pnpm lint`, `pnpm typecheck`, `pnpm ratchet` (met dependency-cruiser) en
  `test/rails/depcruise.test.ts`. Niet geraakt: `check:migrations`, `check:secdef`, `test:db`/policies, `check:snapshot`,
  `test/security/resources.ts`, permissietests per verboden rol (geen route of permissie).
- `docs/framework.md` (hoofdsessie, voorstel; de eigenaarmerge is het akkoord):
  - R-UIT-07: na "…vastgelegde antwoorden); eigen code en database blijven echt." komt "De contracttest van een koppeling
    (`describeContract` uit `src/core/api/integrations/testing.ts`) draait tegen de nep-partner met een testlezing van de
    schakelaar; de handmatige run is dezelfde suite met `CONTRACT_LIVE=<naam>` en `APP_ENV=test`, nooit in CI."
  - §4, nieuw: "**R-CODE-13** Een koppeling woont in `src/api/integrations/<naam>/` met precies `port.ts` (domeintypen, geen
    HTTP), `adapter.ts` (enige aanroeper van de client, vangt geen `UPSTREAM_*`), `schemas.ts` (strip, geen `.strict()`),
    `contract.test.ts` (`describeContract`) en `fixtures/` (geen geheimen of echte persoonsgegevens); `<naam>` staat in het
    register; een route kent alleen de poort; check `test/rails/koppelingsvorm.test.ts` (0077)".
- `docs/gouden-pad.md`, onder "Transactiegrens in de spec": één alinea dat een koppeling de vaste vorm van deze spec volgt, de
  adapter haar client van de compositie-root krijgt en de route de poort via `ctx.services` met `{ reading, requestId }` uit de
  partnerstap. Het volledige hoofdstuk volgt met de skill (M8).
- `docs/roadmap.md` ST-15: "Gebouwd:" krijgt "vaste vorm met contracttest en check (spec koppelingsvorm)"; niet afvinken.
- `.claude/rules/*`: niets; R-UIT-07 en R-CODE-12 staan daar niet, R-CODE-13 dus ook niet. `AGENTS.md`: niets (budget).
- Gebouwde specs: geen tekst wordt onwaar; de bescherming uit spec koppelingsregister (`WeakSet` in `reading.ts`, controles in
  `call`) blijft ongewijzigd.

## Buiten scope

Een nep-adapter in het geheugen (OV-6); een check die fixtures op persoonsgegevens scant (OV-9); een regel dat alleen
`adapter.ts` `client.call` aanroept (niet met depcruise uit te drukken: de types komen uit dezelfde index; R-CODE-13 en review);
`deploy/` in de dependency-cruise (vervolgpunt); schrijven, terugbellen en tokens per gebruiker (ST-03, M4 t/m M6); skill
`nieuwe-koppeling`, paragraaf "Koppeling" in het spec-template en de feiten (M8); de securitysuite voor partnerroutes
(vervolgtaak uit spec partnerstap).

## Testplan

- **Unit** (`src/core/api/integrations/testing.test.ts`): proefpartner met juiste en vier foute adapters via `contractCases`
  (AC-5 t/m AC-7, AC-9, AC-10); `contractTarget` als tabel (AC-8); testlezing tegen `call` met kopie en nagemaakt object (AC-11).
  Eén `describeContract`-aanroep voor de juiste proefpartner bewijst dat de suite zich registreert.
- **Rails** (`test/rails/koppelingsvorm.test.ts`): fixture-mappen in een tijdelijke map (AC-1 t/m AC-4) en de repo zelf.
  `test/rails/depcruise.test.ts`: nieuwe rijen (AC-12).
- Geen integratietest: de schakelaar in `withUser` bewijzen de bestaande tests in `test/integrations/`; de suite raakt geen
  database. Geen handmatige run in deze PR: de template heeft geen partner.

## Open vragen

- **OV-1** — Contracttest in `test:unit` met een testlezing, of `contract.int.test.ts` in `test:db` met echte `withUser`?
  Aanbeveling: unit. De suite toetst adapter tegen partnerantwoorden, niet de schakelaar (getest in spec koppelingsregister);
  met database vraagt elke koppeling gebruikers, rollen en een schakelaarrij, en draait de suite alleen in de runner, ook bij de
  handmatige run. R-TEST-01 eist "nooit gemockt" voor integratietests; dit is een unittest.
- **OV-2 ✅ besloten** (spec-review) — De testlezing komt uit de echte `readSwitch` onder `guardWithUser`, met een
  stub-transactie via `unsafeCast` (vorm `client.test.ts`); geen eigen module voor de `WeakSet` en geen wijziging aan
  `reading.ts`. Nadeel: `testing.ts` hangt af van de queryvorm van `readIntegrationSwitch` (`execute` met `rows[0].enabled`);
  wijzigt die, dan faalt de eigen test van `testing.ts`. Die koppeling blijft binnen core.
- **OV-3** — Precies vijf onderdelen, ook geen extra hulpbestand of extra test? Aanbeveling: ja, nu strikt; een grote adapter
  vraagt eerst een nieuwe spec. Losser maken kan later zonder breuk, strenger niet.
- **OV-4** — Mag `testing.ts` in core `vitest` importeren? Aanbeveling: ja; anders roept de app zelf `test()` per geval aan en
  kan hij generieke gevallen wegfilteren zonder dat de check het ziet. `testing-alleen-in-tests` houdt het uit productiecode
  onder `src/`. Weigert een bestaande lint- of depcruiseregel het: stop en meld, niet omzeilen.
- **OV-5** — Live kiezen met `CONTRACT_LIVE=<naam>`, hard falen bij `CI` of een ongeldige naam, en `appEnv` `'test'` eisen?
  Aanbeveling: ja; zonder variabele altijd fake, en elke twijfelgeval faalt hard in plaats van stil fake of live te draaien.
- **OV-6** — Ook een nep-adapter (de poort in het geheugen) voor routetests? Aanbeveling: nee; de echte adapter tegen de
  nep-partner dekt dat zonder tweede implementatie die kan afwijken.
- **OV-7** — De depcruise-regels `koppeling-via-poort` en `poort-zonder-http` erbij? Aanbeveling: ja; elk één regel plus
  fixture, zonder eigen script.
- **OV-8** — Nieuwe R-CODE-13 naast een zin in R-UIT-07? Aanbeveling: ja; de vorm is een coderegel, de handmatige run een
  uitzondering op het testen. Beide verwijzen naar 0077.
- **OV-9** — Fixtures automatisch scannen op persoonsgegevens? Aanbeveling: nee, nu niet; geheimen vangt de bestaande
  secretscan, persoonsgegevens de review. Pas met ST-05 (`personal-data`) opnieuw bekijken.
- **OV-10** — Schema's strip of strict? Aanbeveling: strip (gewone `z.object`); het generieke geval "extra veld" dwingt het af.
  `.strict()` blijft voor route-input (R-CODE-03).
- **OV-11 ✅ besloten** (spec-review) — Naambinding tussen map en `describeContract`: de check eist de mapnaam als letterlijke
  tekst in `contract.test.ts`. De naam afleiden uit het testpad kan vitest bij het opbouwen niet betrouwbaar geven.
