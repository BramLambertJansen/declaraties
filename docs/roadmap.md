# Roadmap

Uitwerking van [framework.md](framework.md) §12: wat open staat, in welke volgorde en wat klaar is. De status staat in het
vinkje, de specstatus en het PR-nummer, nooit in een datum of in proza. Vink alleen af met bewijs (PR-nummer, testpad of checknaam;
`pnpm check:roadmap` dwingt het af). Eén plek per item: `ST-nn` is het label van een agenttaak uit de starter-beoordeling
(P0 noodzakelijk voor een veilige basis, P1 voor een herbruikbare en bewezen starter, P2 optioneel op aanleiding).
Indeling en volgorde volgen ADR 0046 en [de inventaris](reviews/2026-10-15-principes-inventaris.md).
Fase 0 en 1 horen in de template; fase 2 levert verbeteringen terug aan de template; fase 3 is per app.
Reviews: [2026-10-09 fundering](reviews/2026-10-09-fundering.md), [2026-10-09 framework](reviews/2026-10-09-framework.md).

**Werkwijze per item:** lees AGENTS.md, de relevante ADR's en specs en begin met de feiten (`node scripts/kit/feiten.mjs`);
volg [de DoD](dod.md) en de werkstraat uit [het framework](framework.md) §8. Zoek eerst bestaande implementaties en open PR's: breid uit,
bouw geen tweede mechanisme. Nieuwe route, permissie of migratie: eerst een spec ([sjabloon](specs/_template.md)) met eigenaargoedkeuring.
Deze roadmap is geen goedgekeurde spec en geeft geen toestemming voor dependencies of providerkeuzes. Verander geen vinkjes of
ADR-statussen op basis van deze lijst; meld onbesliste waarden aan de eigenaar. Houd de core klein: SaaS, PWA, storage en notificaties
zijn optioneel. Een bestaand script of ADR bewijst niet dat de capability compleet of actief is.

## Nu

Hooguit drie open items (`check:roadmap`); nummer 1 is bewijs vóór uitbreiding (P1).

