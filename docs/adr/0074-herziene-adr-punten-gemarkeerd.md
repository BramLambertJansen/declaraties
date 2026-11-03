# 0074 — Een gewijzigd ADR zegt zelf door welk ADR

Status: geaccepteerd

Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 2 (een herzieningsregel is voortaan ook verplicht als een later ADR een
punt wijzigt zonder de tekst te herschrijven); vult [0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md) punt 1 (het
regelboek is bindend) aan. Drempel: A4 (afspraak over geaccepteerde ADR's) en een nieuwe check in `check-docs`. Uitwerking:
[spec](../specs/adr-herzien-markering.md). Aanleiding: review van 3 november 2026, bevinding P8b.

## Context

Een nieuw ADR wijzigt vaak een punt van een ouder ADR zonder dat oudere ADR aan te raken. De kopregel van het nieuwe ADR zegt
het ("Wijzigt 0046 punt 30, 31 …"), het oude ADR zegt het niet. Twaalf geaccepteerde ADR's wijzigen op die manier een
ander geaccepteerd ADR. ADR 0046 telt 194 regels, waarvan een deel door 0054, 0056, 0057, 0062, 0063 en 0069 is gewijzigd;
alleen de wijziging door 0063 staat in 0046 zelf, als herzieningsregel. Wie 0046 opent, ziet niet welke punten nog gelden.

Het regelboek is bindend (R-DOC-03), dus een agent die alleen `docs/framework.md` volgt, gaat niet fout. Maar het waarom staat
in de ADR's, en wie een ADR opent om dat waarom te lezen, leest een punt dat niet meer geldt als geldend. Dat kost leestijd en
levert verkeerde conclusies op, en het wordt erger met elk nieuw ADR.

Het mechanisme om dat te zeggen bestaat al: de herzieningsregel `Herzien: JJJJ-MM-DD (#NNN): wat` (R-CI-05), die
`check-document-status` en het rolhek kennen en die alleen in een besluit-PR mag. Wat ontbreekt, is de plicht om hem te
schrijven als een later ADR het punt wijzigt, en een check die dat afdwingt.

## Besluit

1. **Bron is de kopregel van het nieuwe ADR.** Een geaccepteerd ADR B dat een ander geaccepteerd ADR A wijzigt, noemt dat in de
   kop (vóór de eerste `## `-kop) met de bestaande vorm: `Wijzigt`, `Herziet` of `Vervangt`, een link naar A en, waar het om
   punten gaat, de puntnummers. `Vult … aan` wijzigt niets: de tekst van A blijft geldig.
2. **A krijgt een herzieningsregel die B noemt.** In dezelfde PR als B krijgt A een regel
   `Herzien: JJJJ-MM-DD (#NNN): gewijzigd door <link naar B> punt N, M` (zonder puntnummer: wat B wijzigt, in een paar woorden). Een
   bestaande herzieningsregel in A die B noemt, telt ook (zoals de regels die 0063 in acht ADR's zette). De tekst van de
   punten zelf verandert niet; een markering midden in de tekst is niet nodig.
3. **Geen nieuwe uitzondering.** Dit is een herschrijving volgens R-CI-05 en loopt langs de bestaande guard en het rolhek: de PR
   van B is door de A4-drempel al een besluit-PR. Er verandert niets aan `check-document-status`, `document-state.mjs` of het
   rolhek. Een vervangen of vervallen ADR en het archief krijgen geen regel.
4. **`check-docs` dwingt het af.** De check leest de kop van elk geaccepteerd ADR en eist per genoemd geaccepteerd ADR een
   herzieningsregel die B noemt, en als B punten noemt, die puntnummers in die regel. Ontbreekt dat, dan is `check-docs` rood met
   A, B en de ontbrekende punten in de melding, nooit via de baseline. De check heeft een falende fixture.
5. **Eenmalig bijwerken in deze PR.** Omdat een herzieningsregel alleen in een besluit-PR mag, zet deze PR hem in elk bestaand
   geval, ook voor dit ADR zelf (0046 punt 2). De bouw-PR voegt alleen de check en de zin in R-CI-05 toe.

## Alternatieven

- **Een markering `(herzien door NNNN)` bij het punt zelf** (het voorstel uit de review). Preciezer voor de lezer, maar de guard
  ziet elke markering als herschrijving, dus er moet toch een herzieningsregel bij, of de guard moet een uitzondering krijgen
  (A3, op een beschermd pad, in een eigen PR vooraf). Twee mechanismen voor één doel; de herzieningsregel noemt de punten al.
- **Alleen afleiden, niets in het oude ADR.** `feiten.mjs adr` zou per punt kunnen tonen dat het gewijzigd is. Goedkoop, maar
  wie het ADR met Read of op GitHub opent, ziet het niet, en dat is precies de lezer die hier fout gaat.
- **Oude ADR's periodiek consolideren** (zoals 0039–0051 deden). Ruimt eenmalig op, maar zonder check groeit het gat daarna
  weer. Kan later naast dit besluit.
- **Niets doen; het regelboek wint toch.** Klopt voor het gedrag, niet voor de leestijd en de uitleg aan de eigenaar.

## Gevolgen

- Elke PR met een nieuw ADR dat een ouder ADR wijzigt, raakt ook dat oudere ADR (één herzieningsregel); de reviewer ziet zo in
  de diff welk punt vervalt.
- De check leest alleen `docs/adr/*.md` buiten het archief; de kosten groeien met het aantal template-ADR's (begrensd op
  0001–0099) en niet met de geschiedenis (R-DOC-09).
- Een vrije formulering in een kopregel ("de vaste rolvolgorde") blijft mogelijk; de herzieningsregel zegt dan in woorden wat.
