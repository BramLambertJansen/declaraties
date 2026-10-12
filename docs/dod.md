# Definition of Done

De reviewer bepaalt eerst welke fase uit `docs/roadmap.md` bij het werk hoort: de fase van de roadmap-items die de PR aanvinkt of raakt. Raakt de PR meer fases, loop dan al die fases af; een lagere fase kiezen dan het werk vereist is niet toegestaan. Noteer de gekozen fase met reden in de PR; bij twijfel beslist de eigenaar. Loop daarna "Altijd" en de criteria van de gekozen fase(s) af; noteer bewijs of een concrete reden waarom een criterium niet van toepassing is in de PR.

## Altijd

- [ ] Vereiste checks zijn die uit `docs/framework.md` §10 (`gate:fast`, `gate:slow`, osv-scanner, CodeQL) en `.github/`, niet de scripts die toevallig in `package.json` staan. Voer elke vereiste check uit die al bestaat, noteer per exacte opdracht de uitslag in de PR en lever alleen op met een geslaagde uitslag. Een rode of niet-uitgevoerde check blokkeert, tenzij de eigenaar in de PR expliciet akkoord geeft (wie en waarom). Enige uitzondering: een vereiste check die nog niet bestaat omdat zijn roadmap-item open staat (`[ ]`); meld die als niet uitgevoerd, claim geen groen resultaat en voer nooit een onbekend of alleen gedocumenteerd commando uit alsof het bestaat. `docs/roadmap.md` is een beschermd pad: een item heropenen (`[x]` → `[ ]`) om een check te omzeilen telt niet, en aanvinken of heropenen gebeurt met akkoord van de eigenaar.
- [ ] Een wijziging die een check, hook, script of testconfiguratie verwijdert, hernoemt of afzwakt (ook in `package.json`, `.github/` of `scripts/`) is een blokkerende bevinding tot de eigenaar akkoord geeft. Een weggehaalde check telt niet als "bestaat niet".
- [ ] Als `check-docs` bestaat, voer die ook uit bij documentatiewijzigingen. Als die nog niet bestaat, meld dat expliciet en controleer handmatig de gewijzigde interne links en verwijzingen op juistheid; deze controle vervangt de ontbrekende check niet.
- [ ] Is het bewijs voor een roadmap-item beschikbaar (checkuitslag of test, eventueel met PR-nummer), dan vinkt dezelfde PR dat item af, met een verwijzing achter het vinkje (testpad, checknaam of PR-nummer; de uitslag staat in de PR) en met akkoord van de eigenaar. Een item dat deze PR afrondt maar open blijft, is een bevinding van de reviewer, net als een vinkje zonder bewijs. `pnpm check:roadmap` (in `gate:fast`) meldt een nieuw `[x]` zonder verwijzing en een spec naar `gebouwd` zonder bewijs; of het juiste item is afgevinkt blijft een oordeel van de reviewer.
- [ ] Elk acceptatiecriterium voor gewijzigd gedrag heeft een inhoudelijke test (geen lege of triviale assertie). Bij wijzigingen zonder gedragsverandering, zoals alleen documentatie, noteer je voor dit criterium “n.v.t.” met reden; toepasselijke documentatiechecks blijven verplicht.
- [ ] Geen bestaande migratie gewijzigd. Een bestaande test is alleen gewijzigd als de spec of opdracht het geteste gedrag verandert, en staat met reden in de PR; geen test verwijderd of geskipt zonder akkoord van de eigenaar.
- [ ] Nieuwe of gewijzigde tests en configs die buiten de sandbox draaien (`excludedCommands`), zijn door de eigenaar gelezen vóór zo'n run, zolang ADR 0009 niet gebouwd is.
- [ ] Bij migratie, nieuwe route of nieuwe permissie bestaat een goedgekeurde spec in `docs/specs/`; zonder die spec is de PR niet klaar. Laat de status alleen naar `gebouwd` gaan als de implementatie is afgerond. Verander nooit zelf een status naar `goedgekeurd`.

### Beveiliging en data (geldt in elke fase)

- [ ] Nieuwe routes gebruiken `defineRoute` met permissie en hebben een test per verboden rol. Nieuwe foutcodes hebben een tekst in `src/web/copy/errors.ts`.
- [ ] Nieuwe tabellen hebben RLS aan en geforceerd, expliciete grants en een pgTAP-test per policy.
- [ ] Nieuwe `unsafeCast`-aanroepen hebben een reden.
- [ ] Een wijziging aan de CSRF-middleware heeft de testmatrix uit ADR 0007 als tests.

## Fase 0 — Bewijs

- [ ] Voor elk bewijscriterium dat de roadmap aan het werk koppelt, noteer de uitvoerder, exacte testopzet en meetbare uitkomst. Bewijs waarvoor de eigenaar de lokale stack moet starten, is niet afgevinkt op basis van alleen code of documentatie.
- [ ] Leg de uitkomst vast in de ADR die de roadmap daarvoor aanwijst; maak geen nieuwe beslissing zonder eigenaarakkoord.

## Fase 1 — Fundament

- [ ] Voor elke gebouwde capability zijn de toepasselijke check, test en documentatie bijgewerkt; roadmap-items blijven open totdat de checkuitslag of het bewijs beschikbaar is.

## Features (fase 1 stuk 3 "gebruikersbeheer" en elke feature in fase 2)

- [ ] Elk acceptatiecriterium uit de goedgekeurde spec is gedekt door een inhoudelijke test; meld ontbrekende criteria afzonderlijk.
- [ ] Bij schermwerk: als `ui:check` in `package.json` bestaat, voer `pnpm ui:check` uit (375 en 1280 px + axe) en noteer de uitslag. Zo niet, vermeld dat de check nog niet beschikbaar is; claim geen UI-check als geslaagd.
- [ ] De feature volgt het gouden pad (`docs/gouden-pad.md`); een resource met een eigenaar per rij begint met `pnpm new:resource <naam>` (eerst het spec-skelet, na `goedgekeurd` de code). Past de generator niet (bijv. een view of security definer-functies), meld dat in de PR.

## Fase 3 — Release

- [ ] Volg de releasecriteria uit `docs/framework.md` §10 en de runbook van de gekozen host. Toon bewijs voor staging, schema-compatibiliteit, smoketest en vereiste CI-checks.
- [ ] Productierelease vereist de expliciete goedkeuring van de eigenaar via de beschermde omgeving; een agent voert die goedkeuring of release niet zelf uit.