- [ ] **ST-09 (P1) — proef-app met template-update** (fase 1, stuk 6). Doel: bewijzen dat de template als basis voor een app werkt, vóór verdere uitbreiding.
  **Uitvoeringsopdracht:** begin met [de agentstartinstructie](../START-NIEUWE-APP.md) en vervolg met het generieke [ST-09-protocol](operations/st-09-praktijkproef.md). Appkeuze, scope, appdata en resultaten horen in de aparte app-repo, niet in deze template.
  **Werk:** kies met de eigenaar één kleine echte app met een owner-scoped resource en een adminactie. Start via `docs/nieuwe-app.md`, bouw een
  complete verticale flow en registreer elke handmatige stap, onduidelijke instructie, ontbrekende component en core-aanpassing; houd het
  app-domein buiten deze template. Neem daarna één echte template-update over (`git merge template/main`) via een PR (ADR 0040).
  Wat terugkomt wordt een regel of script in de template; elk leerpunt gaat als `leerpunt`-issue naar de template ([leerlus](specs/leerlus.md), ADR 0059).
  **Afhankelijkheden:** bestaande runtime, auth en generator; de eigenaar levert de lokale stack en de appkeuze.
  **Klaar als:** een nieuwe gebruiker en admin doorlopen de flow tegen de echte stack; verboden toegang is getest; de update behoudt app-code
  en instellingen, met conflicten alleen in vooraf als verwacht vastgelegde bestanden; rapport met exacte checks, handwerk en verbeter-PR's
  terug naar de template. Een demo in deze repo alleen telt niet.
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (P1, besluit 1)
- [ ] **ST-14 (P1) — documentatie en bouwresten opruimen** (opdracht stap 5). Doel: een repo waarmee mensen en agents apps bouwen zonder het
  bouwproces van het framework te reconstrueren; helder Nederlands over de huidige werking; bouwen met agents blijft het uitgangspunt.
  **Gedaan:** README, changelog, leeswijzer en de eerste inventaris (docs en roadmap, `docs/reviews/2026-10-15-principes-inventaris.md`).
  **Open:** categorie C van die inventaris (D-3 t/m D-16: framework regel 4, §10 Meten, AGENTS.md-status, DoD, `.claude/rules/web.md`,
  agent-doorloop, CHANGELOG, README), plus codecommentaar, gebruikers- en mailteksten, scripts, agentinstructies en GitHub-templates.
  Elke wijziging op een beschermd pad vraagt een eigen eigenaarakkoord. GitHub: vul een korte beschrijving en topics in en controleer de
  template-instelling; voorstel: "Template om webapps met code-agents te bouwen. React, Hono en Postgres, met agentinstructies,
  UI-componenten en ontwikkelcontroles." (de controle vond geen beschrijving of topics en een uitgeschakelde template-instelling).
  **Behoud:** verwijder niets dat agents helpt (instructies, skills, hooks, voorbeelden, specs, ontwerpcontext, valkuilen, herstelstappen,
  overdracht, bewijs); bij twijfel blijft het staan. Een bouwverslag verdwijnt pas als geen mens of agent hem nodig heeft; verplaats unieke
  informatie eerst naar een vindbare plek en controleer de verwijzingen. Git of een oude PR vervangt geen agentinformatie. Verwijder geen
  tests, fixtures, migraties, gates, veiligheidsregels of goedkeuringshistorie en herschrijf geen Git-geschiedenis; ADR's verlopen
  (`vervallen`, `vervangen door NNNN`) maar verdwijnen niet; een spec mag alleen weg met apart eigenaarakkoord.
  **Redactie:** weg met gesprekstaal, zelfbeoordelingen, opgeblazen formuleringen, lege herhaling en verouderde statusclaims; behoud herhaling
  die afzonderlijk geladen agentcontext nodig heeft. Besliste open vragen worden besluiten (datum, herkomst, alternatieven); open werk is
  een roadmaptaak, keuzes zijn ADR's, appwijzigingen staan in de changelog. Menselijke leesroute: README, leeswijzer, gebruik of ontwikkeling.
  **Klaar als:** elk bestand in de inventaris heeft een onderbouwde bestemming; verwijzingen zijn aangepast en een zoekronde vindt geen
  verwijzing naar verwijderde bestanden; docs kloppen met code en commando's; `pnpm ratchet` en toepasselijke gates groen; `app:init` werkt;
  de agentprocedure voor een nieuwe app en een feature is nog bereikbaar vanuit de startpunten. De eigenaar leest de instappagina's en een
  steekproef; een woordfilter bewijst geen goede redactie. Ook: overbodige bouwresten zijn verwijderd; de inventaris toont waar alle bruikbare
  agentinformatie behouden is; een menselijke lezer kan de app starten en de bouwafspraken vinden zonder reviewlogs te lezen.
  **Vangrails:** leg per verwijdervoorstel vast waarom geen instructie, ontwerpcontext of leerpunt verloren gaat; bewijs voor een open taak blijft
  bereikbaar totdat die taak is afgerond; raakt opruimen tests, fixtures, migraties, gates, veiligheidsregels of goedkeuringshistorie, leg de
  wijziging dan apart aan de eigenaar voor. **Afhankelijkheden:** eigenaarreview van de opruiminventaris; geldende besluiten en bewijscriteria;
  `app:init` dat README en changelog gebruikt.
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (categorie C, besluit 1)

## Volgende

Open werk dat niet geparkeerd is, grofweg in volgorde. Wat nog een spec of eigenaarbesluit nodig heeft, zegt het item.

- [x] **ADR 0029 bouw: feature-lane en mini-spec** (punt 1–3, 7). Lane-herkenning in `check-document-status`, `docs/specs/_mini.md`, het
  frontmatterveld `sjabloon: mini` in `check-docs`, "Besluit en taakscope voorbereiden" in `docs/operations/agent-doorloop.md`; fixtures in `test/rails/`.
  aanleiding: `docs/adr/0029-snellere-beslisroute.md` (punt 1–7). Gebouwd in #199: `scripts/kit/lane.mjs`, `_mini.md`, `sjabloon: mini` in `check-docs`, statuscommit-controle (a)–(c).
- [x] **ADR 0031 PR 2: documentstatus als verplichte check.** `check-document-status` draait als eigen job `document-status`
  (`.github/workflows/guard.yml`) en staat in `requiredChecks` van `.claude/decisions.json`, zodat `pnpm pr:verify` een rode documentstatus ziet
  Gebouwd in #203; `gh api`-verificatie door de eigenaar op #202 (`diff-guard` op de head-SHA, app-id 15368). Dat is een fout in een rail (P2), geen meta-werk. Na PR 2 eist `gebouwd` een extra check (ADR 0031, "Gevolg voor gebouwd").
  aanleiding: `docs/operations/agent-doorloop.md` (besluit 2 van de inventaris)
