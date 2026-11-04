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
  aanleiding: #321 (reproduceerbare nulmeting van leerpunten in het ST-09-protocol)
  aanleiding: #319 (playbooklijst van verplichte checks gelijk aan de rulesetpayload)
  aanleiding: #338 (controle vóór branchwissels die beschermde sandboxpaden kunnen raken)
  aanleiding: #329 (diagnose van pnpm-startproblemen en blokkerende werkmapbestanden; dependencycontrole vóór run/exec)
  aanleiding: #327 (padparameters, voor-stappen en gecombineerde foutgevallen expliciet in specs en spec-review)
  aanleiding: #320 (meetdefinities voor permissievragen, modi en voorlopige weigeringstellingen)
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
  aanleiding: `docs/adr/archief/0029-snellere-beslisroute.md` (punt 1–7). Gebouwd in #199: `scripts/kit/lane.mjs`, `_mini.md`, `sjabloon: mini` in `check-docs`, statuscommit-controle (a)–(c).
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
  Gedaan: eenmalige TOTP-code en e-maillink, geen sessietoken in JSON (spec `inloggat-dichten`, ADR 0075; bewijs `test/auth/eenmalig.int.test.ts`, `db/tests/one_time_use.sql`).
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
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): `startJobs()` draait taken op interval vanuit `src/api/server.ts`, batch = één transactie met advisory lock; nul-schalende host: adapter roept `runJobsOnce()`; HTTP-cronpad alleen met hostgeheim, als §3-uitzondering (was R-JOB-01). `withJob()` gebruikt een eigen pool als rol `app_jobs` (`JOBS_DATABASE_URL`, execute alleen klasse `job`, niets op `better_auth`) (was in R-JOB-02). `app.mail_outbox`: RLS geforceerd, geen link of token in payload, foutcode zonder adressen; erin alleen via `app.enqueue_mail` (security definer, definer per mailsoort); at-least-once met lease, link pas bij verzenden (was R-JOB-03). `GET /api/ready` pingt ook als `app_jobs`, tenzij OV-C4 anders beslist (was in R-DEPLOY-01).
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
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): inzage `GET /api/me/export` (permissie `app.use`, alleen eigen data, andere actor gemaskeerd, geen sessietoken); de app registreert exporters via `createApp({ privacy })` die expliciet op eigenaar filteren (was R-PRIV-01). Verwijderen via `app.delete_account(id)`; de app registreert verwijderaars (was in R-PRIV-02). `app_definer` krijgt voor `app.delete_account` ook delete op `"user"`, `verification`, select `verification."value"` (was in R-DB-14).
  aanleiding: `docs/adr/0051-audit-log-en-avg.md`
