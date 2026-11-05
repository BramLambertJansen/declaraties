# 0015 — De componentcatalogus als beveiligde pagina in de app

Status: vervangen door 0048
eigenaar (2026-10-10, doorgegeven via de coördinator); geaccepteerd door de eigenaar met de spec.

## Context

De componentcatalogus `/design-system` bestaat alleen in dev. Framework §6 noemt dat onder Verharding ("`/design-system` en `/design`
bestaan alleen in dev-builds"), §3 geeft de route daarom een uitzondering op de `can()`-guard, en §7 en roadmap stuk 3c herhalen het.
Technisch zorgt `devOnlyModules()` in `vite.config.ts` ervoor: bij `build` wordt elke module uit `src/web/dev/` leeg, en
`test/ui/bundle.test.ts` bewijst dat de catalogus niet in de productiebundel zit.

De eigenaar wil de catalogus als echte pagina in de app, ook in productie, zodat wie de app beheert de componenten in de echte
omgeving ziet. Dat draait een verhardingsregel terug en vraagt daarom een besluit.

## Besluit

1. **In de productiebundel, achter een guard.** `/design-system` wordt een kindroute van `_app` met `guard('design-system:read')`.
   De nieuwe permissie `design-system:read` geldt alleen voor `admin` (en dus alleen met MFA, via core). De uitzondering in framework §3
   vervalt.
2. **Alleen voorbeelddata.** De pagina doet geen API-aanroep en toont geen echte data. De guard verbergt de pagina; hij beschermt geen
   geheim, want de statische bundel is voor iedereen te downloaden.
3. **Lazy chunk.** De pagina blijft een eigen chunk die pas laadt bij openen; een test bewijst dat ze niet in de entry-chunk zit. Het
   bundelbudget blijft gelijk.
4. **Plek.** De pagina verhuist van `src/web/dev/` naar `src/web/features/design-system/`; `check:catalogus` leest daar.
5. **Geen geneste AppShell.** De pagina staat zelf in de echte AppShell; de demo-AppShell vervalt en `AppShell` krijgt een uitzondering
   met reden in `scripts/kit/catalogus.mjs`.
6. **Wat dev-only blijft.** `/design` (prototypes) en de dev-rolwisselaar (ADR 0014) blijven alleen in dev; `devOnlyModules()` blijft
   daarvoor bestaan.

## Alternatieven

- **Alles laten zoals het is (alleen in dev).** Geen nieuw risico, maar de catalogus is buiten de lokale omgeving niet te zien.
- **Bestaande permissie (`accounts:read` of `app.use`).** Geen nieuwe permissie, maar de catalogus beweegt dan ongemerkt mee met
  accountbeheer, of iedere gebruiker ziet een ontwikkelaarspagina.
- **Demo-AppShell in een iframe.** Vraagt een CSP-wijziging: `frame-ancestors 'none'` verbiedt ook framen door de eigen origin.
- **`preview`-variant van `AppShell` in core.** Wijzigt de template voor een demo, en de demo toont dan niet meer wat een gebruiker krijgt.
- **Route buiten `_app` met alleen een guard.** Geen nesting, maar de pagina heeft dan geen navigatie en wijkt af van elk ander scherm.

## Gevolgen

- Framework §3 (rij `/design-system`), §6 (Verharding) en §7, roadmap stuk 3c en `.claude/rules/web.md` worden aangepast. Dat zijn beschermde
  paden: alleen met akkoord van de eigenaar en label `gate-wijziging`.
- `src/shared/permissions.ts` krijgt `design-system:read`; de tabeltest in `src/shared/permissions.test.ts` krijgt één regel en dekt daarmee
  elke verboden rol en de admin zonder MFA.
- Bestaande tests veranderen, elk met reden in de PR: `test/ui/bundle.test.ts` (alleen nog de rolwisselaar), `e2e/design-system.spec.ts`
  (eerst inloggen, geen demo-shell), `e2e/accounts.spec.ts` (dashboardlink niet meer "lokaal") en de verhuisde sectietest.
- Elke nieuwe of gewijzigde sectie van de catalogus komt in productie. Echte data of API-aanroepen op de pagina vragen een nieuwe ADR.
