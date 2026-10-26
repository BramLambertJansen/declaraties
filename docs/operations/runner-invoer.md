# Leesgrens van de testrunner

`scripts/runner.sh` maakt voor elke run een tijdelijke kopie van de benodigde bronpaden (`RUNNER_INPUTS`).
Getrackte bestanden en nieuwe, niet-genegeerde bronbestanden gaan mee, met hun actuele inhoud; lokaal verwijderde bestanden
blijven weg. Git-metadata, persoonlijke configuratie, losse werkmapbestanden, genegeerde bestanden en `.env*` gaan niet mee.
De vaste testwaarden komen uit `db/test.env`. De vaste projectconfig `.prettierrc.json` gaat mee zodat de
schemagenerator dezelfde opmaak gebruikt; persoonlijke formatterconfig gaat niet mee. `node_modules` wordt afzonderlijk alleen-lezen gemount.

De lijst `RUNNER_INPUTS` (`scripts/runner.sh`, onder `# Alleen benodigde bronpaden`) is het uitbreidingspunt: heeft een
test een extra bronpad of projectconfig nodig, zet het daar bij (hostcode, dus eigenaarreview en wegwerp-CI). Een
niet-getrackt invoerbestand met meer dan één hardlink wordt geweigerd, ook met een eigenaaroverride: git ziet niet dat de
inhoud van een bestand buiten de repo kan komen.

De invoermounts van het profiel `test` in `compose.yaml` zijn lange bind-mounts met `create_host_path: false`. Zonder
`scripts/runner.sh` wijst de bron naar `./.runner-output/geen-invoer-start-via-runner`, een pad dat niets aanmaakt;
Docker weigert dan de container te starten omdat de bronmap niet bestaat en niet wordt aangemaakt. De dev-stack (postgres, mailpit) gebruikt die mounts niet en start
ongewijzigd. `test-pgtap` faalt als `db/tests` geen tests bevat.

## Zelfverdediging van de runner

`scripts/runner.sh` vertrouwt de aanroeper niet, ook niet bij een eigenaaroverride. Vóór de eerste git-aanroep:

- verwijdert hij elke `GIT_*`-variabele uit de omgeving (`GIT_DIR`, `GIT_CONFIG_COUNT/KEY/VALUE`, `GIT_CONFIG_GLOBAL`, ...)
  en zet `GIT_NO_REPLACE_OBJECTS=1` (geen `git replace`), `GIT_CONFIG_NOSYSTEM=1` en `GIT_TERMINAL_PROMPT=0`;
- wist hij `XDG_CONFIG_HOME` en zet `HOME` op de home uit de gebruikersdatabase (`getent passwd`, op macOS `dscl`), zodat
  de globale git-config (bv. `core.sshCommand`, `http.proxy`) niet uit een door de aanroeper gekozen map komt; is die
  home niet te lezen, dan stopt hij met exit 1. In de containers blijft `HOME` `/tmp` (`compose.yaml`);
- controleert hij bij de basisbepaling, vóór `ls-remote`, de herkomst van origin: `git config --show-origin --get-all
  remote.origin.url` geeft precies één waarde uit de config van de repo zelf (`<git-common-dir>/config`, niet
  `~/.gitconfig`, XDG of een include-bestand), en `git ls-remote --get-url origin` is daaraan gelijk. Anders stopt hij
  met exit 1. Een `insteadOf` of `include` die origin niet raakt, mag blijven. Onder `CI=true` en met de
  eigenaaroverride draait de basisbepaling, en dus deze controle, niet.

De basis is de sha bij exact `refs/heads/main` in `git ls-remote origin refs/heads/main` (met `timeout` als dat
beschikbaar is); een gelijkende ref als `refs/heads/fix/refs/heads/main` telt niet. Is ls-remote onleesbaar, is de sha
geen geldige object-id of ontbreekt die commit lokaal, dan stopt de runner met de melding `git fetch origin main`.
De hardlinkcontrole gebruikt `find -links +1`; faalt `find`, dan telt het bestand als hardlink en stopt de runner.

## Container

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
