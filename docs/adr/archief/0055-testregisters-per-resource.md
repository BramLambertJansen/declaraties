# 0055 — Testregisters per resource: één PR per resource

Status: vervallen

Wijzigt [0047](0047-generator-new-resource.md) punt 1 en de eerste gevolgregel, en punt 4 voor het spec-skelet.
Drempel: A4 (een punt van een geaccepteerd ADR vervangen).

## Context

Fase 2 van `pnpm new:resource` drukt wijzigingen af voor drie bestaande testbestanden: de permissietabel
(`src/shared/permissions.test.ts`), de menutest (`src/web/routes.test.tsx`) en de securitydeclaratie
(`test/security/resources.ts`). De feature-lane (0046 punt 14, `scripts/kit/lane.mjs`) laat geen gewijzigde bestaande test
toe, dus een resource past nooit in de lane en kost twee PR's: de mini-spec, en de bouw met eigenaarreview. Ook het spec-skelet
(`scripts/kit/templates/spec.md.tmpl`) heeft de koppen van de mini-spec, maar niet de marker. Aanleiding (framework §1):
gemeten wrijving, twee PR's per resource, uit de eigenaarreview "template slanker en sneller"; de proef-app (ST-09) bouwt er
meerdere.

## Besluit

1. **Een register per resource is een nieuw bestand.** De drie registers worden verzamelingen: per resource één nieuw
   declaratiebestand in een testpad (bijvoorbeeld `test/security/resources/<naam>.ts`, en per resource de verwachte rollen per
   permissie en de menu-items per rol). De bestaande registertest laadt ze via `import.meta.glob` (Vite, geen nieuwe
   dependency) en voegt ze samen met de vaste regels van core en de bestaande schermen. Een resource voegt dan alleen bestanden
   toe; geen bestaande test wijzigt.
2. **Een ontbrekende declaratie blijft rood.** Elke registertest vergelijkt het samengevoegde register met de bron, niet met
   de lijst bestanden: de permissietabel met `permissions.names`, de menutest met het menu dat de app per rol toont, de
   securitysuite met `routes` uit `src/api/app.ts` en de owner-tabellen uit de catalogus (zoals nu AC-11). Een sleutel in twee
   bestanden, een bestand zonder geldige export of een lege verzameling is ook rood.
3. **De generator schrijft nog steeds geen test.** Fase 2 drukt de nieuwe declaratiebestanden af in plaats van een wijziging;
   de tester zet ze en vult de samples. Punt 6 van 0047 (geen gate-bestand, geen testpad) blijft.
4. **Het skelet is een mini-spec.** `spec.md.tmpl` krijgt `sjabloon: mini` in de frontmatter. Een resource-spec valt daarmee
   onder 0046 punt 13: een nieuwe tabel via `pnpm new:resource`; alles onder A2 blijft het volledige sjabloon.
5. **Eenmalige herstructurering.** Het omzetten van de drie bestaande registers is testwerk voor de tester, in een eigen PR met
   eigenaarreview, waarin de bestaande regels ongewijzigd naar de nieuwe vorm gaan. Generator, templates en
   `docs/gouden-pad.md` volgen in een rail-PR.

De lane-regels veranderen niet: een gewijzigde of verwijderde bestaande test of migratie blijft buiten de feature-lane.

## Alternatieven

- **Lane-uitzondering voor registertests:** sneller, maar zwakt een rail af (0046 P2) en maakt "bestaande test" een oordeel.
- **Registers afleiden uit de code zonder declaratie:** dan toetst de test zichzelf; de verwachting moet van de tester komen.
- **Eén testbestand per resource met eigen asserties:** de volledigheidscontrole (elke permissie, route en tabel gedekt) zou
  verspreid raken; die hoort op één plek.

## Gevolgen

- Een resource kan in één feature-lane-PR (mini-spec, generatoruitvoer, tests); de eigenaar merget (0046 punt 31).
- Vervalt uit 0047 Gevolgen: "elke run die een permissie toevoegt, wijzigt `src/shared/permissions.test.ts`".
- De volgorde van de bestanden mag de uitslag niet bepalen; de samenvoeging sorteert op sleutel.
- `import.meta.glob` werkt in de vitest-runs (unit en `test:db`); voor e2e is dit niet nodig.