- [x] **Vertrouwde basis uit het anker, niet uit de lokale origin/main.** Binnen een hook lezen rolhek, register en runnercheck hun
  configuratie uit het anker van de stub-lader (`RAILS_ANKER`, `rails/hooks/lib/objecten.mjs`), met hashcontrole van commit, trees en blob;
  bewijs `test/hooks/vertrouwde-basis-anker.test.ts`. Een omgebogen lokale ref (`movesTrustedBase` laat een fetch met een andere bron door)
  telt daardoor niet meer voor de hooks (met de nieuwe stub-lader; een sessie met een oude stub leest nog de lokale ref); scripts buiten een hook lezen nog de lokale ref, CI blijft de grens.
  aanleiding: `rails/hooks/lib/rolhek.mjs` (review van de PR voor ADR 0033 punt 1)
- [x] **Subagent-stop leest de JSON van vitest niet.** `rails/hooks/lib/werkstraat.mjs` zocht het rapport van `vitest --reporter=json` op stdout;
  vitest 5 schrijft het naar een bestand, dus de tester-stop meldde "geen uitvoer van vitest". Nu krijgt vitest `--outputFile.json=.vitest/json/tester-run.json`
  en leest de hook dat bestand, alleen als vitest meldt dat hij het schreef; bewijs `test/hooks/werkstraat.test.ts`.
  aanleiding: `rails/hooks/lib/werkstraat.mjs` (tester-run in de PR voor ADR 0033 punt 1)
- [x] **Toast: pauze bij hover en focus, fout blijft staan** (WCAG 2.2.1). Besluit eigenaar 2026-10-18 (in de sessie): succes 5 s, een fout
  verdwijnt niet vanzelf maar blijft tot de gebruiker hem sluit (of tot het bestaande maximum van drie toasts hem verdringt); de timer pauzeert zolang de muis op een toast staat of de focus erin.
  Alternatief verworpen: alleen pauze met 8 s voor een fout (een fout kan dan nog wegvallen terwijl iemand hem leest). Bewijs `src/core/web/ui/toast.test.tsx`.
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (besluit 2)
- [x] **Toast: dubbele aankondiging in NVDA** (`role` binnen een `aria-live`-container). De `aria-live` van de twee containers is weg; de rol
  (`status`, `alert`) zit alleen op de kaart. Keuze eigenaar 2026-10-18 (in de sessie), verworpen: een vaste live-regio met kaarten zonder rol
  (betrouwbaarder voorlezen, maar toasts zijn dan niet meer op rol te vinden: ca. 15 e2e-selectors en 5 unit-testbestanden) en een vaste regio met
  rol (permanent twee lege status/alert-elementen). Bekend gevolg: een `role=status` die met zijn inhoud wordt toegevoegd, lezen sommige
  schermlezers minder betrouwbaar voor; `role=alert` wel. Bewijs `src/core/web/ui/toast.test.tsx`.
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (besluit 2)
- [ ] **Focus naar de h1 na een routewissel naar een lazy route** (`/design-system`): in e2e (Vite dev) staat de focus daarna op `body`.
  Geprobeerd: `routeKey` uit `resolvedLocation`, wachten op een (zichtbare) h1 met een MutationObserver, en terugzetten als de focus
  verloren gaat. Vermoeden: pending-weergave of het laden van de chunk duurt langer dan `HEADING_WAIT_MS` (2 s), of het pad naar
  `resolvedLocation` loopt anders. Eerst reproduceren met een trace (`pnpm ui:check`), dan pas repareren (stuk 3f).
  aanleiding: `src/core/web/ui/app-shell.test.tsx` (bekende fout, geen capability)
- [ ] **ST-02 (P0) — accountbeheer en herstel afmaken** (stuk 3e; bestaande accountbeheer-specs). Open: TOTP-backupcodes (zodat een admin
  zonder telefoon niet alleen via `admin:create` terugkomt), een openstaande uitnodiging intrekken (opnieuw versturen bestaat al:
  `reinviteRoute`) en een admin-resetlink ("wachtwoord vergeten" blijft dicht, ADR 0043). Elk deel eerst een spec.
  **Werk:** specificeer herauthenticatie, sessie-intrekking, tokenverval, oude/nieuwe adresbevestiging en herstel zonder rolpromotie;
  koppel audit en mail aan ST-04 en ST-03 en kopieer geen synchroon mailpad als de outbox de geldende route wordt.
  **Afhankelijkheden:** ADR 0043; audit voor admin-acties; relevante stappen uit ADR 0050.
  **Klaar als:** echte-stack e2e per flow; verboden rol en admin zonder MFA geweigerd; laatste-admin-racetest; herstelcode eenmalig, ook bij
  parallel gebruik; ingetrokken of verlopen links werken niet. Elk deel krijgt afzonderlijk bewijs.
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (B-11)
- [ ] **ST-04 (P0) — audit: vervolg** (ADR 0051, spec audit-log). Gebouwd in #128: migratie, `ctx.audit`, invite/reinvite. Open: `/admin/audit`
  (eigen spec) en audit voor de routes revoke en reset-link (met ST-02).
  **Werk:** servergegenereerde request-ID, audit in de transactie, append-only-tabel met vaste grants en policies, getypte strict gevalideerde
  details (geen willekeurige payloads, e-mailadressen of vrije tekst), aparte core-auditwriter voor Better Auth-acties.
  **Klaar als:** audit wordt met de actie teruggedraaid; verboden schrijver en lezer geweigerd; auditdetails falen buiten de allowlist;
  een vervalste client-request-ID wordt niet gebruikt.
  aanleiding: #128
