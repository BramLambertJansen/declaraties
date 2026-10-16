# Roadmap

Uitwerking van [framework.md](framework.md) §12: wat open staat, in welke volgorde en wat klaar is. De status staat in het
vinkje, de specstatus en het PR-nummer, nooit in een datum of in proza. Vink alleen af met bewijs (PR-nummer, testpad of checknaam;
`pnpm check:roadmap` dwingt het af). Eén plek per item: `ST-nn` is het label van een agenttaak uit de starter-beoordeling
(P0 noodzakelijk voor een veilige basis, P1 voor een herbruikbare en bewezen starter, P2 optioneel op aanleiding).
Indeling en volgorde volgen ADR 0029 en [de inventaris](reviews/2026-10-15-principes-inventaris.md).
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
  **Werk:** kies met de eigenaar één kleine echte app met een owner-scoped resource en een adminactie. Start via `docs/nieuwe-app.md`, bouw een
  complete verticale flow en registreer elke handmatige stap, onduidelijke instructie, ontbrekende component en core-aanpassing; houd het
  app-domein buiten deze template. Neem daarna één echte template-update over (`git merge template/main`) via een PR (ADR 0006).
  Wat terugkomt wordt een regel of script in de template.
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

- [ ] **ADR 0029 bouw: feature-lane en mini-spec** (punt 1–3, 7). Lane-herkenning in `check-document-status`, `docs/specs/_mini.md`, het
  frontmatterveld `sjabloon: mini` in `check-docs`, "Besluit en taakscope voorbereiden" in `docs/operations/agent-doorloop.md`; fixtures in `test/rails/`.
  aanleiding: `docs/adr/0029-snellere-beslisroute.md` (punt 1–7)
- [ ] **ADR 0031 PR 2: documentstatus als verplichte check.** `check-document-status` draait als stap in de niet-verplichte job `diff-guard`
  (`.github/workflows/guard.yml`) en staat niet in `requiredChecks` van `.claude/decisions.json`; `pnpm pr:verify` kan dus groen melden bij een
  rode documentstatus. Dat is een fout in een rail (P2), geen meta-werk. Na PR 2 eist `gebouwd` een extra check (ADR 0031, "Gevolg voor gebouwd").
  aanleiding: `docs/operations/agent-doorloop.md` (besluit 2 van de inventaris)
- [ ] **Toast: pauze bij hover en focus, fout blijft staan** (WCAG 2.2.1), plus een eigenaarbesluit over de duur (nu 5 s en 8 s, een aanname).
  Toegankelijkheidsfout in de bestaande `Toaster` (`src/core/web/ui/toast.test.tsx`).
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (besluit 2)
- [ ] **Toast: dubbele aankondiging in NVDA** (`role` binnen een `aria-live`-container); herstel met een test.
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (besluit 2)
- [ ] **Focus naar de h1 na een routewissel naar een lazy route** (`/design-system`): in e2e (Vite dev) staat de focus daarna op `body`.
  Geprobeerd: `routeKey` uit `resolvedLocation`, wachten op een (zichtbare) h1 met een MutationObserver, en terugzetten als de focus
  verloren gaat. Vermoeden: pending-weergave of het laden van de chunk duurt langer dan `HEADING_WAIT_MS` (2 s), of het pad naar
  `resolvedLocation` loopt anders. Eerst reproduceren met een trace (`pnpm ui:check`), dan pas repareren (stuk 3f).
  aanleiding: `src/core/web/ui/app-shell.test.tsx` (bekende fout, geen capability)
- [ ] **ST-02 (P0) — accountbeheer en herstel afmaken** (stuk 3e; bestaande accountbeheer-specs). Open: TOTP-backupcodes (zodat een admin
  zonder telefoon niet alleen via `admin:create` terugkomt), een openstaande uitnodiging intrekken (opnieuw versturen bestaat al:
  `reinviteRoute`) en een admin-resetlink ("wachtwoord vergeten" blijft dicht, ADR 0013). Elk deel eerst een spec.
  **Werk:** specificeer herauthenticatie, sessie-intrekking, tokenverval, oude/nieuwe adresbevestiging en herstel zonder rolpromotie;
  koppel audit en mail aan ST-04 en ST-03 en kopieer geen synchroon mailpad als de outbox de geldende route wordt.
  **Afhankelijkheden:** ADR 0013; audit voor admin-acties; relevante stappen uit ADR 0020.
  **Klaar als:** echte-stack e2e per flow; verboden rol en admin zonder MFA geweigerd; laatste-admin-racetest; herstelcode eenmalig, ook bij
  parallel gebruik; ingetrokken of verlopen links werken niet. Elk deel krijgt afzonderlijk bewijs.
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (B-11)
- [ ] **ST-04 (P0) — audit: vervolg** (ADR 0021, spec audit-log). Gebouwd in #128: migratie, `ctx.audit`, invite/reinvite. Open: `/admin/audit`
  (eigen spec) en audit voor de routes revoke en reset-link (met ST-02).
  **Werk:** servergegenereerde request-ID, audit in de transactie, append-only-tabel met vaste grants en policies, getypte strict gevalideerde
  details (geen willekeurige payloads, e-mailadressen of vrije tekst), aparte core-auditwriter voor Better Auth-acties.
  **Klaar als:** audit wordt met de actie teruggedraaid; verboden schrijver en lezer geweigerd; auditdetails falen buiten de allowlist;
  een vervalste client-request-ID wordt niet gebruikt.
  aanleiding: #128
