# Definition of Done

De reviewer bepaalt eerst welke fase uit `docs/roadmap.md` bij het werk hoort: de fase van de roadmap-items die de PR aanvinkt of raakt. De open items met hun fase staan in `node scripts/kit/feiten.mjs fase`; staat het item daar niet of is de fase onbekend, lees dan de roadmap. Raakt de PR meer fases, loop dan al die fases af; een lagere fase kiezen dan het werk vereist is niet toegestaan. Noteer de gekozen fase met reden in de PR; bij twijfel beslist de eigenaar. Loop daarna "Altijd" en de criteria van de gekozen fase(s) af; noteer bewijs of een concrete reden waarom een criterium niet van toepassing is in de PR.

## Altijd

- [ ] Vereiste checks zijn die uit `docs/framework.md` §10 (`gate:fast`, `gate:slow`, osv-scanner, CodeQL) en `.github/`, niet de scripts die toevallig in `package.json` staan. Voer elke vereiste check uit die al bestaat, noteer per exacte opdracht de uitslag in de PR en lever alleen op met een geslaagde uitslag. Een rode of niet-uitgevoerde check blokkeert, tenzij de eigenaar in de PR expliciet akkoord geeft (wie en waarom). Enige uitzondering: een vereiste check die nog niet bestaat omdat zijn roadmap-item open staat (`[ ]`); meld die als niet uitgevoerd, claim geen groen resultaat en voer nooit een onbekend of alleen gedocumenteerd commando uit alsof het bestaat. `docs/roadmap.md` is een beschermd pad: een item heropenen (`[x]` → `[ ]`) om een check te omzeilen telt niet, en aanvinken of heropenen gebeurt met akkoord van de eigenaar.
- [ ] Een wijziging die een check, hook, script of testconfiguratie verwijdert, hernoemt of afzwakt (ook in `package.json`, `.github/` of `scripts/`) is een blokkerende bevinding tot de eigenaar akkoord geeft. Een weggehaalde check telt niet als "bestaat niet".
- [ ] Voer `check-docs` ook uit bij documentatiewijzigingen (onderdeel van `pnpm ratchet`).
- [ ] Is het bewijs voor een roadmap-item beschikbaar (checkuitslag of test, eventueel met PR-nummer), dan vinkt dezelfde PR dat item af, met een verwijzing achter het vinkje (testpad, checknaam of PR-nummer; de uitslag staat in de PR) en met akkoord van de eigenaar. Een spec naar `gebouwd` heeft één vorm, die `pnpm docs:status` schrijft: `status: gebouwd # #<PR>; gevalideerd: <sha>`; een afgevinkt roadmap-item vervangt die niet. Binnen een taakmandaat wijzigt in `docs/roadmap.md` alleen het vinkje van het item dat de spec van het mandaat tussen backticks noemt (precies één open item per spec); `pnpm docs:status <spec> gebouwd --pr <nummer> --roadmap` zet status en vinkje samen (ADR 0046 punt 10). Een item dat deze PR afrondt maar open blijft, is een bevinding van de reviewer, net als een vinkje zonder bewijs. `pnpm check:roadmap` (in `gate:fast`) en `check-document-status` (CI) lezen beide vormen met dezelfde code; of het juiste item is afgevinkt blijft een oordeel van de reviewer.
- [ ] Elk acceptatiecriterium voor gewijzigd gedrag heeft een inhoudelijke test (geen lege of triviale assertie). Bij wijzigingen zonder gedragsverandering, zoals alleen documentatie, noteer je voor dit criterium “n.v.t.” met reden; toepasselijke documentatiechecks blijven verplicht.
- [ ] Geen bestaande migratie gewijzigd. Een bestaande test is alleen gewijzigd als de spec of opdracht het geteste gedrag verandert, en staat met reden in de PR; geen test verwijderd of geskipt zonder akkoord van de eigenaar.
- [ ] Runnerchecks volgen ADR 0044: vaste opdracht, geïsoleerde teststack, ongewijzigde hostcode. Bij gewijzigde hostcode gebruikt de agent de wegwerp-CI. De hoofdsessie verzamelt werkelijke uitslagen op de juiste SHA; geen routineverzoek aan de eigenaar om tests zelf te draaien.
- [ ] De route past bij framework §8 (ADR 0058): alleen beperkte fixes binnen bestaande functionaliteit/interactie zijn licht. Verwachte uitkomst, scope en bewijs staan in de opdracht/PR, zonder nieuwe ADR/spec/mini-spec. Gedragsverandering of -herstel heeft eerst tests van een aparte tester; zuivere tekst/opmaak zonder gedrag vraagt geen vaste tester. Een aparte reviewagent controleert de wijziging. Technische isolatie waar beschikbaar, geen isolatieclaim als die ontbreekt; zonder aparte agent reviewt de eigenaar. Nieuwe features, pagina's, interacties en risicowerk volgen de volledige straat met architect, tester en afgedwongen onafhankelijke review of eigenaar-terugval. Kleine codeomvang verandert dat niet.
- [ ] Bij nieuwe features, pagina's, interacties, migraties, routes of permissies bestaat een passende goedgekeurde spec in `docs/specs/`; hergebruik mag, een ADR alleen bij de bestaande drempels. Zonder die spec is de PR niet klaar. De status `goedgekeurd` staat in het voorstel en de merge door de eigenaar is het besluit (ADR 0046). Gebouwd via `pnpm docs:status` kan bij de geopende PR, na afgeronde implementatie en groene verplichte Actions-checks (ADR 0046 punt 10).

