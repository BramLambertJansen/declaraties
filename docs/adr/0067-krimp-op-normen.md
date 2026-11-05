# 0067 — Krimpcontrole op normen in plaats van bytes

Status: geaccepteerd

Vervangt [0065](0065-grenzen-als-meting.md) punt 6; de rest van 0065 blijft gelden.

## Context

0065 punt 6 laat `check-docs` rood worden als een bindend document meer dan 20 % (en minstens 1 KB) krimpt, tenzij een
Markdown-bestand in de diff een kop `Normeninventaris` heeft. De review van main op 2 november 2026 vond dat die controle
het verlies dat haar veroorzaakte (#417, 27 normen weg) niet vangt:

- elke inventaris in elk Markdown-bestand telt, ook één regel in een los kladje, `alles → geschrapt: .` of een kop in een
  codeblok van een fixture;
- de drempel telt bytes: 20 % van het regelboek is ongeveer 39 normen, en een norm schrappen terwijl elders evenveel tekst
  bijkomt, valt nooit op;
- niemand kijkt naar de lijst: de reviewer leest volgens zijn leespad §8, en checklist en PR-sjabloon noemen de inventaris niet.

Een R-id is de eenheid van een norm. Die is exact te tellen, en het werk groeit dan met het aantal geschrapte normen, niet met
de omvang van het regelboek.

## Besluit

1. **Elke R-id die verdwijnt, staat op een vaste lijst.** Een R-id die op de merge-base in `docs/framework.md` gedefinieerd is
   en in de PR niet meer, staat in `docs/normen-vervallen.md` als `R-id → nieuwe R-id` (verplaatst of samengevoegd) of
   `R-id → geschrapt: <reden>`. Dat geldt voor elke verdwenen R-id, ongeacht de omvang van de PR. De lijst groeit alleen,
   is een beschermd pad, en een R-id wordt nooit opnieuw gebruikt; een latere hernummering of schrapping volgt de keten.
   Een definitie telt alleen in één vast patroon, buiten codeblokken en commentaar.
2. **Alleen die lijst telt, en alleen echte regels.** Een inventaris in een ander bestand telt niet meer. Een regel voor een
   R-id die nog bestaat, een verwijzing naar een R-id die niet bestaat, en tekst in een codeblok zijn een fout.
3. **De bytedrempel blijft** voor alle bindende documenten, ook het regelboek, voor normen zonder R-id. De inventaris staat
   op dezelfde lijst, onder een kop per document.
4. **De reviewer toetst de lijst en elke gewijzigde norm.** `check-docs` meldt elke R-id waarvan de tekst veranderde; de
   reviewchecklist en de reviewer-agent vragen of die norm niet is uitgehold, of een verplaatste norm echt bij de nieuwe R-id
   staat en of de reden van schrappen aanvaardbaar is.

## Alternatieven

- **De inventaris in de PR-tekst:** lokaal niet te lezen, dus lokaal en in CI een andere uitslag. Verworpen.
- **Alleen de byte-inventaris strenger maken** (vaste plek, geen codeblokken): vangt een geschrapte norm zonder netto krimp
  nog steeds niet. Verworpen.
- **R-id's ook in de andere bindende documenten tellen:** die herhalen R-id's maar definiëren ze niet; een verwijzing die
  verdwijnt is geen verloren norm. Verworpen.

## Gevolgen

- Elke geschrapte norm laat een spoor na met reden; samen met R-DOC-07 is dat ook de geschiedenis van het regelboek.
- Een PR die normen verplaatst of hernummert, krijgt meer regels op de lijst; dat is bedoeld.
- R-DOC-07, de spec leesbudget/AC-6 en de bijbehorende tests veranderen in de bouw-PR; de bestaande inventarissen in
  oude PR's blijven geldig voor die PR's.
