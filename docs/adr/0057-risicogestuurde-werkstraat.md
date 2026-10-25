# 0057 — Risicogestuurde werkstraat met volledige CI

Status: geaccepteerd

Wijzigt de vaste rolvolgorde uit framework §8 en [0046](0046-werkstraat-en-beslisroute.md), de organisatievoorwaarde
uit [0039](0039-stack-provider-neutraal-en-toolchain.md) punt 8 en de activering van [0054](0054-gebouwd-in-de-bouw-pr.md).
Drempel: A3 (lokale dubbele controles en verplichte rolwissels verminderen), A4 (bestaande besluiten aanpassen).
Deze status is een voorstel tot acceptatie; alleen de eigenaar maakt het met zijn merge geldend.

## Aanleiding

De eigenaar vroeg een efficiënte werkstraat voor vooral Claude Code: een bouwer en onafhankelijke review voor gewoon
werk, extra specialisten bij hoger risico, volledige CI op iedere PR en een afzonderlijke GitHub App op de huidige repo.
De huidige developer-stop en pre-push starten ieder een volledige snelle gate. De lokale feitenopdracht laadde zelfs
bij `gates` de UI-catalogus; vijf processen kostten mediaan 426 ms, tegenover 32 ms bij uitgesteld laden. Dat bewijst
onnodig opstartwerk, geen algemene garantie voor doorlooptijd of tokenbesparing.

## Besluit

1. **Intake op risico.** De hoofdsessie bepaalt vóór overdracht het kleinste passende pad uit opdracht, diff en bestaande
   gate-paden. Gewoon, omkeerbaar app-werk krijgt één bouwer die code en tests maakt, gevolgd door een onafhankelijke
   reviewer. Een aparte tester en architect zijn verplicht bij A2/A3/A4, auth, wijzigingen van het RLS-/rollenmodel,
   migraties op bestaande data of buiten het vaste generatorpatroon, nieuwe dependencies,
   de vertrouwensgrens of moeilijk terug te draaien gedrag. Twijfel gaat naar dit zwaardere pad. De bestaande specplicht
   voor migraties, routes en permissies en exacte mandaten voor beschermde broncode blijven gelden.
2. **Eén lokale volledige eindcontrole.** Bestandsfeedback en gerichte lint-, type- en testcontroles blijven. Developer-stop
   herhaalt geen volledige `gate:fast`; vóór push draait die eenmaal via de bestaande pre-push-hook. Iedere PR behoudt
   volledige CI. Er komt geen hergebruik van een oude groene CI-status of generieke cache die tests kan overslaan.
   Foutoplossing, bronwijzigingen en ongeldige controle-invoer vereisen opnieuw toepasselijke controles.
3. **Context op verzoek.** Iedere rol vraagt alleen taakrelevante feiten; componenten alleen bij UI-werk. Overdracht bevat
   doel, contract/spec, gewijzigde paden, nog open keuzes en exacte testuitslagen. Ruwe logs en afgeronde gesprekken worden
   niet standaard opnieuw geladen. ADR's blijven vindbaar via de statusfilter; fysiek archiveren is geen voorwaarde.
4. **Onafhankelijke review blijft verplicht.** De bouwer beoordeelt zijn werk niet als onafhankelijke reviewer. De reviewer
   krijgt een schone context en alleen leesrechten. Ontbreekt die runtimefunctie, dan reviewt de eigenaar. Na inhoudelijke
   wijzigingen wordt het verschil opnieuw beoordeeld. De hoofdsessie verzamelt het bewijs; de eigenaar merget.
5. **GitHub App eerst op de huidige repo.** Een aparte botidentiteit zonder admin-, workflow- of instellingsschrijfrecht
   vervangt het eigenaartoken voordat verplichte owner-review wordt geactiveerd. Geen organisatiemigratie als voorwaarde.
   De eigenaar installeert de App en activeert de ruleset: alle geregistreerde checks van de juiste herkomst, owner-review,
   vervallen goedkeuring na nieuwe push, opgeloste gesprekken en geen bypass. Onleesbare instellingen zijn rood.
6. **Veilige status in de bouw-PR.** ADR 0054 wordt pas geactiveerd wanneer een verplichte, uit vertrouwde code uitgevoerde
   `build-proof` de echte successen van alle vereiste uitvoeringschecks op dezelfde bron-SHA en juiste PR/repository/branch
   bewijst. Ontbrekend, overgeslagen, neutraal, geannuleerd en mislukt gelden niet als succes. Die check mag geen PR-code
   uitvoeren en zichzelf niet als bewijs vereisen. Tot die check én de volledige ruleset aantoonbaar actief zijn, blijft de
   bestaande SHA-gebonden route gelden. Bestaand bouwbewijs blijft geldig.
7. **Activering in volgorde.** Eerst de veiligheidsfixes, dan dit besluit, daarna gerichte implementatie-PR's voor instructies,
   hooks en bewaking. De code uit main bepaalt de actieve rechten. Een voorstelbranch of lokale test activeert niets.

## Alternatieven en gevolgen

Selectieve CI en automatische agent-merges vallen af: de eigenaar wil volledige CI en houdt de merge. Een universele
inhoudscache en extra permanente registers brengen nu meer onderhoud dan bewezen winst. Extra specialisten blijven
beschikbaar wanneer het risico dat vraagt, zonder verplichte overdrachten voor iedere kleine wijziging.

Vergelijk vóór en na dezelfde resource-opdracht: eigenaarvragen, rolwissels, lokale volledige gates, CI-rondes en doorlooptijd
via de bestaande meting. Claim tokenwinst alleen met werkelijk beschikbare verbruikscijfers. Het aantal controles, negatieve
securitygevallen en de onafhankelijke review mogen niet afnemen. App-installatie, rulesetactivering en owner-merge blijven
zichtbare afhankelijkheden; zolang bewijs ontbreekt is dit traject onvoltooid.
