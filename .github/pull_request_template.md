## Wat en waarom

<!-- Eén onderwerp per PR. Link naar de spec in docs/specs/ als die er is. -->

## Gedrag

<!-- Per acceptatiecriterium: de test en de uitslag. Alleen docs of geen gedragsverandering: "n.v.t." met reden. -->

| Acceptatiecriterium | Test | Uitslag |
|---|---|---|
|  |  |  |

## Bewijs

- Fase(s) uit `docs/roadmap.md` en waarom:
- Acceptatiecriteria die deze PR afdekt (bijv. `notes/AC-1`) en de tests die ze bewijzen:
- Checkuitslag per exact commando (`gate:fast`, `gate:slow`, osv-scanner, CodeQL; wat nog niet bestaat: "niet beschikbaar"):
- Bij schermwerk: `ui:check` gedaan voor:
- Gewijzigde bestaande tests, met reden:

## Checklist

- [ ] `docs/dod.md` doorlopen
- [ ] Raakt dit gedrag, API, configuratie of conventies? Dan zit de doc-wijziging in deze PR (of: n.v.t., reden)
- [ ] Geen bestaande migratie gewijzigd; geen test verwijderd of geskipt zonder akkoord
- [ ] Runnerchecks geïsoleerd uitgevoerd of werkelijke CI-uitslagen verzameld op de juiste SHA; geen agentoverride van hostcontroles (ADR 0009/0027)
- [ ] Nieuwe `unsafeCast` heeft een reden
