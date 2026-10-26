# Leesgrens van de testrunner

`scripts/runner.sh` maakt voor elke run een tijdelijke kopie van de benodigde bronpaden (`RUNNER_INPUTS`).
Getrackte bestanden en nieuwe, niet-genegeerde bronbestanden gaan mee, met hun actuele inhoud; lokaal verwijderde bestanden
blijven weg. Git-metadata, persoonlijke configuratie, losse werkmapbestanden, genegeerde bestanden en `.env*` gaan niet mee.
De vaste testwaarden komen uit `db/test.env`. De vaste projectconfig `.prettierrc.json` gaat mee zodat de
schemagenerator dezelfde opmaak gebruikt; persoonlijke formatterconfig gaat niet mee. `node_modules` wordt afzonderlijk alleen-lezen gemount.

De invoer is alleen-lezen in de container. Alleen `.runner-output` is schrijfbaar. Symlinks in de geselecteerde bronpaden
en naar de afhankelijkheden of uitvoermap worden geweigerd, ook met een eigenaaroverride. De projectnaam bevat een hash
van het werkmappad, zodat twee worktrees met dezelfde mapnaam elkaars teststack niet opruimen. Runs in dezelfde werkmap
blijven sequentieel.

Een synthetisch hostbestand bestaat gedurende elke run buiten de geselecteerde invoer. `test/isolatie/runner-read.int.test.ts`
bewijst vanuit de container dat dit bestand onleesbaar is. Het bestand en de tijdelijke kopie verdwijnen bij afsluiten,
ook bij een mislukte test. De bestaande hostcodecontrole en netwerkisolatie blijven van toepassing.

Wijzigingen aan deze hostcode worden na review in de wegwerp-CI getest (ADR 0044), zonder lokale agentoverride.

De productie-smoke in `scripts/check-image.sh` volgt dezelfde leesgrens: alleen `package.json`,
`playwright.smoke.config.ts` en getrackte of nieuwe, niet-genegeerde `e2e/*.smoke.spec.ts` gaan naar een tijdelijke,
alleen-lezen projectie; `node_modules` krijgt een aparte alleen-lezen mount. Privébestanden, `.env*` en Git-metadata
gaan niet mee. Symlinks in bronpaden, hun ouders of de dependency-mountbron worden geweigerd. De bestaande cleanup-trap
ruimt de projectie ook bij fouten op. Deze smoke bewijst de productie-SPA zonder database; de echte-stack-e2e blijft apart.
