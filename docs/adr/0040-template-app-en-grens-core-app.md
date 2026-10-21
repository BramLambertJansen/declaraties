# 0040 — Template, app en de grens core/app

Status: geaccepteerd

Vervangt [0006](0006-app-uit-template.md), [0008](0008-grens-core-en-app.md) en [0037](0037-check-core-correcties.md).
Drempel: A4. Consolidatie zonder inhoudelijke wijziging (eigenaarbesluit 2026-10-21, [0038](0038-beslisroute.md) Gevolgen).

## Context

Een app ontstaat met **Use this template**: nieuwe geschiedenis, geen instellingen of rulesets mee. Updates komen binnen met
`git merge template/main`. Staan frameworkcode en app-code in dezelfde bestanden, dan conflicteert elke update, en een app die
`withUser()`, de CSRF-middleware of het foutcoderegister aanpast, krijgt beveiligingsfixes niet meer schoon binnen.

## Besluit

**Koppeling en start**

1. **Koppelen** (was 0005 Gevolgen). De app koppelt eenmalig met een `ours`-merge van `template/main`; daarna gewone merges.
2. **Merge-commit voor de template** (was 0006). De koppeling en elke template-update landen als merge-commit; gewone PR's
   blijven squash. De ruleset staat merge en squash toe, rebase niet.
3. **Eerste push door de eigenaar** (was 0006). De koppeling en de hernoeming gaan naar `main` vóór de ruleset bestaat;
   daarna gaat alles via PR.
4. **ADR-nummers** (was 0006). `0001`–`0099` zijn van de template; app-ADR's beginnen bij `0100`.
5. **Tussentijdse ruleset** (was 0006). Tot de GitHub App voor de agent bestaat: PR verplicht, geen force push of delete,
   0 goedkeuringen, geen code-owner-review. Met de App gaan code-owner-review en 1 goedkeuring aan.
6. **Setup als playbook** (was 0006). `docs/nieuwe-app.md` is de instructie van machine tot draaiende stack. De agent start
   de app-stack niet met Docker; dat doet de eigenaar.
7. **Hosting-ADR bij de eerste release** (was 0006), niet bij de start van een app.

**Twee zones**

8. **Core en app** (was 0008). `src/core/{api,web,shared}` is van de template: beschermd en in een app alleen gewijzigd door
   een template-merge. App-code staat in `src/{api,web,shared}`. Dezelfde lagen gelden in beide zones (`docs/framework.md` §2).
9. **Richting** (was 0008). App mag core importeren; core importeert nooit app. Wat core van de app nodig heeft (permissies,
   foutcodes, routes, contracten, env-uitbreiding), krijgt het als argument van een compositie-root in de app. Geen globale
   registratie, geen mutable singleton.
10. **Plaats per onderdeel** (was 0008, tabel). Paden onder `src/`; "—" betekent: de app breidt dit niet uit.

    | Onderdeel | Core (template) | App (uitbreiding, zonder core te wijzigen) |
    |---|---|---|
    | `defineRoute`, `ctx.actor` | `core/api/route/` (`createRouteKit({ permissions })`) | `api/kit.ts`; routes in `api/routes/<resource>.ts` |
    | `withUser`, pool, foutvertaling | `core/api/db/` (exports: [0042](0042-database-en-datapad.md) punt 9) | — (gegenereerd Drizzle-schema en `ids.ts` in `api/db/`) |
    | Auth (Better Auth, sessie, `session_strength`) | `core/api/auth/` | Alleen via ADR: extra plugin of veld |
    | CSRF, `bodyLimit`, `secureHeaders`, `onError` | `core/api/http/` (`createApp(config)`, vaste volgorde) | `api/app.ts` geeft config, binnen de harde grens uit core |
    | Logging | `core/api/obs/` | Velden via `createApp`-config |
    | Env | `core/api/env.ts` (enige `process.env`), `core/web/lib/env.ts` (enige `import.meta.env`) | `api/env.ts`, `web/lib/env.ts`: alleen het eigen schema |
    | API-client | `core/web/lib/api-client.ts` (enige `fetch(`) | `web/lib/api.ts`: maakt de client |
    | Auth-client | `core/web/lib/auth.ts` (enige `better-auth/react`) | — |
    | `AsyncView`, `Form`, `format`, `assert`, `unsafeCast`, `Cents`, cursor | `core/web/ui/`, `core/web/lib/format.ts`, `core/shared/` | — |
    | UI-kit, tokens | `core/web/ui/` (basis en variantkaarten), `core/web/styles/` | `web/ui/` (eigen componenten en barrel), `web/styles/theme.css` |
    | Branded IDs | `core/shared/ids.ts` (`brand()`, `UserId`) | `shared/ids.ts` |
    | Foutcodes | `core/shared/errors.ts`, `core/web/copy/errors.ts` | `shared/errors.ts`, `web/copy/errors.ts` |
    | Permissies, `can()` | `core/shared/can.ts` (engine, MFA-eis voor `admin`, permissie `app.use`) | `shared/permissions.ts` (tabel) |
    | Limieten | `core/shared/limits.ts` (harde grenzen) | `shared/limits.ts` |

