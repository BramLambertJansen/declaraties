# 0058 — Beperkte fixroute en volledige featurestraat

Status: geaccepteerd

Wijzigt [0057](0057-risicogestuurde-werkstraat.md) punt 1 en 4 en de mini-specplicht uit
[0056](0056-functionele-ui-in-een-pr.md) voor uitsluitend de lichte route hieronder.
Drempel: A3 (review zonder verplichte technische rolscheiding bij beperkte fixes), A4 (bestaande werkstraatafspraken).
De status is de bedoelde acceptatie in dit voorstel; alleen de eigenaar maakt het besluit met zijn merge geldend.

## Aanleiding

De eigenaar wil geen groei van ADR's en specs door kleine fixes. Op 26 oktober 2026 beperkte hij de lichte route tot
bugs en heel kleine UI- of functionaliteitsaanpassingen aan bestaand gedrag. Nieuwe features, pagina's en interacties
moeten de volledige straat krijgen. In de lichte route komt een aparte tester alleen bij gedragswijzigingen terug.

## Besluit

1. **Licht is beperkt.** Alleen een afgebakende bugfix of heel kleine aanpassing binnen een bestaande functionaliteit
   en bestaande interactie kan licht zijn. Voorbeelden: een lokale fout in bestaande validatie herstellen, een label
   corrigeren of bestaande layout/focus herstellen. Geen nieuwe feature, pagina, interactie, publiek contract,
   component-API, route, permissie, migratie of dependency. Auth, gegevensisolatie, het RLS-/rollenmodel,
   vertrouwensgrenzen, moeilijk herstel en A2/A3/A4 zijn altijd volledig. Twijfel of scopegroei gaat naar volledig.
2. **Volledige featurestraat.** Nieuwe features, pagina's en interacties krijgen altijd architect en spec, contract
   waar van toepassing, aparte tester vóór implementatie, bouwer, afgedwongen onafhankelijke review, volledige CI
   en eigenaarmerge. Dat geldt ook als de code kort of omkeerbaar is. Een passende bestaande feature-spec kan worden
   hergebruikt; de bestaande besluitroute voor wijzigingen van bindende specs blijft gelden.
3. **Tester wanneer gedrag verandert.** Licht werk dat functioneel gedrag verandert of herstelt krijgt een aparte
   tester vóór de bouwer. Die schrijft een inhoudelijke regressie tegen de bedoelde uitkomst, eerst rood op een
   assertie. Zuivere tekst-, opmaak- of documentcorrecties zonder functioneel of toegankelijkheidsgedrag krijgen geen
   vaste tester. Toepasselijke bestaande controles blijven; in de volledige straat is de tester altijd aanwezig.
4. **Geen document per kleine fix.** Licht werk krijgt geen nieuwe ADR, spec of mini-spec en geen apart
   goedkeuringsrecord. Verwacht gedrag, begrensde scope en bewijs staan kort in de opdracht/PR; bestaande
   feature-specs blijven bindend. Werk relevante bestaande gebruiksdocs mee bij. Dit geldt ook voor beperkte fixes
   aan bestaande core-UI in de template, binnen de UI-paden van 0056; een app wijzigt core nog steeds niet.
   Nieuwe functionaliteit krijgt een feature-spec, niet automatisch een ADR. De ADR-drempels blijven ongewijzigd.
5. **Reviewagent bij licht werk.** Een aparte reviewagent krijgt schone, taakgerichte context, alleen leesopdrachten,
   de diff, verwachte uitkomst en testbewijs. De bouwer reviewt zichzelf niet. Gebruik technische rolbeperking waar
   beschikbaar; ontbreken daarvan alleen verplicht bij licht werk geen menselijke of externe reviewer. Claim dan
   geen technisch afgedwongen onafhankelijkheid. De tester schrijft alleen tests. Ontbreekt een aparte reviewagent
   geheel, dan reviewt de eigenaar. Voor volledig werk blijven technische rolscheiding en eigenaar-terugval gelden.
6. **Controles en rechten blijven.** De classificatie geeft geen extra schrijfrechten en omzeilt geen beschermd pad,
   broncodemandaat, RLS, testregel of bestaande bindende beslissing. Geen test verwijderen, skippen of afzwakken op
   grond van de lichte route. Volledige pre-push en CI blijven voor iedere PR; geen oude groene uitslag hergebruiken.
   De eigenaar blijft beslissen over merge. Er komt geen extra label, triageregister of documentcontrole per fix.
7. **Eén implementatie van deze afspraak.** Na dit besluit volgen framework, agentprofielen, skills en gebruiksdocs
   dezelfde twee routes. Een voorstelbranch activeert niets; vertrouwde hooks blijven uit main komen. Bestaande
   ADR's en specs blijven bewaard. De App-, ruleset- en build-proofvoorwaarden uit 0057 veranderen niet.

## Gevolgen

Een bug in een bestaand formulier kan via tester, bouwer en reviewagent worden afgehandeld zonder nieuwe spec.
Een nieuwe knop met een nieuwe actie, een nieuwe pagina of een uitbreiding van het rechtenmodel gaat volledig.
De routekeuze is een inhoudelijk oordeel van hoofdsessie en reviewer; alleen het woord "bug" of een kleine diff
bewijst geen laag risico. Vergelijk rolwissels en doorlooptijd via de bestaande meting, zonder tokenwinst te verzinnen.
