# Leerpunten voorsorteren

De prompt van de wekelijkse routine "Leerpunten voorsorteren" (maandag 07:36, Europe/Amsterdam). De routine verwijst naar
dit bestand; wat hier staat, geldt ([ADR 0078](../adr/0078-leerlus-met-bewijs.md) punt 8). Wijzig de prompt hier, niet in de
routine.

## Prompt

Wekelijkse voorsortering van leerpunten voor de eigenaar van de template-repo (`onderhoud.repository` in
`.claude/gates.json`). Antwoord in het Nederlands. Je werkt alleen lezend: geen issues sluiten, geen labels, geen comments,
geen branches, commits of PR's. De eigenaar beslist; jij sorteert alleen voor.

1. Lees `AGENTS.md`, het deel "Nu" van `docs/roadmap.md`, [ADR 0078](../adr/0078-leerlus-met-bewijs.md) en
   [ADR 0081](../adr/0081-leerlus-schrappen-en-vereenvoudigen.md).
2. Haal alle open issues met label `leerpunt` op (GitHub MCP, alleen lezen), en de gesloten issues met label
   `leerpunt-zonder-bewijs`. Lees per issue de tekst en de comments.
3. Controleer per open issue op main of het al is opgelost: zoek het issuenummer in `docs/specs/`, `docs/adr/`,
   `CHANGELOG.md`, `docs/roadmap.md` en in gemergde PR's die het nummer noemen.
4. Sorteer elk issue in precies één bak, met één zin waarom en het bewijs (PR-nummer, `bestand:regel` of spec):
   - **Sjabloon of bewijs ontbreekt**: label `leerpunt-onvolledig` (het issue volgt het sjabloon niet; noem de fouten uit
     de comment) of `leerpunt-zonder-bewijs` (gesloten zonder sluitbewijs; noem wat ontbreekt: een PR met sectie
     `## Leerpunt` of een comment `achterhaald: <reden>`).
   - **Kan dicht**: al opgelost op main of achterhaald; noem de PR met sluitbewijs of de reden voor `achterhaald:`.
   - **Schrappen of vereenvoudigen**: elk issue met die plek, alleen in deze bak (nooit "Klein"); gesorteerd op de gemeten
     winst uit `Meting:`, met per issue of `Overname:` het gedekte risico echt opvangt.
   - **Klein**: beperkte fix binnen bestaand gedrag, niet kritiek; een agent kan het met `agent-merge: ja` oppakken, met een
     test die op de basis faalt.
   - **Besluit nodig**: de eigenaar moet eerst kiezen; noem de keuze in één zin.
   - **Kritiek**: raakt auth, rolhek, hooks, bewaking, gates, ruleset of overige core; besluit-PR en eigenaarmerge nodig.
5. Noem herhalingen: issues met `eerder: #nnn`, en issues die over hetzelfde mechanisme gaan zonder die verwijzing. Zet
   bovenaan elk paar van een gesloten schrap-leerpunt en een later leerpunt met `eerder:` ernaar. Vraag per cluster welke
   oudere regel of check de nieuwe overbodig maakt. Zijn er tien of meer schrap-leerpunten gesloten, noem dat aantal en het
   aantal terugkomers.
6. CI-duur: haal de runs van de workflows op `main` van de laatste zeven dagen en de zeven dagen ervoor op (GitHub Actions,
   alleen lezen). Noem de drie jobs met de langste mediane duur, met beide medianen. Groeit een job met meer dan 20 procent,
   stel dan een leerpunt met plek "Schrappen of vereenvoudigen" voor in het verslag; dien niets in. Geen toegang tot de runs:
   zeg dat in één zin.
7. Eindig met een kort overzicht: per bak de issuenummers met titel, daarna hooguit drie aanbevolen eerste stappen. Hooguit
   40 regels. Zijn er geen open leerpunten en geen labels uit de eerste bak, zeg dat in één zin.

Twijfel je over een bak, kies "Besluit nodig" en zeg waarom.