- [ ] **ST-03 (P0) — achtergrondtaken: runner, opruimen en mail-outbox** (stuk 7; [ADR 0050](adr/0050-achtergrondtaken-en-mail-outbox.md): runner in het API-proces,
  eigen rol `app_jobs`, outbox zonder token; ADR 0020 staat onder Besluiten ter herziening). Opruimen van verlopen sessies, uitnodigingen en
  rate-limit-rijen, en mail via een outbox, elk met een integratietest.
  **Werk:** volg de sectie Bouwvolgorde van ADR 0020 letterlijk (audit, bewaarcatalogus, jobrol, runner, outbox). Verbindingen blijven in de
  bestaande db/auth-laag en worden aan de runner geïnjecteerd. Batches, locks, leases, begrensde retries, definitieve foutstatus en herstel na een
  procescrash. Geen uitnodigingstoken in de outbox; verzendstatus zichtbaar voor de admin; herstelrunbook. Een naar nul schalende host krijgt later
  een eigen adapter; kies nu geen queue-provider.
  **Afhankelijkheden:** ST-04 en ST-05 volgens de ADR-bouwvolgorde; akkoord voor beschermde rol- of env-wijzigingen.
  **Klaar als:** twee runners claimen dezelfde rij niet tegelijk; crash, lease-verval en SMTP-uitval getest; definitief mislukte mail blijft
  herstelbaar; alleen verlopen rijen verdwijnen; stoppen wacht op de lopende batch vóór het sluiten van pools. Documenteer at-least-once-verzending
  (geen exactly-once-claim).
  aanleiding: `docs/adr/0050-achtergrondtaken-en-mail-outbox.md`
- [ ] **ST-05 (P0) — AVG: privacymechanisme, export en verwijderen** ([ADR 0051](adr/0051-audit-log-en-avg.md), ter herziening). Mechanisme in core, inhoud per app.
  **Werk:** bewaarcatalogus, FK-invarianten, eigen export, admin-verwijdering en app-registratie van exporters en erasers, in de volgorde van
  ADR 0020. Accountverwijdering en audit blijven in één transactie (geen tweede verbinding op dezelfde laatste-admin-lock). Exporters filteren
  expliciet op eigenaar, ook als RLS gedeelde data toelaat. Valideer bewaartermijnen en retention-kolommen; catalogusregistratie ook in de
  generator; lever het privacyregister-sjabloon (juridische inhoud en back-uptermijnen blijven per app).
  **Afhankelijkheden:** audit, bewaarcatalogus en outbox (ADR 0050); goedgekeurde export- en verwijderspecs.
  **Klaar als:** gedeelde data van anderen ontbreekt in de export; accountverwijdering ruimt ook tokens en outbox op; laatste-admin en
  eigen-admin-verwijdering geweigerd; terugrollen herstelt actie en audit samen; negatieve pgTAP-fixtures voor cascades, nullable SET NULL en
  catalogusregistratie; een app-exporter en -eraser werkt zonder core-aanpassing. Retention is techniek, geen claim van AVG-conformiteit.
  aanleiding: `docs/adr/0051-audit-log-en-avg.md`