11. **Uitbreiden zonder edit** (was 0008). Permissies via `definePermissions` en `createRouteKit({ permissions })`; elke
    permissie die de rol `admin` heeft, eist `mfa`, en dat kan de app niet uitzetten; de RLS-helper kijkt naar dezelfde rol.
    Foutcodes via `defineErrorCodes`, met teksten die TypeScript compleet houdt; een basistekst overschrijven mag. Een
    app-limiet boven een harde grens uit core weigert `createApp` bij opstart.
    Componentvarianten bouwt de app uit de geëxporteerde basis van core; `src/web/ui/index.ts` is de enige importbron voor
    `features/`. Een basiscomponent voor elke app komt via de template in `src/core/web/ui`.
12. **Contracten** (was 0008 Aanvulling). De API-client is getypt op `src/shared/contracts`; web importeert niets uit
    `src/api`, ook geen types. Server en client lezen hetzelfde zod-schema.
13. **Startinhoud** (was 0008). Compositie-roots, de referentie-feature en de app-tabellen in `permissions.ts`/`errors.ts`
    staan in de template in app-paden; na het aanmaken beheert de app ze. Een conflict daar is verwacht.
14. **Compositie-roots omzeilen de rails niet** (was 0008). `createApp(config)` accepteert alleen routes uit `defineRoute`
    en geeft alleen `{ fetch }` terug; `hono` alleen in `src/core`; config die beveiliging raakt, alleen binnen een harde
    grens van core.
15. **Beschermd is niet hetzelfde als core** (was 0008). Beschermd verandert alleen met akkoord van de eigenaar
    (`docs/framework.md` §10); core wijzigt een app helemaal niet. Beschermde app-paden: de compositie-roots
    (`src/api/app.ts`, `kit.ts`, `server.ts`), `src/api/env.ts`, `src/shared/permissions.ts` en `deploy/`.

**Afdwingen** (was 0008, met de correcties van 0037)

16. Dependency-cruiser (core → app verboden), CODEOWNERS en `ask` op `src/core/`, en de job `check-core` in `guard.yml`, met
    de scripts van main. Een app-PR die `src/core/` wijzigt, faalt, tenzij het een vertrouwde merge is: de tweede ouder is een
    voorouder van `template/main` (van de vaste template-URL) of van main (was 0037 punt 2), en core in de merge is gelijk aan
    die ouder (was 0008 punt 2). Alleen commits die de app toevoegt tellen, niet die uit `template/main` (was 0037 punt 1).
17. Orphan en octopus met core-wijziging falen (was 0037 punt 3). De check faalt dicht; de template moet zonder credentials op
    te halen zijn (was 0037 punt 4). In de template zelf (`onderhoud.repository` in `.claude/gates.json` van main) is hij
    altijd groen (was 0037 punt 5). Hij is een verplichte check in de app-ruleset (was 0037 punt 6).
18. Een fout in core die een app raakt, wordt in de template opgelost, niet in de app (was 0008).

## Alternatieven

- **Alles squash, updates via cherry-pick of `git apply`** (was 0006): elke update handmatig en foutgevoelig.
- **Fork** (was 0006): kan niet binnen hetzelfde account.
- **Core als npm-pakket of generator** (was 0006, 0008): schone versies, maar een releaseproces en tweerichtingswerk; pas
  zinvol als core stabiel is. Deze grens maakt die stap later mechanisch.
- **Alleen een afspraak "raak frameworkbestanden niet aan"** (was 0008): niet per map af te dwingen.
- **Module augmentation of globale registry** (was 0008): verbergt de afhankelijkheid, tests worden volgordeafhankelijk.
- **Downgrade-aanscherping in `check-core`** (was 0037): core van head gelijk aan base of aan een niet-oudere
  `template/main`-commit. Niet nu; vervolgitem op de roadmap.

## Gevolgen

- Hernoemen in een app raakt `package.json`, README, CHANGELOG en eventueel CODEOWNERS; daar zijn conflicten bij een
  template-update verwacht (was 0006).
- Een private repo op een gratis account heeft geen ruleset; de eigenaar kiest Pro, een organisatie met Team, of public (was 0006).
- Elk uitbreidingspunt heeft een test in core die bewijst dat een app het gebruikt zonder core te wijzigen (was 0008).
- Aanvaarde gaten in `check-core` (was 0037 punt 7): een merge met een oudere vertrouwde commit kan een oudere core
  terugbrengen (downgrade), en een heel oude template-commit zonder `src/core/` kan core zelfs verwijderen; een zijbranch die zelf `template/main` merget, geeft vals alarm.