- [ ] **ST-03 (P0) — achtergrondtaken: runner, opruimen en mail-outbox** (stuk 7; [ADR 0020](adr/0020-achtergrondtaken.md): runner in het API-proces,
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
  aanleiding: `docs/adr/0020-achtergrondtaken.md`
- [ ] **ST-05 (P0) — AVG: privacymechanisme, export en verwijderen** ([ADR 0022](adr/0022-avg.md), ter herziening). Mechanisme in core, inhoud per app.
  **Werk:** bewaarcatalogus, FK-invarianten, eigen export, admin-verwijdering en app-registratie van exporters en erasers, in de volgorde van
  ADR 0020. Accountverwijdering en audit blijven in één transactie (geen tweede verbinding op dezelfde laatste-admin-lock). Exporters filteren
  expliciet op eigenaar, ook als RLS gedeelde data toelaat. Valideer bewaartermijnen en retention-kolommen; catalogusregistratie ook in de
  generator; lever het privacyregister-sjabloon (juridische inhoud en back-uptermijnen blijven per app).
  **Afhankelijkheden:** audit, bewaarcatalogus en outbox (ADR 0020); goedgekeurde export- en verwijderspecs.
  **Klaar als:** gedeelde data van anderen ontbreekt in de export; accountverwijdering ruimt ook tokens en outbox op; laatste-admin en
  eigen-admin-verwijdering geweigerd; terugrollen herstelt actie en audit samen; negatieve pgTAP-fixtures voor cascades, nullable SET NULL en
  catalogusregistratie; een app-exporter en -eraser werkt zonder core-aanpassing. Retention is techniek, geen claim van AVG-conformiteit.
  aanleiding: `docs/adr/0022-avg.md`
- [ ] **ST-01 (P0) — GitHub-bescherming daadwerkelijk activeren** (stuk 6, diff-guard uit stuk 4). Een agent kan beschermd werk niet zonder de
  juiste eigenaarreview samenvoegen. Gebouwd: `scripts/github-ruleset.sh` met `test/scripts/github-ruleset.test.ts` (#104), de diff-guard met
  `guard.yml` (#62, ADR 0017; nog niet verplicht, uitslag `overgang` zolang de auteur zelf goedkeurder is) en CODEOWNERS en PR-template.
  Open: organisatie, GitHub App voor de agent, org-ruleset via custom property en Actions-instellingen (daarna code-owner-review en 1 goedkeuring
  aan; private repo's vragen Pro/Team); `.github/settings/` met `scripts/check-github.mjs` (alleen-lezend, een onleesbare instelling is een fout;
  ook `app_id` van verplichte checks, `enforce_admins`, conversation resolution) en `check-spec-approval`; `docs/operations/rails-checklist.md` met
  per stuk bewijs; pushen met een kortlevend App-token zonder het eigenaar-token in de agentomgeving, daarna `denyRead` op `~/.config/gh`;
  de diff-guard verplicht bij de overstap op de App, met goedkeuring op exact de head-SHA die niet van de auteur is (framework §10). Onderscheid de overgang onder het eigenaaraccount van de definitieve App-opzet; de eigenaar
  activeert organisatie, App en instellingen.
  **Afhankelijkheden:** ADR 0005, 0006, 0011 en 0017; beschikbaarheid van de vereiste CI-checks.
  **Klaar als:** negatieve fixtures voor ontbrekende of bypassbare instellingen; bewijs dat een directe push naar main wordt geweigerd en een
  bot-PR zonder vereiste review niet mergebaar is. Geen actieve bescherming claimen op basis van alleen JSON-bestanden. Voorwaarde voor ADR 0030 PR 2.
  aanleiding: `scripts/github-ruleset.sh`
- [ ] **Versie en build-SHA** (stuk 3f) in `GET /api/health` en onderaan in de app (publieke buildmetadata, geen secrets); vraagt een spec
  voor de healthcontractwijziging. De versiestrategie zelf hoort bij ST-12 (Geparkeerd).
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (B-11)
- [ ] **`/.well-known/security.txt` en `LICENSE`** (eigendom, geen open-source-licentie): beide wachten op een waarde van de eigenaar
  (contactadres per app; licentietekst).
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (B-11)
- [ ] **`.claude/settings.json` bewezen** (stuk 5): de sandbox start op Ubuntu/WSL2 (bubblewrap, socat) en de deny-regels zijn getest, ook
  `Read(!.env.example)` en `cat .env`.
  aanleiding: `.claude/settings.json` (onbewezen sinds stuk 5; `test/rails/sandbox-settings.test.ts` dekt de spiegel, niet de sandbox)
- [ ] **`gate:fast` definitief** (stuk 4): vastleggen welke checks de definitieve `gate:fast` bevat (nu een groeiende lijst in `scripts/kit/gates.mjs`); `gate:slow` is gebouwd (#38), squawk staat onder Geparkeerd.
  aanleiding: `scripts/kit/gates.mjs`
- [ ] **`check-core`** (stuk 4; `.claude/rules/core.md` noemt hem nog niet gebouwd): een app wijzigt `src/core` niet. Met fixture die bewijst dat hij faalt.
  aanleiding: `.claude/rules/core.md`
- [ ] **Fout die in een app doorglipt wordt eerst een check of regel in de template** (met fixture), daarna gerepareerd in de app (fase 2; doorlopend, P5).
  aanleiding: `docs/adr/0029-snellere-beslisroute.md` (P5)
- [ ] **ST-10 (P1) — staging, release en aantoonbaar herstel** (fase 3, per app). Na een provider-ADR (`0100`+: hosting en beheerde Postgres met eigen
  rollen) een adapter in `deploy/<host>/`, gescheiden omgevingen, lektest via de pooler, rollen per omgeving via runbook, `check-deployment-schema` (faalt dicht, weigert preview
  tegen productie), `check-release-ci` vóór én na de build, beschermde production-approval, release-workflows en smoketest na deploy; headers/CSP op
  de host, CAPTCHA, PWA-manifest. Runbooks in `docs/operations/` (platform, back-up en herstel met acceptatietabel); beschrijf code-rollback,
  vooruitmigratie en verwijderde gegevens in back-ups. De eigenaar kiest beschikbaarheidsdoelen, RPO/RTO, regio en bewaartermijnen. **Afhankelijkheden:**
  providerbesluit, ST-01, ST-08, privacyregister. **Klaar als:** preview tegen productie faalt; vereiste CI en staging horen bij exact het
  releasecommit; de smoketest bewijst login, lezen en gesloten browser-datatoegang; een back-up is in een aparte omgeving teruggezet met gemeten
  dataverlies en hersteltijd. Productiegoedkeuring blijft bij de eigenaar.
  aanleiding: `docs/reviews/2026-10-15-principes-inventaris.md` (B-6: niet geparkeerd besloten)

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
  overschrijven en rollback bij mislukte generatie. **Afhankelijkheden:** ST-09, lijstpatroon, ADR 0016, retention uit ST-05.
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
- [ ] **ST-12 (P2) — templateversies en upgradecontrole** (stuk 6 template-versie; ADR 0006). Nu: `CHANGELOG.md` met "Bij een update"-notities en
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
- [ ] **ADR 0030 PR 2: algemene agent-merge** (voor de framework-lane; de feature-lane volgt ADR 0029 punt 14). Zie `.claude/skills/opleveren/SKILL.md`
  en `docs/operations/agent-doorloop.md`.
  terug als: er ≥ 10 feature-PR's zijn zonder gevolgfout, de AC→test-check en het risico-overzicht actief zijn en ST-01 is besloten

## Besluiten

Een ADR met status `voorgesteld` is geen besluit; afvinken gebeurt pas als de eigenaar hem accepteert.

- [x] Provider-neutraal — ADR 0002
- [x] Auth in de API met Better Auth, sessiebeleid en MFA — ADR 0003
- [x] Postgres 17, rollen, dbmate, pgTAP — ADR 0004
- [x] Node 26, pnpm 11, TypeScript 6.0, GitHub App, toon van de regels — ADR 0005
- [x] App uit de template: koppeling, merge-commits voor updates, ADR-nummers, tussentijdse ruleset — ADR 0006
- [x] CSRF-controle en testmatrix — ADR 0007
- [x] Grens tussen core en app — ADR 0008
- [x] Tests buiten de sandbox: runner-container — ADR 0009
- [x] Schema `better_auth` — ADR 0010
- [x] Railwerk: rolhek, geteste hooks, ratchet, gate-register, feiten, vijf rollen, diff-guard — ADR 0011
- [x] Uitnodigen en MFA in Better Auth — ADR 0013
- [x] Datapad: `withUser()` met `pg`, transactie per request, Drizzle als `tx` — ADR 0012
- [x] Werkstraat tot de merge: reviewer vóór push en PR, stap Opleveren — ADR 0025 (WS-02, 03, 04a, 04b, 06 gebouwd, 04b: skill `opleveren`, bewijs `test/rails/opleveren-skill.test.ts`; open:
      WS-05 modelkeuze, zie `docs/reviews/2026-10-12-werkstraat.md`)
- [x] Account blokkeren: `blocked_at` in `better_auth`, schrijfrecht voor `app_definer`, sessies direct ingetrokken — ADR 0026 (gebouwd in #117)
- [x] Taal: alleen Nederlands, teksten in `src/web/copy` en `src/core/web/copy`; geen meertaligheid in de template (besluit eigenaar 2026-10-10)
- [x] Snellere beslisroute: principes P1–P7, lanes, meten; ADR 0023 vervangen door 0029 — ADR 0029 (#162; meethook en `pnpm meting` #163)
- [x] CI-lus tot groen en opleveren — ADR 0030 (PR 1: skill `opleveren`, #149); PR 2 staat onder Geparkeerd
- [x] Duidelijker diff-guard en `pnpm pr:verify` tijdens de overgang — ADR 0031 (PR 1 #154, PR 3 #155); PR 2 staat onder Volgende
- [x] Volledige UI-catalogus als bron voor agents en `/design-system` — ADR 0028 (`test/rails/catalogus-coverage.test.ts`)
- [ ] **Herziening van ADR 0018–0022 en 0024 en de specs onder mandaat** (`accountbeheer-uitbreiding`, `eigen-account`, `rate-limit`, `lijstpagina`):
  geaccepteerd door de agent onder mandaat, "ter herziening" door de eigenaar. Open eigenaarbesluit; de agent beslist niet. Dit omvat ook ADR 0020
  (achtergrondtaken: runner in het API-proces, eigen rol `app_jobs`, outbox zonder token), ADR 0021 (audit log, aanbevelingen OV-1..7) en ADR 0022
  (AVG, aanbevelingen OV-1..7); gebouwd is audit (#128), rate limiting en readiness. Bron: `docs/reviews/2026-10-12-werkstraat.md`.
- [ ] Ontwikkelplatform: alleen Ubuntu/WSL2, of ook macOS (sandbox, `scripts/bootstrap.sh`, `scripts/doctor.sh`). Eigenaarbesluit.
- [ ] ST-01 (GitHub App en bescherming) besluiten: voorwaarde voor ADR 0030 PR 2; zie Volgende.

## Gebouwd

Per fase en stuk; het bewijs staat bij elk item. Een **Klaar als** sluit een stuk af.

### Fase 0 — Bewijs

Bewijs: PR #11 (`pnpm test:db` door de eigenaar, 2026-10-09: Vitest 17/17, pgTAP 10/10; `pnpm dev` bij #9).

Eerst door de eigenaar op de eigen machine (de agent gebruikt geen Docker):
- [x] `docker compose --env-file .env.local up -d --build --wait`: image met pgTAP bouwt, `db/init` draait vóór "healthy"
- [x] Baseline-migratie draait als `app_migrator` met dbmate

Daarna (de PR mag het minimum uit stuk 1 meenemen dat hiervoor nodig is: `pg`, Vitest, tsconfig):
- [x] `withUser()` met `pg` in `src/core/api/db`: `SET LOCAL ROLE` + `set_config(…, true)`; lektest over parallelle requests, nul lekken;
      na elke request `current_user = session_user`; `api_user` ziet zonder `withUser()` niets
- [x] Dezelfde test via PgBouncer (transaction mode) als compose-profiel `pooler`
- [x] FORCE RLS: bewijzen dat `app_migrator` (geen superuser) onder RLS valt; `app_definer` ziet alleen rijen via een eigen policy
- [x] Meten: twee verbindingen per request (sessie + `withUser`), latency lokaal
- [x] Contract vastleggen: `Actor`, type van `tx` (pg of Drizzle), `testing.ts` voor geïnjecteerde transacties
      (vastgelegd in ADR 0012: `tx` wordt een Drizzle-transactie; de savepoint-variant van `testing.ts` bouwt stuk 3a)
- [x] Uitkomst in een ADR "Datapad" (volgende vrije nummer in `docs/adr/`)

Verplaatst naar fase 1, stuk 2 (heeft Better Auth nodig): `session_strength` via after-hook op 2FA-verificatie, `cookieCache` uit, intrekken werkt direct.

### Fase 1 — Fundament

Eén branch per stuk; een groot stuk mag in deel-PR's, een spec in een eigen PR ervoor. Een stuk is klaar als elk punt onder **Klaar als** met een
checkuitslag of testuitvoer in de PR staat. Core-onderdelen komen in `src/core/`, app-code en de referentie-feature in `src/{api,web,shared}`
(ADR 0008). Rails en test-infra komen vóór de code die ze bewaken.

- [x] ADR 0027: taakgebonden beschermde broncode, bewijsgebonden ADR/spec-statussen, documentatielabel en automatische runner/CI-opvolging
  (specs taakmandaat-frameworkwerk en taakmandaat-vervolg; #130, #144)

#### 1. Skelet, rails en test-infra

- [x] `mise.toml`, `.gitattributes`, `.editorconfig`, browserslist, `pnpm-workspace.yaml`, `.env.example` (bestanden staan er; nog niet in gebruik)
- [x] `docs/nieuwe-app.md`: setup-playbook voor Claude Code (machine → repo → koppeling → stack → databasebewijs)
- [x] `tsconfig` (flags uit framework §4), TypeScript `~6.0.3`; aliassen via `package.json` `imports`; hoe Node `server.ts` draait, bewezen met `pnpm dev` (#8, #9)
- [x] Vite + React in `src/web`, Hono in `src/api` met `src/api/server.ts`, Vite-proxy `/api`, headers/CSP in Vite; poorten via `WEB_PORT`/`API_PORT` (#8)
- [x] Eén publieke route `GET /api/health` (uitzondering in framework §3) en een pagina die hem toont via de client in `src/core/web/lib/api-client.ts` (#8; de pagina is vervallen in #29 zodra er een ingelogde startpagina was, framework §3)
- [x] ESLint 10 flat config: strictTypeChecked, `consistent-type-assertions: never`, `switch-exhaustiveness-check`; Prettier (#9)
- [x] Rails vooraf: dependency-cruiser (lagen, core → app verboden, geen cycles) en `no-restricted-imports`/`no-restricted-syntax`
      (elementen, `fetch`, env, `SET ROLE`, `set_config`, `hono` buiten core, niet-letterlijke `import()`) — elk met een fixture die bewijst dat hij faalt,
      ook voor bekende omzeilingen (alias, re-export, bracket-notatie) (#9: `test/rails/`)
- [x] Ratchet: `.kit/baseline.json` + `pnpm ratchet:update`, ESLint bulk-suppressions + `lint:prune`; faalt in beide richtingen (#9: `test/rails/ratchet.test.ts`)
- [x] Gate-register `scripts/kit/gates.mjs` en eerste `scripts/kit/feiten.mjs` (gates, ADR-statussen, volgende vrije migratie- en ADR-nummer) (#9)
- [x] Vitest-projecten `unit` en `int`; Playwright in `e2e/`; `pnpm test:db` (integratie + `pg_prove`) en `pnpm ui:check` in de runner-container van ADR 0009 (#9, #11)
- [x] `scripts/bootstrap.sh`, `scripts/doctor.sh` (versies, inotify, sandbox, Docker, jq, bubblewrap; `--quick` voor de SessionStart-hook) (#9)
- [x] dbmate en Betterleaks gepind in `mise.toml`; dbmate via script (#9)
- [x] `pnpm dev`: Docker-check, `.env.local`, `compose --env-file .env.local up --build --wait`, migraties, Hono + Vite (met headers/CSP) (#8, #9)
- [x] lefthook (pre-commit: format, lint op staged, Betterleaks; pre-push: `gate:fast`) (#9)
- [x] `gate:fast` (eerste versie: lint, typecheck, unit, dependency-cruiser) (#9; dependency-cruiser via `pnpm ratchet`)
- [x] `ci.yml` (`ubuntu-24.04`, mise-action, Actions op SHA, `permissions: read-all`, concurrency) met job `gate:fast` — het commit met
      `.github/workflows/` pusht de eigenaar (#12)

**Klaar als:** `pnpm gate:fast` groen (uitvoer); pre-commit houdt een commit met `any` of `as` tegen (uitvoer); elke fixture-test van de
rails groen (ook de omzeilingen); de ratchet-test bewijst beide richtingen; de isolatietest uit ADR 0009 groen; CI-job `gate:fast` groen op de PR;
de eigenaar bevestigt dat `pnpm dev` op een verse machine de pagina met `/api/health` toont.

#### 2. Auth

Spec eerst (migraties en routes).
- [x] Better Auth (gepind) in `src/core/api/auth`, schema `better_auth`: tabellen via `auth generate` → migratie, `__Host-`-cookie, sessiebeleid, rate limit in database (#18)
- [x] `session_strength` als sessieveld (`input: false`, standaard `password`), gezet in een after-hook op 2FA-verificatie, doorgegeven aan `withUser()`; `cookieCache` uit (#18)
- [x] ~~Rolcontrole in auth-hooks (admin: geen magic link) via een `security definer`-functie van `app_definer`, niet via grants~~ — vervallen: geen magic link (ADR 0013, alleen two-factor)
- [x] Inloggen, aanmelden, reset, e-mailverificatie via Mailpit; geen account-enumeratie; GET-links die een sessie maken, bevestigen met een POST — volgens ADR 0013: aanmelden en "wachtwoord vergeten" dicht; uitnodigen via de reset-flow, e-mail geverifieerd bij accepteren (#18, #28, #29)
- [x] MFA met inschrijfscherm; admins zonder magic link en zonder `trustDevice` (#18, #29; geen magic link, ADR 0013)
- [x] CSRF-middleware (testmatrix uit ADR 0007), `bodyLimit`, `secureHeaders()`, `onError` met `{ code, requestId }` (#16)
- [x] Env-schema met `APP_ENV` en de regels uit framework §6 (Secrets) (#16)
- [x] `scripts/seed` via de auth-API: gebruiker per rol, admin met vast lokaal TOTP-geheim (#19; per rol uit `ROLES` sinds #29)

**Klaar als:** één test per rij van de CSRF-matrix groen; een ingetrokken sessie geeft bij de volgende request 401; een admin-sessie zonder MFA
heeft sterkte `password`; de Better Auth-client stuurt bij sign-out `Content-Type: application/json`; per Secrets-regel een env-test die faalt
bij opstart; e2e-inlog per rol tegen de echte stack groen.

#### 3. Secure route en gebruikersbeheer (referentie-feature)

Gebruikersbeheer is het voorbeeld waar agents van kopiëren: een gebruiker beheert eigen profiel en sessies; een admin (MFA verplicht) zoekt
gebruikers met cursor-paginering, kent rollen toe en trekt ze in, blokkeert gebruikers. Elke nieuwe route, permissie of migratie: eerst een spec.

**3a. Backend-kern**
- [x] `defineRoute()` met `ctx.actor`, `createRouteKit`/`createApp` (ADR 0008), getypte client (contracten in `src/shared/contracts`), types per resource
- [x] `withUser()` met foutvertaling; Drizzle-schema uit de catalogus met branded IDs (`pnpm db:generate`)
- [x] Foutcoderegister, `limits.ts`, `assert()`, `unsafeCast()`, `Cents`, cursor-contract — met uitbreiding door de app (ADR 0008)
- [x] `user_roles` (FK naar `better_auth."user"`), `can()` met permissietabel van de app, MFA-eis afgeleid uit de rol in `can()` én RLS-helper, admin-test zonder MFA
- [x] pgTAP-invarianten (RLS geforceerd, geen TRUNCATE/REFERENCES/TRIGGER, `better_auth` dicht), racetest-patroon
- [x] Functiecatalogus in pgTAP (framework §6): elke functie client of intern, grants passend, actorcontrole, `search_path = ''`
- [x] Testkit in `src/core`: `asUser(rol)`, factories, savepoint per test

**3b. Frontend-basis**
- [x] TanStack Router met guards + ErrorBoundary; API-client (401 → inloggen, `ApiError`)
- [x] `AsyncView`, `<Form>`/`<FormField>`, `lib/format.ts`, `lib/env.ts`

**3c. Tokens en UI-kit**
- [x] Tokens in drie lagen, `@custom-variant dark`, basiskit Button, Input, Field, Card, Dialog (codemod vervalt: componenten met de hand op de tokens, geen `shadcn add`)
- [x] Contrasttest over recepten (bewijst ook dat een bekende foute kleur faalt), `scanAxe`, `/design-system` alleen in dev
- [x] Woordenlijsttest op `src/web/copy` en `src/core/web/copy` (`src/web/copy/woordenlijst.test.ts`, met zelftest) (#33)
- [x] `scanAxe`-uitzonderingen: geen, en een lintregel houdt ze tegen (`rails/axe-import`: alleen `e2e/support/axe.ts` gebruikt axe;
      `rails/axe-uitzondering`: geen `disableRules`/`exclude`/`include`/`options` daarin), fixtures in `test/rails/eslint.test.ts`
- [x] `check:catalogus`: AST-index van beide UI-mappen, publieke barrel-exports en bereikbare voorbeelden met eindige stringvarianten;
      dezelfde index voor agents en `/design-system`, zonder uitzonderingen (ADR 0028, `test/rails/catalogus-coverage.test.ts`,
      `src/web/features/design-system/component-index.test.tsx`; `gate:fast`: 1.186 tests groen, `docs/reviews/design-system-coverage.md`)
- [x] Toasts standaard in de basiskit (besluit eigenaar 2026-10-10, zelf gebouwd zonder dependency): `ToastProvider` in `main.tsx`, `Toaster` in de AppShell en
      `useToast().success/error` met `aria-live`, op `/design-system` en in `check:catalogus` (`src/core/web/ui/toast.test.tsx`).
      Bestaande `Notice`-meldingen na een mutatie zijn nog niet omgezet (aparte taak; let daar op toasts onder een open modale `Dialog`, die inert is, en op pauze bij hover/focus, WCAG 2.2.1)
- [x] `/design-system` als echte pagina (besluit eigenaar 2026-10-10): onder `/_app` in de AppShell, met menu-item en `can()`-guard, ook in
      productie; vervangt "alleen in dev" hierboven en in framework §6 en §7. Eerst een spec (#44, ADR 0015, #51)
- [x] UI-kit uitgebreid: native controls en feedbackbasics (#145, spec ui-kit-basics) en een doorzoekbare combobox met collectie-primitieven (#150,
  spec ui-collections); allemaal in `check:catalogus` en op `/design-system` (`src/core/web/ui/`)
- [ ] UI-kit: tabel, tabs, galerij, filterbalk en carousel (#156, spec `docs/specs/ui-data-display.md`); in `check:catalogus` en op `/design-system`

**3d. De feature**
- [x] Eerste feature met de hand door alle lagen (uit fase 2: dit is die feature); app-gegevens uit `better_auth."user"` via een `security definer`-view
- [x] `docs/gouden-pad.md` (≤ 1 pagina) met verwijzingen naar de bestanden van deze feature

**3e. Gebruikersbeheer, gebouwd** (open: ST-02 onder Volgende)
- [x] Admin blokkeert en deblokkeert een gebruiker; blokkeren trekt alle sessies direct in (de laatste-admin-regel geldt ook hier)
      (spec `accountbeheer-uitbreiding` AC-11..14 en 22..24, ADR 0026, #117: `db/tests/account_blocking.sql`,
      `test/api/account-blocking.int.test.ts`, `e2e/account-blocking.spec.ts`, `src/core/api/auth/blocked.test.ts`)
- [x] Gebruiker bekijkt en beëindigt de eigen sessies (spec `eigen-account`, deel 2; `test/api/eigen-account-deel2.int.test.ts`,
      `e2e/eigen-account-deel2.spec.ts`, `src/web/features/account/account-deel2.test.tsx`)
- [x] Gebruiker wijzigt het eigen wachtwoord en de eigen naam (spec `eigen-account`, ADR 0024; `test/api/eigen-account.int.test.ts`,
      `e2e/eigen-account.spec.ts`, `src/web/account.test.tsx`)
- [x] Gebruiker wijzigt het e-mailadres, met bevestiging naar het oude en het nieuwe adres (spec `eigen-account`, deel 2, ADR 0024)


**3f. Basis die elke app nodig heeft**
- [x] Lijstpagina-patroon: zoeken, filteren en sorteren in de search params, op het cursor-contract en `Table`; `new:resource` gebruikt het
      (spec `lijstpagina`; AC-8: `test/rails/new-resource-lijst.test.ts`, sjablonen in `scripts/kit/templates/`, voorbeeld `src/web/features/accounts`). Accounts en de generator zijn klaar; `check:new-resource` slaagt (AC-8)
- [x] `ConfirmDialog` in de kit voor destructieve acties (focus op Annuleren, `busy` blokkeert sluiten), op `/design-system` en in
      `check:catalogus` (`src/core/web/ui/confirm-dialog.test.tsx`, `e2e/design-system.spec.ts`)
- [x] Schil toegankelijk: paginatitel per scherm (`useDocumentTitle` via de h1, app-naam uit `src/web/index.html`), skip-link naar de inhoud,
      focus naar de h1 na een routewissel (`src/core/web/ui/app-shell.test.tsx`, `e2e/shell.spec.ts`)
- [x] Rate limit voor app-routes in `defineRoute` (nu alleen in Better Auth), met grenzen uit `limits.ts` en foutcode `RATE_LIMITED`
      (spec `rate-limit`; `app.consume_rate_limit`, `src/core/api/http/rate-limit.test.ts`, `test/api/rate-limit.int.test.ts`, `e2e/rate-limit.spec.ts`)
- [x] Mail-layout in core: één basissjabloon (HTML en platte tekst, afzender, voettekst) met snapshot-test; uitnodiging gebruikt hem
      (`src/core/api/mail/layout.ts`, escaping en alleen http(s)-links getest)
- [x] Generatorlijst met zoeken en sorteren (#111, #113) en lijstpagina-patroon in de kit (#92, #114); de generatorhandlers blijven bewust 501
- [x] `favicon` (`src/web/public/favicon.svg`), `<meta name="robots" content="noindex, nofollow">` met een `robots.txt` die crawlen toestaat (anders ziet een crawler de noindex niet) (`test/ui/public.test.ts`)

**Klaar als:** unit, pgTAP (elke policy op naam plus de invarianten), integratie, racetest "rol toekennen", e2e per rol en axe op 375 en
1280 px groen (uitvoer); een test per verboden rol per route; een test bewijst dat een app een permissie, foutcode en componentvariant
toevoegt zonder `src/core` te wijzigen; een core-test bewijst dat `createApp` geen route buiten `defineRoute` toelaat.

#### 4. Rails afronden

Elke regel uit `AGENTS.md` die een check kan zijn, wordt een check; een check telt pas met een fixture die bewijst dat hij faalt.
- [x] `check-secdef` voor security definer-views (zoals `app.accounts`): barrier, actorfilter, namen met schema, eigenaar; fail-closed bij
      materialized views, opties of naam wijzigen via `alter`, views in dynamische SQL en set-operaties (`test/rails/fixtures/secdef-views/`)
- [x] Roadmap-vinkjes afdwingen: `check:roadmap` (blokkerend, in `gate:fast`; `scripts/kit/check-roadmap.mjs`) meldt een nieuw of gewijzigd `[x]` in
      `docs/roadmap.md` zonder bewijs erachter (PR-nummer, testpad of checknaam) en een spec die naar `gebouwd` gaat zonder bewijs; met fixtures
      (`test/rails/check-roadmap.test.ts`, `test/rails/fixtures/roadmap/`)
- [x] ESLint-regels: functielengte (60 / 120 in `.tsx`, niet in tests), max-params 3, max-depth 3 met fixtures (#35); `useQuery`/`useMutation` alleen in
  `queries.ts`, `useForm` alleen in de wrapper, geen `console.error` in `queries.ts` en de API-client (#36)
- [x] `check-docs` in de ratchet: paden en scripts tussen backticks, links in `docs/`, statussen, "Hergebruik en UX", CODEOWNERS = `ask` (#34)
- [x] `check-policies` (elke policy een pgTAP-assert op naam, in `test:db`) en het bundelbudget (JS 260 kB, grootste chunk 115 kB, CSS 15 kB gzip, in `gate:fast`) (#38)
- [x] `check-secdef`: eigenaar en `search_path` in de database via de functiecatalogus in pgTAP (`db/tests/functies.sql`, #23) en `check:secdef` in `gate:fast` op de
  migraties (`search_path = ''`, namen met schema, eigenaar `app_definer`; fixtures in `test/rails/fixtures/secdef/`) (#60)
- [x] `check:migrations`: geen gecommitte migratie gewijzigd, verwijderd of hernoemd t.o.v. het afsplitspunt met origin/main, namen en versies uniek, in
  `gate:fast`; CI haalt daarvoor de volledige geschiedenis op (`test/rails/check-migrations.test.ts`)
- [x] `gate:slow` = `test:db` (met `check-policies`) + `ui:check` + `check:snapshot` (snapshot en Drizzle-schema zonder verschil) (#38)
- [x] Diff-guard met label `gate-wijziging` en goedkeuring op exact de head-SHA, met tabeltests per geval: gebouwd, nog niet verplicht (ADR 0017,
  `scripts/kit/diff-guard.mjs`, `.github/workflows/guard.yml`, #62); verplicht bij de overstap op de GitHub App (ST-01)
- [x] Scripts uit `excludedCommands` (`test:db`, `ui:check`, `gate:slow`, `db:generate`, `check:snapshot`) bestaan in `package.json`, alle vijf in de runner van ADR 0009
      Bewezen door `test/rails/excluded-commands.test.ts` (WS-03)
- [x] CI: `gate:slow`-job, gewijzigde tests als lijst, `guard.yml` (PR-code alleen als data, met de diff-guard), CodeQL, osv-scanner (PR + wekelijks;
      uitzonderingen met reden en `ignoreUntil`), Betterleaks (versie gepind in `mise.toml`), Renovate (gegroepeerd, blokkeert TS 7)
      Eerst, als eigen PR (volgorde punt 1): `gate:slow`-job met de Postgres-image uit `db/docker/`, osv-scanner en Renovate
      Gebouwd: `gate:slow`-job (#59), osv-scanner en Renovate (#61), `guard.yml` met de diff-guard (#62), CodeQL (`codeql.yml`,
      `security-extended`, TypeScript en workflows) en Betterleaks over de hele geschiedenis (job `secrets`, versie gepind in
      `mise.toml` in plaats van een image op digest). Gewijzigde of verwijderde tests als lijst staan in de samenvatting van de
      diff-guard (`scripts/kit/diff-guard.mjs`, "Gewijzigde of verwijderde tests"; op elke PR via `guard.yml`)

**Klaar als:** tabel in de PR met per regel uit `AGENTS.md` de check en de fixture-test die bewijst dat hij faalt (alle fixture-tests groen);
CI weigert `any`, een databaseclient in `src/web`, een route buiten `defineRoute` en een gewijzigde migratie (uitvoer);
de bewaker houdt een afgezwakt check-script tegen; regels zonder check staan met reden als roadmap-item.

#### 5. Agent-opzet

- [x] `AGENTS.md`, `CLAUDE.md`, padregels, spec-sjabloon, DoD (tekst; nog niet afgedwongen)
- [x] Rolhek-hook + `.claude/gates.json` (één lijst voor hook, diff-guard, CODEOWNERS en `ask`), met tabeltest van echte payloads incl. omzeilingen (#40; `check-docs` vergelijkt hem met CODEOWNERS en `ask`)
- [x] "Groen vóór klaar" (SubagentStop developer) en de overige hooks uit framework §8, elk met timeout en tabeltest (#41)
- [x] Vijf subagents (architect, developer, tester sonnet, reviewer opus, docs) met `model`, `maxTurns`, "eerst de feiten" (#42)
- [x] Skills (spec, nieuw-route, nieuw-scherm, nieuw-component, migratie, release, security-review) met `!`-injectie uit `scripts/kit/feiten.mjs`
      (routes, permissies, foutcodes, componenten) (#42; `release` volgt in fase 3)
- [x] `pnpm new:resource <naam>` afgeleid uit het gouden pad (ADR 0016): spec-skelet, daarna werkstraat-stap 2 met 501-handlers; `check:new-resource` als eigen CI-job
- [x] AC→test-check en risico-overzicht in de diff-guard (ADR 0029 P5; #167, #170): `check-docs` controleert dat elk AC-id van een gebouwde spec een test heeft
      (`test/rails/check-docs-ac.test.ts`), de diff-guard toont nieuwe of gewijzigde migraties, permissiesleutels, routes en contractwijzigingen (`test/rails/diff-guard-risico.test.ts`)
- [x] Prompts versoepelen (ADR 0029 punt 8, 9 en 18; #174): lijst `voorReview` in `.claude/gates.json`, Edit-regels in `ask` = `voorReview` (spiegelregel in `check-docs`), het rolhek meldt
      op andere gate-paden alleen "noem het in de PR"; `src/api/app.ts` en `src/shared/permissions.ts` zijn geen gate meer
      (`test/hooks/rolhek-voorreview.test.ts`, `test/rails/check-docs-voorreview.test.ts`)

**Klaar als:** per hook een tabeltest die hem met echte invoer aanroept en de exitcode controleert (blokkeert wat moet, laat door wat mag), groen;
code uit `pnpm new:resource` haalt `gate:fast`; drie testopdrachten door de hele werkstraat met per opdracht: ingegrepen hook of check, aantal beurten, correcties van de eigenaar.

#### 6. GitHub

- [x] `CODEOWNERS`, PR-template (bestanden; nog niet actief)
- [x] `pnpm app:init <slug> "<App-naam>"`: de handstappen uit `docs/nieuwe-app.md` (naam, README, titel) als script met test; de template-sectie verdwijnt
      (`scripts/kit/app-init.mjs`, `test/scripts/app-init.test.ts`)
- [x] `.vscode/extensions.json` en `.vscode/settings.json` (ESLint, Prettier, Tailwind), gelijk aan de gates

**Klaar als:** `check-github` groen; een test-PR van de bot is zonder review van de eigenaar niet te mergen; een push naar `main` wordt geweigerd;
de proef-app neemt een template-update over met conflicten alleen in bestanden die vooraf als verwacht zijn vastgelegd.

#### 7. Draaien buiten `pnpm dev`

Provider-neutraal: wat elke host nodig heeft, hoort in de template; de adapter per host blijft fase 3.
- [x] `startServer` neemt host en poort uit het env-schema: `API_HOST` (standaard `127.0.0.1`; de containerimage zet `0.0.0.0`) en `API_PORT`
- [x] Netjes stoppen: bij SIGTERM/SIGINT geen nieuwe verbindingen, lopende requests afmaken binnen `SHUTDOWN_TIMEOUT_MS` (standaard 10 s),
      daarna de pools sluiten via `onStopped` uit `src/api/server.ts` (`src/core/api/http/serve.test.ts`)
- [x] Request-logging in `src/core/api/obs/` (framework §6): één JSON-regel per request op stdout met `requestId`, routepatroon, status,
      gebruiker-ID, duur en databasetijd (tijd binnen `withUser`); geen body, query of PII. Eigen logger, geen dependency (besluit eigenaar
      2026-10-10); `createApp({ log })`, `server.ts` geeft `writeJsonLine` mee (`src/core/api/obs/request-log.test.ts`)
- [x] Readiness: `GET /api/ready` (200 `{ ok: true }` of 503 `{ ok: false }`) via `pingDatabase()` naast `GET /api/health` (liveness); uitkomst 1 s
      bewaard, hooguit één controle tegelijk, timeout 2 s; eigen verbinding met timeouts; regel in framework §3, ADR 0018 (`src/core/api/http/readiness.test.ts`, `test/datapad/ping.int.test.ts`)
- [x] `pnpm start` (`node src/api/server.ts`, geen buildstap voor de API) en een containerimage (non-root) die SPA en API op één origin serveert
      (ADR 0019, `Dockerfile`, CI-job `image` met `scripts/check-image.sh`; `src/core/api/http/web.test.ts`)

**Klaar als:** de image start met een niet-lokale `APP_ENV` tegen de lokale stack (uitvoer van de eigenaar); per request één logregel
(test); na SIGTERM eindigt een lopend request zonder afgebroken transactie (test); een opruimtaak verwijdert alleen verlopen rijen (test).

**Fase 1 klaar als:** verse machine komt met `bootstrap.sh` + `pnpm dev` tot een ingelogde app zonder extern account;
CI weigert `any`, een databaseclient in `src/web`, een route buiten `defineRoute` en een gewijzigde migratie;
de bewaker houdt een afgezwakt check-script tegen; `check-github` groen; elke rol logt in via e2e;
`gate:slow` draait in CI; de proef-app neemt een template-update over (stuk 6).

Ook gebouwd: rate limiting op app-routes (#87, spec `rate-limit`) met een requestId die de server zelf kiest (#83).

- [x] Audit log van admin-acties in core: migratie, `ctx.audit` en uitnodigen/opnieuw versturen in één transactie met de actie (ADR 0021, #128)
