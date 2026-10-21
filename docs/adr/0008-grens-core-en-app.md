# 0008 — Grens tussen core en app

Status: vervangen door 0040
[ADR 0001](0001-stack-en-architectuur.md) (`src/web`, `src/api`, `src/shared` als enige mappen) en [ADR 0003](0003-auth-in-de-api.md)
(Better Auth in `src/api/auth`); de inhoud van die besluiten blijft staan.

## Context

Een app krijgt de frameworkcode als kopie ("Use this template") en haalt updates binnen met `git merge template/main` (ADR 0006).
Staan frameworkcode en app-code in dezelfde bestanden of mappen, dan wijzigt de app wat de template later ook wijzigt, en
conflicteert elke update. Een app die `withUser()`, de CSRF-middleware of het foutcoderegister aanpast, krijgt bovendien
beveiligingsfixes uit de template niet meer schoon binnen.

## Besluit

**Twee zones.** `src/core/{api,web,shared}` is van de template: beschermd (CODEOWNERS, `ask`, `check-core`) en in een app
alleen gewijzigd door een template-merge. App-code staat in `src/{api,web,shared}`. Dezelfde lagen gelden in beide zones
(framework §2): `core/web` en `web` praten alleen via de API; `core/shared` en `shared` importeren niets uit `web` of `api`.

**Richting.** App mag core importeren; core importeert nooit app (dependency-cruiser). Wat core van de app nodig heeft
(permissies, foutcodes, routes, contracten, env-uitbreiding), krijgt het als argument van een **compositie-root** in de app,
niet via een import. Er is geen globale registratie en geen mutable singleton.

**Plaats per onderdeel**

| Onderdeel | Core (template) | App (uitbreiding, zonder core te wijzigen) |
|---|---|---|
| `defineRoute`, `ctx.actor` | `core/api/route/` — `createRouteKit({ permissions })` levert een getypte `defineRoute` | `api/kit.ts` maakt de kit; routes in `api/routes/<resource>.ts` |
| `withUser`, pool, foutvertaling | `core/api/db/` (exporteert alleen `withUser()`) | — (Drizzle-schema en `ids.ts` gegenereerd in `api/db/`) |
| Auth (Better Auth, sessie, `session_strength`) | `core/api/auth/` | Alleen via ADR: extra plugin of veld |
| CSRF, `bodyLimit`, `secureHeaders`, `onError` | `core/api/http/` — `createApp(config)` zet ze in vaste volgorde | `api/app.ts` geeft config (bijv. `bodyLimit` binnen de harde grens uit core) |
| Logging | `core/api/obs/` | Velden toevoegen via `createApp`-config |
| Env | `core/api/env.ts` (enige `process.env`) — basisschema + `loadEnv(appSchema)`; `core/web/lib/env.ts` (enige `import.meta.env`) | `api/env.ts` en `web/lib/env.ts`: alleen het eigen schema |
| API-client | `core/web/lib/api-client.ts` (enige `fetch(`) — `createApiClient<Contracts>()`, getypt op de contracten uit `shared/contracts` | `web/lib/api.ts`: één regel die de client maakt |
| Auth-client | `core/web/lib/auth.ts` (enige `better-auth/react`) | — |
| `AsyncView`, `Form`/`FormField` | `core/web/ui/` | — |
| UI-kit, tokens | `core/web/ui/` (recepten exporteren basis en variantkaarten), `core/web/styles/` (primitief, component, standaard semantisch) | `web/ui/` (eigen componenten en barrel), `web/styles/theme.css` (semantische laag) |
| `format` | `core/web/lib/format.ts` | — |
| `assert`, `unsafeCast`, `Cents`, cursor | `core/shared/` | — |
| Branded IDs | `core/shared/ids.ts` (`brand()`-helper, `UserId`) | `shared/ids.ts` |
| Foutcodes | `core/shared/errors.ts` (basiscodes), `core/web/copy/errors.ts` (tekst) | `shared/errors.ts`, `web/copy/errors.ts` |
| Permissies, `can()` | `core/shared/can.ts` (engine, MFA-eis voor de rol `admin`, permissie `app.use`) | `shared/permissions.ts` (tabel) |
| Limieten | `core/shared/limits.ts` (harde grenzen: body, paginagrootte) | `shared/limits.ts` |

**Uitbreiden zonder edit**

- *Permissies*: `shared/permissions.ts` roept `definePermissions({ 'notes.read': { roles: [...] }, 'users.manage': { roles: ['admin'] } })`
  aan en exporteert `can`. `createRouteKit({ permissions })` maakt het `permission`-veld van `defineRoute` een union van precies die sleutels.
  De MFA-eis leidt core af uit de rol: elke permissie die `admin` heeft, eist `mfa`; de app kan dat niet uitzetten. De RLS-helper
  kijkt naar dezelfde rol in `user_roles`, zodat `can()` en RLS niet uit elkaar lopen. Core levert `app.use` (elke ingelogde rol)
  voor gewone ingelogde schermen.
