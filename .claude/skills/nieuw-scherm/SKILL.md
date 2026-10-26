---
name: nieuw-scherm
description: Een nieuw scherm bouwen met bestaande kitcomponenten, queries, guard en e2e met axe. Gebruik voor elke nieuwe pagina of route in de frontend.
allowed-tools: Bash(node scripts/kit/feiten.mjs *)
---

# Nieuw scherm

Een nieuwe pagina of interactie krijgt altijd de volledige straat: architect/spec, contract waar nodig, aparte tester
vóór implementatie, bouwer en afgedwongen onafhankelijke review (framework §8). Ook bij een kleine diff. Hergebruik een
passende feature-spec; geen automatische ADR per scherm. De stappen hieronder zijn het bouwdeel van die straat.

Componenten die er zijn (bouw niets ernaast; past er geen, stop en stel een variant voor):

!`node scripts/kit/feiten.mjs componenten`

Routes en permissies:

!`node scripts/kit/feiten.mjs routes permissies`

Een nieuwe resource begint met `pnpm new:resource <naam> --rollen …` (hoofdsessie): queries, een lijstscherm, de route en
het menu-item. Daarna, of voor een los scherm, `docs/gouden-pad.md`, stap 8 t/m 11:
1. Queries in `src/web/features/<resource>/queries.ts` (key-factory, hooks, mutaties die invalideren). `useQuery`/`useMutation` alleen daar (lint).
2. Scherm in `src/web/features/<resource>/` met componenten uit `#web/ui/index.ts`; in `features/` alleen layout-klassen. Laden, leeg en fout via `<AsyncView>`, formulieren via `<Form>`.
3. Alle zichtbare tekst in `src/web/copy/ui.ts`, Nederlands volgens de woordenlijst (`src/web/copy/woordenlijst.test.ts`).
4. Bestandsroute in `src/web/routes/` met `beforeLoad: guard('<permissie>')`; menu-item per rol in `src/web/lib/nav.ts`.
5. E2E in `e2e/` per acceptatiecriterium met `scanAxe` op 375 en 1280 px en zonder horizontaal scrollen (voorbeeld: `e2e/accounts.spec.ts`).
6. Bewijs: `pnpm gate:fast` en `pnpm ui:check`.