- [ ] **ST-01 (P0) — GitHub-bescherming daadwerkelijk activeren** (stuk 6, diff-guard uit stuk 4). Een agent kan beschermd werk niet zonder de
  juiste eigenaarreview samenvoegen. Gebouwd: `scripts/github-ruleset.sh` met `test/scripts/github-ruleset.test.ts` (#104), de diff-guard met
  `guard.yml` (#62, ADR 0045 punt 17; nog niet verplicht, uitslag `overgang` zolang de auteur zelf goedkeurder is) en CODEOWNERS en PR-template.
  Open: organisatie, GitHub App voor de agent, org-ruleset via custom property en Actions-instellingen (daarna code-owner-review en 1 goedkeuring
  aan; private repo's vragen Pro/Team); `.github/settings/` met `scripts/check-github.mjs` (alleen-lezend, een onleesbare instelling is een fout;
  ook `app_id` van verplichte checks, `enforce_admins`, conversation resolution) en `check-spec-approval`; `docs/operations/rails-checklist.md` met
  per stuk bewijs; pushen met een kortlevend App-token zonder het eigenaar-token in de agentomgeving, daarna `denyRead` op `~/.config/gh`;
  de diff-guard verplicht bij de overstap op de App, met goedkeuring op exact de head-SHA die niet van de auteur is (framework §10). Onderscheid de overgang onder het eigenaaraccount van de definitieve App-opzet; de eigenaar
  activeert organisatie, App en instellingen.
  **Afhankelijkheden:** ADR 0039, 0040 en 0045; beschikbaarheid van de vereiste CI-checks.
  **Klaar als:** negatieve fixtures voor ontbrekende of bypassbare instellingen; bewijs dat een directe push naar main wordt geweigerd en een
  bot-PR zonder vereiste review niet mergebaar is. Geen actieve bescherming claimen op basis van alleen JSON-bestanden. Voorwaarde voor ADR 0030 PR 2.
  aanleiding: `scripts/github-ruleset.sh`
- [ ] **Versie en build-SHA** (stuk 3f) in `GET /api/health` en onderaan in de app (publieke buildmetadata, geen secrets); vraagt een spec
  voor de healthcontractwijziging. De versiestrategie zelf hoort bij ST-12 (Geparkeerd).
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (B-11)
- [ ] **`/.well-known/security.txt` en `LICENSE`** (eigendom, geen open-source-licentie): beide wachten op een waarde van de eigenaar
  (contactadres per app; licentietekst).
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (B-11)
- [x] **`.claude/settings.json` bewezen** (stuk 5): de sandbox start op Ubuntu/WSL2 (bubblewrap, socat) en de deny-regels zijn getest, ook
  `.env.example` via `allowRead` en `cat .env`. Bewijs #239 (`docs/operations/sandbox-bewijs.md`), met twee beperkingen: een bestand dat
  hetzelfde commando aanmaakt is leesbaar, en `~/.ssh`/`~/.aws` bestonden niet op de proefmachine.
  aanleiding: `.claude/settings.json` (onbewezen sinds stuk 5; `test/rails/sandbox-settings.test.ts` dekt de spiegel, niet de sandbox)
- [ ] **`gate:fast` definitief** (stuk 4): vastleggen welke checks de definitieve `gate:fast` bevat (nu een groeiende lijst in `scripts/kit/gates.mjs`); `gate:slow` is gebouwd (#38), squawk staat onder Geparkeerd.
  aanleiding: `scripts/kit/gates.mjs`
- [x] **`check-core`** (stuk 4): een app wijzigt `src/core` niet. Met fixture die bewijst dat hij faalt. Job `check-core` in
  `.github/workflows/guard.yml` met `scripts/kit/check-core.mjs` (regels uit ADR 0040, in de template uit); bewijs `test/rails/check-core.test.ts`.
  aanleiding: `.claude/rules/core.md`
- [x] **`check-core`: geen oudere core via een merge** (ADR 0040, downgrade-gat). Een merge met een oudere vertrouwde commit kan een oudere
  `src/core` terugbrengen of core verwijderen. Aanscherping: core van head is gelijk aan die van base of van een vertrouwde templatecommit die
  niet ouder is dan de core op main. Met fixture die de downgrade laat falen. Bewijs: `test/rails/check-core-downgrade.test.ts`.
  aanleiding: #240 (ADR 0040; eigenaarbesluit: nu aanvaard, aanscherping als vervolg)
- [ ] **Fout die in een app doorglipt wordt eerst een check of regel in de template** (met fixture), daarna gerepareerd in de app (fase 2; doorlopend, P5).
  aanleiding: `docs/adr/0046-werkstraat-en-beslisroute.md` (P5)
- [ ] **ST-10 (P1) — staging, release en aantoonbaar herstel** (fase 3, per app). Na een provider-ADR (`0100`+: hosting en beheerde Postgres met eigen
  rollen) een adapter in `deploy/<host>/`, gescheiden omgevingen, lektest via de pooler, rollen per omgeving via runbook, `check-deployment-schema` (faalt dicht, weigert preview
  tegen productie), `check-release-ci` vóór én na de build, beschermde production-approval, release-workflows en smoketest na deploy; headers/CSP op
  de host, CAPTCHA, PWA-manifest. Runbooks in `docs/operations/` (platform, back-up en herstel met acceptatietabel); beschrijf code-rollback,
  vooruitmigratie en verwijderde gegevens in back-ups. De eigenaar kiest beschikbaarheidsdoelen, RPO/RTO, regio en bewaartermijnen. **Afhankelijkheden:**
  providerbesluit, ST-01, ST-08, privacyregister. **Klaar als:** preview tegen productie faalt; vereiste CI en staging horen bij exact het
  releasecommit; de smoketest bewijst login, lezen en gesloten browser-datatoegang; een back-up is in een aparte omgeving teruggezet met gemeten
  dataverlies en hersteltijd. Productiegoedkeuring blijft bij de eigenaar.
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (B-6: niet geparkeerd besloten)
- [ ] **ADR 0029 stap 7: agent-merge in de feature-lane** (route 2, onder het account van de eigenaar; zwakte in ADR 0046, Gevolgen, aanvaard).
  Spec: `docs/specs/agent-merge.md`. PR A: `scripts/check-github.mjs`, `.github/settings/main-protection.json`, sleutel `merge`, lane-uitslag in de diff-guard;
  PR B: rolhek, `.claude/settings.json`, skill `opleveren` en docs (eigenaar); PR C: `merge` op `"feature-lane"` zetten (eigenaar).
  aanleiding: `docs/adr/0046-werkstraat-en-beslisroute.md` (punt 30, 33–35 en Gevolgen)
- [x] **Volledig pad naar `gh` in het rolhek** (V-13): `/usr/bin/gh pr merge …` viel buiten het rolhek (`program === "gh"`) en de settings-patronen.
  Weigeringen en schrijfdoelen kijken nu naar de naam zonder pad (`programName` in `rails/hooks/lib/shell.mjs`), ook voor `git`, `rm` en `sed`;
  bewijs `test/hooks/rolhek-volledig-pad.test.ts`. De `deny`-patronen in `.claude/settings.json` vangen de vorm met pad niet (gemak, geen grens; framework §8).
  Niet in deze klasse gedicht: omhulsels met opties (`sudo -u x gh …`, `env -i gh …`) en omhulsels buiten de lijst (`timeout`, `xargs`);
  expansie (`$GH`, `bash -c`) is werk van de diff-guard. Ook open, voor de reviewer: `reviewerMay` negeert voorafgaande variabelen
  (`GIT_PAGER=…`, `PATH=…`) en opties als `git diff --output=<bestand>`.
  aanleiding: `rails/hooks/lib/rolhek.mjs` (spec `agent-merge`, Bekende gaten)
- [ ] **Schrijven via een programma buiten `fileTargets` omzeilt het rolhek.** `writeTargets` in `rails/hooks/lib/shell.mjs` kent alleen een
  vaste lijst (redirect, `tee`, `sed -i`, `cp`, `git checkout` …). Een script via `python3`, `node -e` of een heredoc naar zo'n interpreter
  (`python3 - <<EOF`), en ook `awk`, `patch`, `git apply`, `curl -o`, `tar x` of `prettier --write`, schrijft beschermde paden zonder de
  beslissing (ask, deny of melding) die een Edit op hetzelfde pad krijgt; een redirect (`cat > f <<EOF`) ziet het rolhek wel. Eerst kiezen
  tussen weigeren en melden; de diff-guard in CI blijft de grens.
  aanleiding: #260 (eigenaarbesluit: als item opnemen; de developer schreef `.claude/**`, `.github/**`, `scripts/**` en `rails/**` via een Python-script, de reviewer zag alleen ADR-nummerwijzigingen)

## Geparkeerd

Bewust nog niet, tot de genoemde aanleiding er is (P1). Niets verdwijnt: elk item staat er met zijn scope.

- [ ] **Toasts: overige opvolging.** Bereikbaar onder een open modale `Dialog` (inert: niet voorgelezen, sluitknop onbereikbaar) en een `Toaster`
  voor `CenteredCard`-schermen (`/login`, `/uitnodiging`); toonklassen in een CVA-recept in plaats van gekopieerd uit `Notice`, zodat de
  contrasttest ze dekt; bestaande `Notice`-meldingen na een mutatie omzetten (`name-section.tsx`, `sessions-section.tsx`, `row-actions.tsx`) met
  bijgewerkte tests, waarna `.claude/rules/web.md` en `docs/gouden-pad.md` Toast noemen (beschermd pad: akkoord eigenaar).
  terug als: de proef-app toasts gebruikt
- [ ] **Screenshot-baselines van de catalogus** in de Playwright-image (uit fase 2).
  terug als: een visuele regressie doorglipt
- [ ] **ST-06 (P1) — generator tot complete CRUD-flow.** De generator levert bewust 501-handlers; zoeken en sorteren in de lijst zijn gebouwd
  (#111, #113). **Werk:** ontwerp na de proef-app een uitbreiding voor eenvoudige owner-scoped resources: migratie en RLS-tests, strict
  contracten, permissies, lijst/detail/aanmaken/wijzigen/verwijderen, query-hooks, formulieren en ConfirmDialog, met het gedeelde lijstpatroon
  en het cursor-contract. Documenteer welke relaties en bijzondere mutaties handwerk vragen; behoud spec-eerst, dry-run, weigering om te
  overschrijven en rollback bij mislukte generatie. **Afhankelijkheden:** ST-09, lijstpatroon, ADR 0047, retention uit ST-05.
  **Klaar als:** een gegenereerde fixture-resource werkt door alle lagen tegen de echte stack; isolatie, verboden rollen, validatie, paginering
  en destructieve acties getest; generatie haalt gates en build; dry-run toont alle schrijfdoelen, ook de route-tree; een mislukking laat geen
  half gegenereerde resource achter.
  terug als: ST-09 klaar is
- [ ] **ST-07 (P1) — schermpatronen en design-system, rest.** Lijstpatroon (#92, #114) en toasts (#129) zijn gebouwd. **Werk:** leg herbruikbare
  recepten vast voor lijst/detail/formulier, empty/loading/error/forbidden, bevestigen en succes-/foutfeedback; inventariseer ontbrekende
  componentvarianten uit de proef-app; behoud documenttitel- en focusgedrag bij nieuwe AppShell-mounts. **Afhankelijkheden:** ConfirmDialog;
  concrete behoeften uit ST-09. **Klaar als:** patronen in catalogus en voorbeelden; keyboard, focus en aria-live inhoudelijk getest; axe op 375
  en 1280 px zonder uitzonderingen; geen dubbele mutatie bij busy-state; ConfirmDialog documenteert retries na fouten; app-varianten vragen geen
  core-wijziging.
  terug als: ST-09 ontbrekende patronen heeft vastgelegd
- [ ] **ST-08 (P1) — monitoring en foutdiagnose** (fase 2: clientfouten naar een eigen tabel met allowlist-velden, geen PII, 5 min dedupe en
  build-SHA, framework §6). **Werk:** verbind serverfouten, clientfouten, build-SHA en request-ID; definieer signalen voor readiness-uitval,
  foutpercentage, jobachterstand en mislukte verzending, met per signaal drempel, verantwoordelijke en herstelactie in het app-runbook na
  eigenaarbesluit. Core levert contracten en uitbreidingspunten; de app kiest bij release monitor en alarmering. **Afhankelijkheden:** ST-03 en
  ST-05 voor jobstatus en retention, ST-12 voor buildidentiteit; spec voor clientfouten. **Klaar als:** een geforceerde fout is traceerbaar zonder
  PII, tokens, body of query; dedupe en opruimen getest; een alert en herstel zijn in staging bewezen. Geen telemetry-provider verplicht in core.
  terug als: de eerste app naar staging gaat
- [ ] **ST-11 (P2) — notificaties en storage (optioneel).** Notificaties: registratiecontract voor berichtsoorten, ontvangers en autorisatie,
  voorkeuren en kanalen, met hergebruik van mail-layout en outbox; in-app inbox en push vragen eigen specs. Storage: provider-neutrale grens
  voor uploads en downloads met owner-controle, toegestane typen en grootte, korte signed-URL-geldigheid, metadata en opruimen van verweesde
  bestanden; geen provider-SDK in de browser. **Afhankelijkheden:** concrete appbeslissing; ST-03, ST-05; provider-ADR; dependencygoedkeuring.
  **Klaar als:** ontvangstrechten en voorkeuren getest; herhaalde jobs veroorzaken geen dubbele inboxregels; twee gebruikers benaderen elkaars
  bestanden niet; verlopen links en ongeldige uploads geweigerd; accountverwijdering en retention behandelen bestanden. Zonder activering voegt het
  geen service of runtimeverplichting toe.
  terug als: een concrete app notificaties of bestanden nodig heeft
- [ ] **ST-12 (P2) — templateversies en upgradecontrole** (stuk 6 template-versie; ADR 0040). Nu: `CHANGELOG.md` met "Bij een update"-notities en
  `scripts/kit/app-init.mjs` die de template-SHA vastlegt; nog geen tags of versieschema. **Werk:** onderscheid releaseversie, opgenomen
  templatecommit en app-build-SHA; leg herkomst vast bij app-init en update; upgrade-notities bij breaking changes, migraties, instellingen en
  handstappen; een adviserende controle op core/app-grens en ontbrekende stappen die niets automatisch wijzigt en de mergeprocedure niet vervangt.
  **Afhankelijkheden:** ST-09; eigenaarbesluit over versieschema; spec voor het healthcontract. **Klaar als:** app-init legt de juiste herkomst vast;
  een update wijzigt die controleerbaar; een fixture detecteert een ontbrekende upgradevoorwaarde; buildmetadata komt overeen met het gebouwde
  commit; een app kan een template-update reviewen zonder core-code te kopiëren.
  terug als: de eerste template-update (ST-09) gedaan is
- [ ] **ST-13 (P2) — SaaS- en PWA-pakketten (optioneel).** Documenteer activeringsgrenzen en een aparte ADR of spec per pakket. SaaS: workspace of
  tenant, lidmaatschap en rollen; abonnement of betaling alleen bij concrete behoefte. PWA: manifest, installatie, veilige updateflow en alleen
  afgesproken offlinegedrag; push apart van installatie. Kies geen billing-, push- of hostingprovider. **Klaar als:** het pakket is weglaatbaar
  en voegt zonder activatie geen tabellen, dependencies of externe dienst toe; SaaS-tests bewijzen tenant-isolatie over API én database;
  PWA-tests bewijzen updates en uitloggen zonder achterblijvende privé-cache.
  terug als: de eigenaar een concrete app en pakket kiest
- [ ] **Feature flags, onderhoudsmodus en waarschuwing bij niet-opgeslagen formulieren.** Niet in de basis (besluit eigenaar 2026-10-10).
  terug als: een app het nodig heeft
- [ ] **sonarjs, better-tailwindcss en squawk** (stuk 4): de eerste twee vragen een nieuwe dependency, squawk een nieuwe tool (voor `gate:slow`).
  terug als: een fout die deze tool had gevangen doorglipt, of de proef-app toont dat ze nodig zijn
- [ ] **ADR 0030 PR 2: algemene agent-merge** (voor de framework-lane; de feature-lane volgt ADR 0046 punt 30). Zie `.claude/skills/opleveren/SKILL.md`
  en `docs/operations/agent-doorloop.md`.
  terug als: er ≥ 10 feature-PR's zijn zonder gevolgfout, de AC→test-check en het risico-overzicht actief zijn en ST-01 is besloten

## Besluiten

Een ADR met status `voorgesteld` is geen besluit; afvinken gebeurt pas als de eigenaar hem accepteert.
Geldende ADR-besluiten staan in `node scripts/kit/feiten.mjs adr`; afgevinkte besluititems, ook eigenaarbesluiten zonder ADR, staan in [het archief](roadmap-archief.md).

- [ ] **Herziening van ADR 0018–0022 en 0024 en de specs onder mandaat** (`accountbeheer-uitbreiding`, `eigen-account`, `rate-limit`, `lijstpagina`):
  geaccepteerd door de agent onder mandaat, "ter herziening" door de eigenaar. Open eigenaarbesluit; de agent beslist niet. Dit omvat ook ADR 0020
  (achtergrondtaken: runner in het API-proces, eigen rol `app_jobs`, outbox zonder token), ADR 0021 (audit log, aanbevelingen OV-1..7) en ADR 0022
  (AVG, aanbevelingen OV-1..7); gebouwd is audit (#128), rate limiting en readiness. Bron: `docs/reviews/2026-10-12-werkstraat.md`.
- [ ] Ontwikkelplatform: alleen Ubuntu/WSL2, of ook macOS (sandbox, `scripts/bootstrap.sh`, `scripts/doctor.sh`). Eigenaarbesluit.
- [ ] ST-01 (GitHub App en bescherming) besluiten: voorwaarde voor ADR 0030 PR 2; zie Volgende.

## Gebouwd

Afgevinkte items per fase en stuk, met hun bewijs en de **Klaar als**-criteria: [roadmap-archief.md](roadmap-archief.md).
Nog open uit een stuk dat verder gebouwd is (3c en 3e):

- [ ] UI-kit: tabel, tabs, galerij, filterbalk en carousel (#156, spec `docs/specs/ui-data-display.md`); in `check:catalogus` en op `/design-system`
- [ ] Laatste geslaagde login en afzonderlijke deactivatie met herstel, naast blokkeren
      (spec `accountstatus-en-laatste-login`, ADR 0052)