- *Foutcodes*: `shared/errors.ts` doet `defineErrorCodes(['NOTE_LOCKED'])`; `ErrorCode = CoreErrorCode | AppErrorCode`.
  `web/copy/errors.ts` is `{ ...coreErrorCopy, NOTE_LOCKED: '…' } satisfies Record<ErrorCode, string>`; een basistekst
  overschrijven mag daar, een code vergeten faalt in TypeScript.
- *Limieten*: `shared/limits.ts` exporteert eigen grenzen en hergebruikt core-grenzen; een app-waarde boven een harde grens
  uit core weigert `createApp` bij opstart.
- *Componentvarianten*: een app maakt in `web/ui/` een nieuw recept uit de geëxporteerde basis en variantkaart van core
  (`cva(buttonBase, { variants: { ...buttonVariants, tone: {…} } })`). `web/ui/index.ts` her-exporteert core plus eigen
  componenten en is de enige importbron voor `features/`.

**De UI-kit groeit** zo: een basiscomponent dat elke app kan gebruiken, komt via een PR in de template (`core/web/ui`) en
bereikt apps met de volgende merge. Een app-specifiek component staat in `src/web/ui` van de app. Bouwt een app iets dat
later in de template komt, dan vervangt de app het eigen component na de merge door de core-versie.

**Wat in de template in app-paden staat** (compositie-roots `api/app.ts`, `api/kit.ts`, `api/server.ts`, `web/lib/api.ts`, de
referentie-feature gebruikersbeheer en de app-tabellen in `permissions.ts`/`errors.ts`) is startinhoud: na het aanmaken van
de app beheert de app het. De template houdt die bestanden klein en wijzigt ze zelden; een conflict daar is verwacht en lokaal op te lossen.

**Compositie-roots kunnen de rails niet omzeilen.** `createApp(config)` accepteert alleen `RouteDef[]` uit `defineRoute` en geeft
alleen `{ fetch }` terug, dus de app kan geen route of middleware buiten core om toevoegen. Lint verbiedt `hono`-imports buiten
`src/core`; een core-test somt alle routes op en controleert de middleware-volgorde. Config die beveiliging raakt (bijv. `bodyLimit`)
mag alleen binnen een harde grens van core.

**Beschermd ≠ core.** Beschermd is alles wat alleen met akkoord van de eigenaar verandert (framework §10). Core is daarvan het
deel dat een app helemaal niet wijzigt. App-paden die beschermd blijven: de compositie-roots (`src/api/app.ts`, `kit.ts`, `server.ts`),
`src/api/env.ts`, `src/shared/permissions.ts` en `deploy/`.

**Afdwingen.** dependency-cruiser (richting core → app verboden), CODEOWNERS en `ask` op `src/core/`, en `check-core` in `guard.yml`
(dus de versie van `main`): een PR in een app die `src/core/` wijzigt, faalt, tenzij het een template-merge is. Dat telt alleen als
(1) de tweede ouder `P2` een voorouder is van `template/main`, opgehaald van de vaste template-URL; (2) `git diff P2 <merge> -- src/core`
leeg is (geen eigen wijziging in de merge zelf); (3) geen ander commit in de PR `src/core/` raakt. In de template zelf is `check-core` uit.
Een fout in core die een app raakt, wordt in de template opgelost, niet in de app.

## Alternatieven

- **Core als npm-pakket**: schone versies, maar een release-proces vóór de eerste app en tweerichtingswerk bij elke fix;
  ADR 0006 noemt dit pas zinvol als core stabiel is. Deze grens maakt die stap later mechanisch.
- **Geen zones, alleen afspraak "raak frameworkbestanden niet aan"**: niet af te dwingen per map; conflicten blijven.
- **Registratie via module augmentation of globale registry**: werkt zonder compositie-root, maar verbergt de afhankelijkheid
  en maakt tests volgordeafhankelijk.

## Gevolgen

- Framework §2, §3, §5, §7, §10 en §11a, `.claude/rules/`, CODEOWNERS en `ask` noemen de nieuwe paden; `.claude/rules/core.md` is nieuw.
- Pad-aliassen via `imports` in `package.json` (`#core/*`, `#api/*`, `#web/*`, `#shared/*`; framework §4), vastgelegd in het skelet.
- Fase 0 (`withUser()`) bouwt direct in `src/core/api/db`.
- `check-core` en de dependency-cruiser-regel horen bij "rails afdwingen" in de roadmap.
- Core krijgt een tweede soort gebruiker (de app via config); elke uitbreidingsplek heeft een test in core die bewijst dat een app
  hem kan gebruiken zonder core te wijzigen.

## Aanvulling (2026-10-09, PR 5b)

De API-client is getypt op contracten in `src/shared/contracts` (`createContracts(permissions).defineContract`) in plaats van
op `AppType` uit `src/api/app.ts`. Web importeert daardoor niets meer uit `src/api`, ook geen types; de dependency-cruiser-regel
`web-niet-naar-api` kent geen uitzondering meer. Server en client lezen hetzelfde zod-schema: `createApp` valideert input en
output ertegen, de client vertrouwt de output op die grond.