### Beveiliging en data (geldt in elke fase)

- [ ] Nieuwe routes gebruiken `defineRoute` met permissie en hebben een test per verboden rol. Nieuwe foutcodes hebben een tekst in `src/web/copy/errors.ts`.
- [ ] Nieuwe tabellen hebben RLS aan en geforceerd, expliciete grants en een pgTAP-test per policy.
- [ ] De securitysuite (`test/security/`, `db/tests/security.sql`) is groen in `pnpm test:db`; een nieuwe resource staat in `test/security/resources.ts` met ingevulde samples.
- [ ] Nieuwe `unsafeCast`-aanroepen hebben een reden.
- [ ] Een wijziging aan de CSRF-middleware heeft de testmatrix uit ADR 0041 als tests (`src/core/api/http/csrf.test.ts`).

## Fase 0 — Bewijs

- [ ] Voor elk bewijscriterium dat de roadmap aan het werk koppelt, noteer de uitvoerder, exacte testopzet en meetbare uitkomst. Bewijs waarvoor de eigenaar de lokale stack moet starten, is niet afgevinkt op basis van alleen code of documentatie.
- [ ] Leg de uitkomst vast in de ADR die de roadmap daarvoor aanwijst; maak geen nieuwe beslissing zonder eigenaarakkoord.

## Fase 1 — Fundament

- [ ] Voor elke gebouwde capability zijn de toepasselijke check, test en documentatie bijgewerkt; roadmap-items blijven open totdat de checkuitslag of het bewijs beschikbaar is.

## Features (fase 1 stuk 3 "gebruikersbeheer" en elke feature in fase 2)

- [ ] Elk acceptatiecriterium uit de toepasselijke goedgekeurde spec, of bij een lichte fix de verwachte uitkomst uit opdracht/PR, is gedekt door een inhoudelijke test; meld ontbrekende criteria afzonderlijk. Een lichte fix krijgt hiervoor geen nieuwe spec.
- [ ] Bij schermwerk: voer `pnpm ui:check` uit (375 en 1280 px + axe) en noteer de uitslag; claim geen UI-check als geslaagd die niet draaide.
- [ ] De feature volgt het gouden pad (`docs/gouden-pad.md`); een resource met een eigenaar per rij begint met `pnpm new:resource <naam>` (eerst het spec-skelet, na `goedgekeurd` de code). Past de generator niet (bijv. een view of security definer-functies), meld dat in de PR.

## Fase 3 — Release

- [ ] Volg de releasecriteria uit `docs/framework.md` §10 en de runbook van de gekozen host. Toon bewijs voor staging, schema-compatibiliteit, smoketest en vereiste CI-checks.
- [ ] Productierelease vereist de expliciete goedkeuring van de eigenaar via de beschermde omgeving; een agent voert die goedkeuring of release niet zelf uit.
