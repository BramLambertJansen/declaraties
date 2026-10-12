# Changelog

Hier staan wijzigingen die van belang zijn bij het gebruiken of bijwerken van de template. Releaseversies volgen zodra de template releases krijgt. Oudere bouwstappen en reviews zijn terug te vinden in Git en de pull requests.

## [Unreleased]

### Toegevoegd

- Een React-webapp en Hono-API met een aparte core- en app-laag.
- Inloggen, uitnodigingen en tweestapsverificatie met Better Auth. Beheerders kunnen accounts bekijken, rollen wijzigen en uitnodigingen opnieuw versturen.
- Postgres-migraties, row-level security en tests voor datatoegang.
- Een UI-kit met componentcatalogus, formulieren, bevestigingsdialogen en toegankelijke navigatie.
- Een lokale omgeving met Postgres en Mailpit, installatie- en diagnosecommando's en demoaccounts.
- Een resourcegenerator die eerst een featurespec maakt en na goedkeuring een implementatieskelet. De handlers moeten nog worden ingevuld.
- Een setup-playbook en hernoemscript voor nieuwe apps. Template-updates gebruiken merge-commits om de geschiedenis te behouden.
- Requestlogging, health- en readinessroutes, gecontroleerd stoppen en een containerimage voor de webapp en API.
- Controles voor codekwaliteit, architectuur, migraties, database- en schermgedrag, kwetsbaarheden en secrets, lokaal en in GitHub Actions.
- Uitgewerkte roadmaptaken voor de verdere ontwikkeling van de starter.

### Documentatie

- De README beschrijft de huidige basis, lokale installatie en beschikbare controles.
- Een leeswijzer maakt onderscheid tussen gebruiksdocumentatie, ontwikkelafspraken en agentinstructies.

### Bij een update

De template heeft nog geen releaseversies. Controleer bij een update de gewijzigde migraties, architectuurbesluiten en instellingen. Een volledige upgradecontrole staat op de roadmap.

- **`.claude/settings.json`: dode deny-regels `Read(!.env.example)` en `Edit(!.env.example)` weg.** Claude Code las de `!` als letterlijke padnaam, niet als uitzondering. Wat verandert voor een app: niets in gedrag; `.env.example` was en blijft voor agents onleesbaar via `.env.*` (permissieregel én sandbox). Wat de eigenaar moet doen: niets. Conflicten: alleen als de app deze regels in `.claude/settings.json` zelf aanpaste.
