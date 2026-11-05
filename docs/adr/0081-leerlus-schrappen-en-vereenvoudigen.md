# 0081 — Leerlus ook voor schrappen, vereenvoudigen en versnellen

Status: geaccepteerd

Wijzigt [0078](0078-leerlus-met-bewijs.md) punt 1, 2, 3 en 8 en [0059](0059-leerlus-van-app-naar-template.md) punt 1, 2 en 4.
Drempel: A4 (twee geaccepteerde ADR's wijzigen). Uitwerking: [spec leerlus-herzien](../specs/leerlus-herzien.md). Aanleiding:
vraag van de eigenaar (5 november 2026, thread "Zelflerend systeem opnieuw beoordelen"): een seintje als een stuk inefficiënt
is of sneller kan, ook als het omgeschreven moet of weg moet, met een heel sterke onderbouwing.

## Context

De leerlus kent alleen toevoegen. Elke plek op de ladder (type, check, gouden pad of generator, skill, padregel, `AGENTS.md`)
legt een nieuwe regel of check neer, en het sluitbewijs eist een test die op de oude code faalt. Een les als "deze check kost
elke PR een minuut en vangt niets meer" of "deze code kan in de helft" heeft geen plek: het sjabloon biedt geen keuze, het
sluitbewijs kan niet (gedrag blijft gelijk, dus geen test die op de basis faalt), en de voorsortering vraagt nooit wat weg
kan. De soorten "efficiëntie van de code" en "tokenefficiëntie" bestaan sinds 0059, maar wijzen alleen naar treden die
toevoegen. Nulmeting op main `19592eb`: 0 van de 40 leerpunten stelt voor iets te schrappen of te vereenvoudigen; de
krimpvoorstellen kwamen alleen uit losse reviews van de eigenaar (2 en 3 november, "Framework versimpelen" van 5 november).

Schrappen is wel riskant: een check die weg is, vangt niets meer, en dat merk je pas als het misgaat. Daarom vraagt de eigenaar
een sterke onderbouwing, en vraagt het framework al bij elke krimp een vangnet (R-PRINC-07: meten vóór en na; een regel blijft
alleen als hij aantoonbaar helpt).

## Besluit

1. **Nieuwe plek: "Schrappen of vereenvoudigen".** `Voorstel voor de plek` in het sjabloon krijgt deze keuze vóór de zes
   treden: eerst de vraag of iets weg of eenvoudiger kan, dan pas toevoegen. Het is een plek naast de ladder, geen trede: de
   ladder van 0059 punt 4 ("zo hoog mogelijk") blijft voor lessen die iets toevoegen. De plek dekt omschrijven, versnellen,
   samenvoegen en weghalen van code, checks, regels, hooks, skills en docs, bij gelijk of beter gevangen gedrag.
2. **Onderbouwing is verplicht en vast van vorm.** Bij deze plek heeft het issue een veld `Onderbouwing` met drie
   delen, elk niet leeg: `Meting:` (nu en verwacht, elk een getal of `onbekend` met de reden, en de bron: CI-duur per job,
   regels, `pnpm leespad`, `pnpm meting`, prompts of beurten), `Overname:` (welk risico het stuk nu dekt, en wat dat
   daarna dekt, of waarom dat risico weg is) en `Terugval:` (aan welk signaal je ziet dat het fout was, en hoe je het
   terugdraait). De issue-check van 0078 punt 3 toetst dat; ontbreekt een deel, dan `leerpunt-onvolledig`. Bij een andere
   plek mag het veld leeg zijn. Het veld vraagt, net als `Bron` en `Generieke reproductie`, geen appcode, appdata of geheimen.
3. **Sluitbewijs is een meting, en de eigenaar merget.** Een PR die zo'n leerpunt sluit, zet in `## Leerpunt` de regel
   `trede Schrappen of vereenvoudigen; bewijs meting: <voor> → <na> (<bron>)`, met twee getallen en een bron. De bestaande
   tests en verplichte checks blijven groen; een test weghalen of verzwakken blijft eigenaarakkoord (R-TEST-02). De job
   `leerpunt-bewijs` toetst de vorm en dat het issue zelf de plek "Schrappen of vereenvoudigen" heeft, zodat een gewone fix
   de eis "rood op de basis" niet via deze plek ontloopt. De PR is niet agent-mergebaar (zoals `geen test:` in 0078 punt 2):
   de eigenaar toetst meting en overname.
4. **Signaal in de sessie.** De slotstap van `opleveren` vraagt ook: was er een stap, check, hook of instructie die in deze
   sessie merkbaar tijd, rondes of tokens kostte zonder iets te vangen, of code die je las en die bij gelijk gedrag veel korter
   of sneller kan? Zo ja: een leerpunt met deze plek. De reviewer mag zo'n stuk als bevinding melden met het voorstel voor een
   leerpunt. Geen nieuw altijd-geladen proza.
5. **Signaal uit de week.** De wekelijkse voorsortering (0078 punt 8) krijgt een eigen bak voor deze plek (nooit "Klein"),
   gesorteerd op gemeten winst, vraagt per cluster van herhalingen welke oudere regel of check de nieuwe overbodig maakt, en noemt de drie
   langzaamste CI-jobs op main van de afgelopen week tegen de week ervoor, uit GitHub Actions, alleen lezend. Groeit er een
   met meer dan 20 procent, dan stelt de routine een leerpunt voor; zij dient zelf niets in.
6. **Vangnet.** Wordt een schrap-PR teruggedraaid of komt de gedekte fout terug, dan is dat een nieuw leerpunt met
   `eerder: #nnn` naar het schrap-leerpunt; de voorsortering toont die paren bovenaan. Zodra tien schrap-leerpunten gesloten
   zijn, meldt de voorsortering dat met het aantal terugkomers; meer dan één is voor de eigenaar een reden om de onderbouwing
   strenger te maken.

## Alternatieven

- **Schrappen via `geen test: <reden>` bij een bestaande trede.** Afgewezen: de trede klopt niet (er komt niets bij) en de
  reden heeft geen vaste vorm, dus niets toetst de meting.
- **Een losse periodieke opruimronde, buiten de leerlus.** Afgewezen: tweede kanaal voor hetzelfde soort les (0059, P7), en
  het signaal uit de sessie gaat verloren.
- **Agents schrappen zelf met agent-merge.** Afgewezen: een check die weg is, vangt niets meer; dat oordeel blijft bij de
  eigenaar tot de nameting uit punt 6 iets anders zegt.
- **De routine meet ook tokens en leespad.** Uitgesteld: de routine draait alleen lezend in de cloud; CI-duur staat in GitHub,
  tokens en leespad alleen lokaal.

## Gevolgen

- Sjabloon, ladder, issue-check, sluitbewijs, `opleveren`, reviewer en voorsortering wijzigen in één bouw-PR; geen nieuwe
  workflow, recht of dependency.
- Een schrap-PR kost de eigenaar een merge met een korte toets van meting en overname; een PR zonder leerpunt merkt niets.
- Afwijking van 0080 punt 3: spec `leerlus-bewijs` is gebouwd en kan in een besluit-PR nog niet uitbreiden (0080 punt 4 is
  nog niet gebouwd); daarom een eigen spec. Na de bouw van 0080 gaat die spec op in `leerlus-bewijs`, met een eigen PR.
- Spec `leerlus` AC-1 en AC-2 ("precies de zeven velden", `ladder` met zes opties) wijzigen door dit besluit: acht velden, de
  plek vooraan, en het achtste veld met dezelfde uitsluiting van appdata. De tests daarop veranderen in de bouw-PR; de tekst
  van die gebouwde spec volgt in dezelfde PR als het samenvoegen hierboven, omdat de guard haar nu niet laat wijzigen.