- [ ] **ST-15 (P1) — externe koppelingen via één vast patroon** ([ADR 0077](adr/0077-externe-koppelingen-via-poorten.md)). Elke koppeling
  met een externe dienst volgt hetzelfde patroon: indelen op zes kenmerken (machtiging, richting, ritme, gevoeligheid, kosten en quota, bron van
  waarheid), elke waarde wijst naar een bouwsteen in core. Leverancierneutraal: template-code en -docs noemen geen bestaande dienst.
  **Werk, in deze volgorde (één onderwerp per PR):** uitgaande client op de ingebouwde `fetch` (verplichte time-out, begrensd herhalen, host-allowlist,
  schemacontrole, log zonder geheimen, weigert een aanroep in een transactie) met een lokale nep-partner als testhulp; foutcodes
  `UPSTREAM_UNAVAILABLE`, `UPSTREAM_TIMEOUT`, `UPSTREAM_INVALID` met teksten; `secret()`-schema voor geheimen in env; lintregels tegen netwerk
  buiten de client; register en schakelaar per koppeling (migratie: eigen besluit-PR); partnerstap in de route kit; vaste vorm per koppeling met
  contracttestsuite en check; skill `nieuwe-koppeling`, paragraaf "Koppeling" in het spec-template, hoofdstuk in het gouden pad en een sectie in de
  feiten. Na ST-03, elk met eigen besluit-PR: outbox en sync, machineroute en inbox, tokenkluis per gebruiker, beheerschermen.
  Gebouwd: uitgaande client, nep-partner en foutcodes (#515), `secret()` (#519), lintregels `rails/netwerk-api` en `rails/geheim` (#522, #523).
  **Afhankelijkheden:** ADR 0077; ST-03 voor schrijven, sync, terugbellen en tokens. Elke app-koppeling krijgt daarnaast één handmatige run tegen
  de testomgeving van de partner (ADR 0077 punt 6).
  **Klaar als:** een agent met alleen de skill deelt een fictieve partner in en schrijft een spec waarin elk kenmerk naar een bestaande bouwsteen
  wijst; een gebruiker zonder permissie of een admin zonder MFA bereikt de partner niet (nep-partner telt 0 aanroepen) en krijgt `FORBIDDEN` of
  `MFA_REQUIRED`, nooit een `UPSTREAM_*`-code; time-out, 5xx en een ongeldig antwoord geven een vaste `UPSTREAM_*`-code zonder tekst van de partner
  (de spec legt per status de code vast); een partner-time-out houdt geen databaseverbinding vast; `fetch`, `node:http(s)`, `undici` en `net`
  buiten de client falen in de lint, ook via `globalThis.fetch` en een dynamische import; een uitgezette koppeling doet geen aanroep.
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): de client weigert ook in een transactie van `withJob` (aanvulling R-CODE-12); de machineroute
  zonder login onder één vast prefix met verifier, tijdvenster, groottegrens, rate limit per IP en inbox, en een check die elke route buiten
  `defineRoute` en buiten de lijst van §3 laat falen (uitzondering naast R-UIT-02, §3); foutvolgorde van de partnerstap: `FORBIDDEN`,
  `MFA_REQUIRED` en `NOT_FOUND` vóór elke `UPSTREAM_*`-fout; een route met partnerstap gebruikt `rateLimit: 'duur'`
  (aanvulling R-SEC-03).
  aanleiding: `docs/adr/0077-externe-koppelingen-via-poorten.md` (verzoek van de eigenaar, 3 en 4 november 2026)
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
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): `.github/settings/main-protection.json` en `scripts/check-github.mjs` volgen de ruleset van R-REPO-02 (was in R-REPO-02).
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
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): `check-release-ci` vóór én na de build: commit is kop van `main` met groene CI, productie ook staging; `check-deployment-schema`: productieschema dekt code; beide falen dicht (was in R-REL-02). Met CAPTCHA krijgen `script-src` en `frame-src` het CAPTCHA-domein (was in R-SEC-04).
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (B-6: niet geparkeerd besloten)
- [x] **ADR 0029 stap 7: agent-merge van niet-kritiek werk** (#448; ADR 0069, vervangt ADR 0046 punt 30; onder het account van de eigenaar).
  Spec: `docs/specs/agent-merge-niet-kritiek.md` (de oude spec `agent-merge` is vervallen): oordeel `agent-merge` in de diff-guard,
  job in `guard.yml`, `pnpm pr:merge`, rolhek en `merge: "niet-kritiek"` in `.claude/gates.json`. Herzien (#456, #460, #464):
  Codex-voorwaarde `"indien-aanwezig"` en omvanggrens `agentMerge.maxRegels`, spec `docs/specs/agent-merge-zonder-codex.md`.
  Herzien (#468, #476, #483): een 👀 of lopende Codex-review laat `pr:merge` wachten, spec `docs/specs/agent-merge-codex-wachten.md`.
  aanleiding: `docs/adr/0069-agent-merge-niet-kritiek.md`
- [x] **Volledig pad naar `gh` in het rolhek** (V-13): `/usr/bin/gh pr merge …` viel buiten het rolhek (`program === "gh"`) en de settings-patronen.
  Weigeringen en schrijfdoelen kijken nu naar de naam zonder pad (`programName` in `rails/hooks/lib/shell.mjs`), ook voor `git`, `rm` en `sed`;
  bewijs `test/hooks/rolhek-volledig-pad.test.ts`. De `deny`-patronen in `.claude/settings.json` vangen de vorm met pad niet (gemak, geen grens; framework §8).
  Niet in deze klasse gedicht: omhulsels met opties (`sudo -u x gh …`, `env -i gh …`) en omhulsels buiten de lijst (`timeout`, `xargs`);
  expansie (`$GH`, `bash -c`) is werk van de diff-guard. Ook open, voor de reviewer: `reviewerMay` negeert voorafgaande variabelen
  (`GIT_PAGER=…`, `PATH=…`) en opties als `git diff --output=<bestand>`.
  aanleiding: `rails/hooks/lib/rolhek.mjs` (spec `agent-merge`, Bekende gaten; vervallen, nu `docs/specs/agent-merge-niet-kritiek.md`)
- [x] **Schrijven via een programma buiten `fileTargets` omzeilt het rolhek.** `writeTargets` in `rails/hooks/lib/shell.mjs` kent alleen een
  vaste lijst (redirect, `tee`, `sed -i`, `cp`, `git checkout` …). Een script via `python3`, `node -e` of een heredoc naar zo'n interpreter
  (`python3 - <<EOF`), en ook `patch`, `git apply`, `curl -o`, `tar x` of `prettier --write`, schrijft beschermde paden zonder de
  beslissing (ask, deny of melding) die een Edit op hetzelfde pad krijgt; een redirect (`cat > f <<EOF`) ziet het rolhek wel. Eerst kiezen
  tussen weigeren en melden; de diff-guard in CI blijft de grens. Voor subagents gedekt door de toets op effect (ADR 0066, spec
  rolhek-effect): elk pad dat een Bash-commando echt veranderde, krijgt de beslissing van een Edit; bewijs `test/hooks/rolhek-effect.test.ts`.
  Open voor de hoofdsessie (spec rolhek-effect OV-1).
  aanleiding: #260 (eigenaarbesluit: als item opnemen; de developer schreef `.claude/**`, `.github/**`, `scripts/**` en `rails/**` via een Python-script, de reviewer zag alleen ADR-nummerwijzigingen)
- [ ] **Omhulsels met opties en xargs-optiewaarden in het rolhek.** `splitCommand` (`rails/hooks/lib/shell.mjs`) stopt bij de eerste optie van een
  omhulsel en kent `setsid`, `timeout` en `stdbuf` niet, zodat `env -i gh …`, `nice -n 1 gh …` en `timeout 9 gh …` voor de hoofdsessie de regels voor
  het label, `@file`/`--input` en `gh alias` ontlopen; `xargsCall` (`rails/hooks/lib/rolhek.mjs`) leest bij een long option of een cluster met waarde
  (`--arg-file F`, `-0a F`, `-rn 1`) de optiewaarde als commandowoord. Opties van omhulsels overslaan en die xargs-vormen lezen, met tests per vorm;
  `coreutils --coreutils-prog=env` hoort bij dezelfde klasse, net als een gh-vlag tussen `pr` en `review` (`gh pr -b x review 1 --comment`): `ghForbidden` leest groep en actie positioneel in plaats van via `ghCommandWords`.
  aanleiding: `rails/hooks/lib/rolhek.mjs` (delta-review ronde 2 van fix/rolhek-gh-allowlist)
- [ ] **Bekende gaten in het rolhek (R-ROL-10: vangnet, geen grens).** Het rolhek ziet niet: scripts in de repo, `node -e` en andere
  interpreters; voor de hoofdsessie `curl -K`, een kopie van `gh` onder een andere naam en `node_modules/.bin`; `find -exec`/`-execdir`/`-ok`;
  globs in paden (`rm src/api/routes/*.test.ts`, `sed -i … docs/adr/archief/0*.md`); symlinks en hardlinks (`ln -s test t && rm -rf t/`, `cp -l`);
  `git checkout <ref> <pad>` zonder `--`; `git -c core.pager=<cmd>` en andere `-c`-instellingen die een programma starten; `git -C <map>` en `cd x && …` binnen één commando (paden tellen vanaf de cwd van de payload); awk met `-f`, een variabel doel, `system()` of
  `| "cmd"`, afgekorte lange gawk-opties (`--sour=`, `--fi=`, `--incl=`; één helper voor afkortingen van lange opties in `shell.mjs`) en
  awk-uitvoer via opties (`-o`/`--pretty-print=f`, `-d`/`--dump-variables=f`); `git restore <map>` en `git checkout -- <map>` voor een
  lokaal ontbrekende map (de map-regel kijkt naar `isDir`, niet naar getrackte bestanden eronder). Het schrijfdeel van deze gaten (interpreters,
  scripts, globs, links, `git checkout <ref> <pad>`, `git -C`, awk-uitvoer) valt voor subagents onder de toets op effect (spec rolhek-effect); dit item
  blijft voor de hoofdsessie en voor wat niet schrijft (een programma starten, gh-aanroepen). Omhulsels met opties en xargs-optiewaarden staan in het item hierboven. Per gat kiezen tussen weigeren en melden, met tests.
  aanleiding: `rails/hooks/lib/shell.mjs` (review van PR 6a `fix/rolhek-gaten`; eigenaarbesluit 2026-11-01: de lijst bekende gaten uit R-ROL-10 naar de roadmap)
- [ ] **Vervolg compacte kennisbasis (V1–V5 en restpunten).** Het regelboek, de instructies, het rolhek, de afschaffing van taakmandaat en
  gate-label en het ADR-archief zijn gebouwd (#385–#404); wat resteert, elk als eigen kleine PR met eigenaarreview:
  (V1) Vervalt bewust: pnpm `run`/`exec` werken in de sandbox; alleen commando's die de store-index openen (`install`, `list`, `why`) falen, en een schrijfbare globale store is verboden (ADR 0061 punt 4, bewaakt door `test/rails/claude-sandbox-werkstraat.test.ts`: de store hardlinkt naar alle projecten). De eigenaar draait een zeldzame `pnpm install` buiten de sandbox.
  (V2–V4) Gebouwd: kerncijfers per PR met `pnpm meting --pr-tabel` en de bytes van het leespad met `pnpm leespad` (#406, #414), SessionStart zonder specslijst (#413) en de
  checklists per risicoklasse met de werkwijze één volledige review plus verschil in `docs/operations/review-checklists.md`. (V5) Niet uitgevoerd (besluit na onderzoek):
  het specsjabloon is ~2 KB en tests pinnen het (regel 2, de koppen van het skelet van `pnpm new:resource`), dus een herschrijving levert te weinig op. Het doel voor het
  leespad van een nieuwe feature blijft ≤ 25 KB; nu is het 74 KB met het hele `docs/framework.md` (40 KB), effectief ~46 KB als een agent alleen §8 (~11 KB) leest.
  Verder omlaag kan met `docs/gouden-pad.md` (11 KB) en `docs/dod.md` (7 KB) per onderdeel laden.
  Restpunten: een hint "werk de branch bij" bij `trusted`/`working` in `rails/hooks/lib/werkstraat.mjs`; de RegExp buiten de lus in
  `scripts/kit/check-roadmap.mjs` (rond regel 105); `docs/operations/agent-doorloop.md` inkorten (nu ~40 KB, doel ≤ 12 KB, overgangs- en
  correctieprocedures naar `docs/template/`); `check-docs` laten toetsen dat de R-regels in `.claude/rules/*` woordelijk gelijk zijn aan `docs/framework.md`;
  de fasekeuze voor Fase 0/1 uit `docs/dod.md` halen (bouwfasen van de template); `docs/adr/0039-lokale-gate-hergebruik.md` (vervallen) archiveren
  of laten staan (nummer 0039 is gedeeld, AC-3); de links in `docs/specs/achtergrondtaken.md` en `docs/specs/mail-outbox.md` naar het archief
  zetten (hun budgetvermelding in `.kit/baseline.json` is weg sinds ADR 0065); leerpunten #393, #395, #399, #401, #402, #409, #410 en #411 oppakken.
  Voor de eigenaar zelf (beschermde bestanden): `.claude/decisions.json` leegmaken (`decisions: []`), in `.claude/settings.json` de labelregel
  (`--add-label*gate-wijziging*`), de bewerkweigering op `decisions.json` en de verouderde allow voor `chore/mandate-adr-statusregel` weghalen,
  `gateMarker` uit `.claude/gates.json`, en de release-reset bij v1.0 (#384).
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): alleen-templatedocs komen in `docs/template/` (was in R-CI-06).
  aanleiding: #404 (laatste PR van het traject; plan en eigenaarbesluiten staan in #385, #394 en #400)
- [ ] **Geclaimde checks die niet bestaan** (R-DOC-02). Het regelboek eiste ze, maar geen check dwingt ze af: het verschil in aantal
  `unsafeCast` op de PR ("CI zet het verschil in aantal op de PR", was in R-CODE-04, tot de bouw alleen hier; nu alleen een vinkje in `.github/pull_request_template.md`), en de lintregels op een route zonder
  `can()`-guard, op store-libraries en op `.isLoading`/`.isError` in `features/` (R-WEB-01, R-WEB-04; het oude framework noemde ze als
  afgedwongen, `eslint.config.js` heeft ze niet). Per check bouwen met falende fixtures, of de regel met eigenaarakkoord als proza laten staan.
  aanleiding: verliescontrole van het regelboek na #385–#404 (eigenaarvraag 2026-11-02; herstel-PR van de normen)
- [ ] **Bewaartermijn van gemeten data** (ADR 0064 punt 7). De meetbestanden in `<git common dir>/agent-meting/` groeien zonder grens en
  `pnpm meting` leest ze allemaal (ook `--trend`, voor de reviewrondes); een bewaartermijn en een lees-actie die alleen de gevraagde
  sessies of branches leest, met een volumetest zoals `test/rails/meting-volume.test.ts`.
  aanleiding: `docs/adr/0064-leesbudget-per-laag.md` punt 7 en `docs/specs/leesbudget.md` AC-8 ("zonder de bewaartermijn van metingen: een roadmap-item")
- [ ] **Krimp van bindende documenten in stappen onder 20 %** (R-DOC-02). `check-docs` vangt krimp boven 20 % en 1 KB per PR tegen
  `git merge-base origin/main HEAD` (`scripts/kit/leesbudget.mjs`); een reeks PR's die elk minder krimpt, valt erdoorheen. Bijvoorbeeld een
  cumulatieve meting over de laatste twintig gemergde PR's naast `pnpm meting --trend`, of een norm-telling (R-id's) in plaats van bytes.
  aanleiding: `docs/specs/leesbudget.md`, randgeval "Krimp in stappen onder 20 %" (bekend gat, ADR 0065 punt 6)
- [ ] **Regelboek zonder niet-gebouwde onderdelen als check** (R-DOC-10). `check-docs` regel 9 laat achter een niet-bestaand pad
  `(nog niet gebouwd)` toe; daarmee kan een clausule over een niet-gebouwd onderdeel terugkomen. Aanscherping: de markering alleen voor een
  doelmap die een gebouwde check al kent (nu alleen `docs/template/specs/` in R-CI-06), elders rood; plus een melding voor een functie of
  tabel in backticks die in `src/`, `db/` en `scripts/` niet voorkomt. Eerst een spec (de AC's van `compacte-kennisbasis-rails` pinnen regel 9).
  aanleiding: `scripts/kit/check-docs.mjs` (regel 9; review 2026-11-03, bevinding P5: 17 regels bonden iets dat niet bestond)
- [ ] **ESLint-onderdrukkingen afbouwen tot nul** (R-CI-02, spec onderdrukkingen-ratchet). Geen paar (bestand, lintregel) mag stijgen (`pnpm ratchet`,
  strikt) en `pnpm ratchet` meldt per PR de stand en de onderdrukkingen in de bestanden die de PR raakt. Stand bij de bouw en doel per lintregel:
  `rails/afwezigheid` 89 in 46 bestanden → 0 en `rails/negatieve-tabel` 51 in 29 bestanden → 0, elk in een eigen PR per testmap (`test/rails`,
  `test/scripts`, `test/hooks`, de rest), want het herschrijven is mechanisch; `complexity` 30 in 16 bestanden → 0, per bestand in de PR die het
  raakt, `rails/hooks/lib/rolhek.mjs` (10) samen met het krimpen van het rolhek; `max-params` 3 en
  `@typescript-eslint/no-unnecessary-type-parameters` 1 → 0 in één kleine PR. Een onderdrukking die echt nodig blijft, krijgt een eigen
  eigenaarbesluit met reden. **Klaar als:** `eslint-suppressions.json` is leeg en `pnpm lint:prune` verandert niets.
  aanleiding: `eslint-suppressions.json` (review 2026-11-03, bevinding P5: 123 onderdrukkingen zonder doel, een dag later 174)

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
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): fouttracking standaard in een eigen tabel via `reportClientError()`, externe dienst optioneel (was in R-PROV-01). De clientfouten-route wordt een data-route zonder login (naast de machineroute van ST-15): maximale grootte per melding, limiet per IP per minuut, geen onnodige vrije tekst; de bouw-PR zet hem als uitzondering terug in R-UIT-02 (was in R-UIT-02). `assert()` meldt in productie aan de fouttracking (was in R-CODE-04).
  terug als: de eerste app naar staging gaat
- [ ] **ST-11 (P2) — notificaties en storage (optioneel).** Notificaties: registratiecontract voor berichtsoorten, ontvangers en autorisatie,
  voorkeuren en kanalen, met hergebruik van mail-layout en outbox; in-app inbox en push vragen eigen specs. Storage: provider-neutrale grens
  voor uploads en downloads met owner-controle, toegestane typen en grootte, korte signed-URL-geldigheid, metadata en opruimen van verweesde
  bestanden; geen provider-SDK in de browser. **Afhankelijkheden:** concrete appbeslissing; ST-03, ST-05; provider-ADR; dependencygoedkeuring.
  **Klaar als:** ontvangstrechten en voorkeuren getest; herhaalde jobs veroorzaken geen dubbele inboxregels; twee gebruikers benaderen elkaars
  bestanden niet; verlopen links en ongeldige uploads geweigerd; accountverwijdering en retention behandelen bestanden. Zonder activering voegt het
  geen service of runtimeverplichting toe.
  **Eisen uit het regelboek** (R-DOC-10: tot de bouw staan ze hier; de bouw-PR zet ze terug in het regelboek): core levert poort `FileStorage` met contracttestsuite (was in R-OPSL-01, ADR 0060).
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
- [ ] **E-mailconnector en e-mailtemplates.** Nu heeft elke mail een eigen bestand op het basissjabloon (`src/core/api/mail/layout.ts`) en
  verstuurt core alleen via SMTP (`src/core/api/mail/smtp.ts`). **Werk:** een provider-neutrale poort voor uitgaande mail met SMTP als standaard
  en een adapter voor een HTTP-maildienst per app-ADR (bezorgbaarheid, bounces); een registratie van mailsoorten (onderwerp, variabelen,
  Nederlandse tekst) op het basissjabloon, met voorbeeldweergave in Mailpit en een snapshottest per mailsoort. **Afhankelijkheden:** ST-03
  (verzenden alleen via de outbox, ADR 0050); het algemene plan voor externe koppelingen (uitgaande client met rail, machineroute en inbox
  voor bounce- en klachtmeldingen, app-brede sleutel in env): de adapter bouwt geen eigen HTTP- of geheimenpad; provider-ADR en dependencyakkoord
  (R-PROV-01, R-SEC-06). Mailsoorten met een inloglink raken auth (R-AUTH-05, R-AUTH-06) en gaan via een besluit-PR.
  terug als: ST-03 gebouwd en het koppelingsplan besloten is, of een app meer dan de basismails nodig heeft
- [ ] **SSO-module.** Inloggen via een externe identiteitsprovider (OIDC eerst, SAML alleen op aanleiding), per organisatie in te schakelen;
  koppelen aan een bestaand account alleen op geverifieerd e-mailadres; rol-, MFA- en sessieregels blijven gelijk (R-AUTH-02, R-AUTH-03,
  R-AUTH-08); intrekken bij de provider sluit de toegang. **Afhankelijkheden:** kritiek pad, eerst besluit-PR met ADR: R-AUTH-01 staat nu
  alleen de plugins two-factor en magic link toe en ADR 0041 wees een externe OIDC-provider als standaard af; tenantmodel uit ST-13 als SSO per
  organisatie gaat; het clientgeheim van de provider in env via het koppelingsplan, niet in de database; dependencyakkoord (R-SEC-06); integratietests tegen een
  lokale provider (R-TEST-01). Bouwt een app het eerder, dan gaat dat als `leerpunt` naar de template en wordt het hier algemeen herbouwd
  (R-WERK-13).
  terug als: een concrete app zakelijke klanten met een eigen identiteitsprovider heeft
- [ ] **Feature flags, onderhoudsmodus en waarschuwing bij niet-opgeslagen formulieren.** Niet in de basis (besluit eigenaar 2026-10-10).
  terug als: een app het nodig heeft
- [ ] **sonarjs, better-tailwindcss en squawk** (stuk 4): de eerste twee vragen een nieuwe dependency, squawk een nieuwe tool (voor `gate:slow`).
  terug als: een fout die deze tool had gevangen doorglipt, of de proef-app toont dat ze nodig zijn
- [ ] **Uitbreidingen op aanleiding** (voorheen R-FASE-02; R-FASE-01), elk met zijn aanleiding:
  - bestanden (signed URL's) of realtime, met eigen ADR; terug als: de app ze nodig heeft
  - screenshot-regressie en axe in CI; terug als: een visuele of toegankelijkheidsfout doorglipt
  - jscpd, knip, ast-grep; terug als: review herhaaldelijk kopieën, dode code of een fout patroon vindt
  - mutation testing; terug als: er kritieke reken- of geldlogica is
  - Renovate automatisch mergen en OpenTelemetry; terug als: de basis stabiel draait
  - devcontainer of agent-sandbox in Docker; terug als: iemand meewerkt of agents zonder toestemmingsprompts draaien
  aanleiding: `docs/framework.md` §12 (R-FASE-01; één plek per norm, R-DOC-06)
- [ ] **ADR 0030 PR 2: algemene agent-merge** (voor de framework-lane). Voor niet-kritiek werk vervangen door ADR 0069
  (`docs/specs/agent-merge-niet-kritiek.md`); dit item gaat alleen nog over agent-merge van kritiek werk. Zie `.claude/skills/opleveren/SKILL.md`
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
