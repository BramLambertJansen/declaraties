# 0056 — Functionele UI-wijzigingen in één PR

Status: geaccepteerd

Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 8–9 en 12–15 voor functionele UI-wijzigingen in de template.
Drempel: A3 (de bestaande lane-uitsluiting en het voorafgaande broncodemandaat versoepelen) en A4 (0046 wijzigen).

## Context

De eigenaar vraagt toastverbeteringen: meldingen op alle schermen, bereikbaarheid in een dialoog en gebruik bij bestaande
acties. Hiervoor is geen nieuwe architectuurkeuze nodig. Toch vraagt de huidige procedure eerst een besluit-PR met spec en
broncodemandaat op main, gevolgd door een bouw-PR, uitsluitend omdat de componenten in `src/core` staan.

Aanleiding (framework §1): concrete wrijving in de sessie van 2026-10-23. De eigenaar vraagt deze extra ronde te schrappen
voor kleine functionele aanpassingen. De bestaande ADR-drempels onderscheiden al architectuur, beveiliging en werkstraat;
de automatische uitsluiting van alle core-UI maakt dat onderscheid onbruikbaar voor gewone componentverbeteringen.

## Besluit

1. **Functionele UI volgt de feature-lane.** In de template mogen presentatie, interactie, toegankelijkheid en bugfixes van
   bestaande UI-componenten in één PR met hun mini-spec, implementatie, tests en gebruiksdocumentatie. Dit geldt ook voor
   `src/core/web/ui/**` en bijbehorende vaste UI-teksten in `src/core/web/copy/**`. Het bestandspad alleen maakt dit geen
   architectuurbesluit. Er geldt geen arbitraire grens in regels code of aantal bestanden.
2. **Geen voorafgaand mandaat voor deze scope.** Deze PR vraagt geen apart record in `.claude/decisions.json` en geen
   vooraf gemergde spec. De hoofdsessie beschrijft het gevraagde gedrag en de acceptatiecriteria in de mini-spec, bouwt en
   verzamelt bewijs. De eigenaar beslist met de merge van de complete PR. Open functionele keuzes worden eerst voorgelegd;
   een mini-spec is geen toestemming om onbesliste productkeuzes zelf in te vullen.
3. **Architectuur en bewaking houden hun eigen route.** De ADR-drempels uit 0046 punt 4 blijven gelden. Auth, identiteit,
   sessies, rollen/RLS, bestaande data, dependencies, providers, contracten tussen zones en het verruimen van rechten of
   afzwakken van checks vallen niet onder deze uitzondering. Rails, scripts, CI, configuratie en agentinstructies blijven
   buiten deze functionele lane. Een gemengde PR krijgt de strengste toepasselijke route.
4. **Bestaande tests mogen veranderd gedrag volgen.** Een bijbehorende bestaande UI-test mag in dezelfde PR worden
   bijgewerkt als de opdracht en mini-spec juist het geteste gedrag veranderen, of als de bestaande renderopstelling door
   die verandering moet worden aangepast. De PR noemt elk gewijzigd testbestand met reden en vervangend bewijs.
   Verwijderen, skippen of afzwakken om groen te krijgen blijft verboden zonder afzonderlijk eigenaarakkoord; een test die
   fout lijkt zonder gedragswijziging wordt aan de eigenaar voorgelegd. Testconfiguratie, gedeelde fixtures en setup krijgen
   geen ruimere rechten. Alle overige uitsluitingen voor bestaande tests en migraties blijven gelden.
5. **Core blijft van de template.** Deze uitzondering geldt uitsluitend in de template-repository. Een afgeleide app
   verandert core nog steeds alleen via een template-update volgens ADR 0040. App-uitbreidingen blijven via registratie en
   app-code lopen. Voor overige corebestanden verandert het broncodemandaat niet.
6. **Bewijs en eigenaarreview blijven.** De vereiste checks, inhoudelijke testdekking, catalogus- en contrastdekking,
   echte-stack-e2e, CODEOWNERS, diff-guard en eigenaarmerge blijven gelden. De guard rapporteert dat de PR deze functionele
   UI-uitzondering gebruikt, inclusief gewijzigde corepaden en bestaande tests. Een agent voert geen zelfreview of merge uit.

## Alternatieven

- **Twee PR's voor iedere corewijziging:** het pad is eenvoudig te herkennen, maar veroorzaakt een extra besluitronde bij
  functionele wijzigingen zonder architectuurkeuze.
- **Alle core en alle gate-paden vrijgeven:** te ruim; database-, auth- en werkstraatwijzigingen hebben andere gevolgen.
- **Alleen een limiet op diffgrootte:** een korte wijziging kan rechten verruimen; grootte bepaalt de juiste route niet.

## Gevolgen

- Toastverbeteringen en vergelijkbare wijzigingen aan bestaande UI kunnen na invoering in één feature-PR, met een
  mini-spec en zonder apart broncodemandaat. Een nieuwe gedeelde capability blijft een concrete aanleiding vragen.
- Dit besluit wordt eerst als afzonderlijke besluit-PR aan de eigenaar voorgelegd. Het verandert de actieve checks niet
  zelf. De bestaande guard en hooks uit main blijven gelden totdat de invoering is gemerged en de runtime die versie laadt.
- De invoering past lane-herkenning, documentstatus, gebouwd-status en rolhek aan met positieve én negatieve fixtures:
  gewone toastaanpassing toegestaan; auth, ander corepad, agentinstructie, dependencywijziging en app-corewijziging geweigerd;
  gewijzigde UI-test met gedragswijziging zichtbaar voor eigenaarreview. Het nieuwe pad krijgt geen vrijstelling van checks.
- Framework, mini-specsjabloon, AGENTS.md en agentdoorloop beschrijven daarna dezelfde grens. UI-gebruiksafspraken staan in
  gewone gebruiksdocumentatie; agentinstructies verwijzen daarnaar, zodat een functionele verbetering geen wijziging van
  agentrechten of agentinstructies nodig maakt.
- De huidige toastspec kan bij de bouw worden ingekort naar een mini-spec met behoud van gedrag en acceptatiecriteria.
  Zij wordt niet eerst afzonderlijk als broncodemandaat ingediend. De oorspronkelijke toastopdracht blijft open tot de
  invoering en de toastverbeteringen zijn gebouwd en gecontroleerd.
