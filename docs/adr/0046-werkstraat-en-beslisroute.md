# 0046 — Werkstraat en beslisroute

Status: geaccepteerd

Vervangt [0025](0025-werkstraat-tot-de-merge.md), [0027](0027-taakmandaat-voor-frameworkwerk.md),
[0030](0030-ci-lus-en-agent-merge.md) en [0038](0038-beslisroute.md); neemt de delen van [0029](0029-snellere-beslisroute.md)
over die via 0038 punt 8 nog gelden.
Drempel: A4. Consolidatie zonder inhoudelijke wijziging (eigenaarbesluit 2026-10-21, 0038 Gevolgen).

## Context

De werkstraat (framework §8) liep van architect tot reviewer; daarna lagen push, PR, CI en statusadministratie bij de eigenaar,
die alleen wil mergen. Elk besluit kostte twee of drie PR's (voorstel, statusstap, record), terwijl het enige echte anker de merge
door de eigenaar is: de agent pusht onder diens account (overgang, [0017](0017-diff-guard.md)), dus geen auteur, committer of
web-flow-handtekening onderscheidt eigenaar en agent. Dit ADR bundelt de werkstraat tot de merge, het taakmandaat, de CI-lus, de
(uitgeschakelde) agent-merge en de beslisroute.

Herkomst van het akkoord: 0025 is door de eigenaar geaccepteerd (besluiten 2026-10-12, E-1..E-4 en W-1..W-7); 0027 met
eigenaarakkoord in de opdracht (2026-10-13); 0030 punt 1–7 zijn eigenaarbesluiten (2026-10-14). Uit 0029 zijn
P1–P7, de mini-spec en de agent-merge in de feature-lane eigenaarbesluiten van 2026-10-15, de mergevorm, prompt en merge-toets van
2026-10-18. Uit 0038 is alleen de kern van punt 1–4 eigenaarbesluit (2026-10-21); wat daar als agentvoorstel staat, is hieronder
zo gemarkeerd en is aanvaard met de merge van 0038.

## Besluit

**Principes** (was 0029 P1–P7; eigenaarbesluit 2026-10-15)

- **P1 Bewijs vóór uitbreiding:** geen nieuwe template-capability, rail of meta-ADR zonder app-behoefte, doorgeglipte fout of gemeten wrijving.
- **P2 Rails blijven:** nooit een check, test, hook, RLS-regel of type afzwakken voor autonomie.
- **P3 Prompts alleen voor wat werkt vóór review:** code die op de machine van de eigenaar of in CI draait, en de eigen instructies en rechten van de agent.
- **P4 Eén ronde per besluit.** **P5 Wat een check kan, is een check:** elk acceptatiecriterium een test, elke PR een risico-overzicht.
- **P6 Meten vóór en na** een wijziging aan de werkstraat. **P7 Eén bron per feit,** die de huidige werking beschrijft.

**Beslisroute**

1. **Merge is acceptatie** (was 0038 punt 1; kern eigenaarbesluit 2026-10-21). Architect of hoofdsessie schrijft een ADR of spec
   direct met de bedoelde status (`geaccepteerd`, `goedgekeurd`, `vervallen`, `vervangen door NNNN`). De merge door de eigenaar is
   het besluit; afwijzen is de PR sluiten. Agentvoorstel: mergen met `vervallen` als de reden bewaard moet blijven;
   `voorgesteld`/`voorstel` alleen voor een bewust geparkeerd voorstel. Een status geeft zichzelf geen goedkeuring; inhoud, scope,
   intrekking en vervanging zijn eigenaarbesluiten (was 0027 punt 1 en 0025 punt 10, gewijzigd door 0038 punt 8).
2. **A4 blijft** (was 0038 punt 2; kern eigenaarbesluit). De tekst van een geaccepteerd ADR verandert niet; een normatieve
   correctie is een nieuw ADR. Nieuw ADR en `vervangen door NNNN` of `vervallen` op het oude mogen in één PR, zonder record;
   meerdere ADR's per PR mogen. Agentvoorstel: `geaccepteerd` terug naar `voorgesteld` mag niet, en de statusregel volgt de strikte
   vorm uit het ADR dat 0031 vervangt. De sporen voor een correctie (nieuw ADR, verwijzing achter de statuswaarde, niet-normatieve
   correctie) staan in het ADR dat 0031 vervangt (was 0031 besluit 3, gewijzigd door 0038 punt 8).
3. **Korte ADR's** (was 0038 punt 3; kern eigenaarbesluit). Richtlijn één pagina: context, besluit, alternatieven, gevolgen; geen
   regelnummers en geen werkinstructie (die horen in `docs/`). Agentvoorstel: geen woordtelling als check.
4. **Drempel** (was 0038 punt 4 en 0029 punt 4; kern eigenaarbesluit). Een ADR is nodig bij A2 (moeilijk terug te draaien:
   migratie op bestaande rijen, rollen/RLS-model, auth of identiteit, provider of nieuwe dependency), A3 (rechten verruimen, of een
   check, hook of gate afzwakken), A4 (geaccepteerd ADR wijzigen of vervangen) en, van A1, alleen een wijziging van het contract
   tussen zones. Het ADR noemt welke. Een strengere check is geen ADR; anders een regel in `docs/`. Agentvoorstel, de toets: "als de
   twee mensen die dit besloten morgen weg zijn, weet de rest dan waarom?"
5. **Guard** (was 0038 punt 5; agentvoorstel). `check-document-status` laat zonder record toe: een nieuw document met een
   eigenaarstatus; `voorstel`/`voorgesteld` naar een eigenaarstatus; `geaccepteerd` naar `vervangen door NNNN` (NNNN op main of in
   de PR) of `vervallen`; een spec van `goedgekeurd` of `gebouwd` naar `vervallen`. Het weigert de terugzetting uit punt 2. Inhoud
   van een goedgekeurde spec wijzigen mag alleen in een besluit-PR, nooit met code. Een besluit-PR bevat alleen documenten in
   `docs/adr/` en `docs/specs/` met hun records; de samenvatting noemt elk document dat een eigenaarstatus krijgt.
6. **Rolhek** (was 0038 punt 6; agentvoorstel). Alleen architect en hoofdsessie schrijven een eigenaarstatus of wijzigen de inhoud
   van een goedgekeurde spec; andere rollen niet. De developer houdt alleen `gebouwd` via `docs:status`. De lokale A4-weigering blijft.
7. **P2-uitzondering** (was 0038 punt 9; agentvoorstel, aanvaard met de merge van 0038). Vervallen zijn: de statuscommit-eisen
   (alleen statusregels, geen inhoud erna, web-flow; was 0029 punt 3), een apart eigenaarspoor in git, in het rolhek voor architect
   en hoofdsessie de weigering van een eigenaarstatus zonder record en van `goedgekeurd`, de beperking tot één document met
   eigenaarstatus, en de recordeis bij `vervangen door`/`vervallen` en bij een inhoudswijziging aan een goedgekeurde spec. Een
   `--path`-record van zo'n spec vervalt daardoor; het mandaat vraagt een nieuw record. Anker: de merge door de eigenaar met de
   statusregel in de diff; CODEOWNERS op `docs/adr/` en `docs/specs/` dwingt pas review af met een eigen identiteit voor de agent
   (GitHub App, 0017). Compensatie: punt 2, 5, 6 en 31.

**Taakmandaat** (was 0027; eigenaarakkoord in de opdracht)

8. **Register alleen voor broncodemandaat en `requiredChecks`** (was 0027 punt 2 en 0029 punt 2, gewijzigd door 0038 punt 8).
   `.claude/decisions.json` op main bindt een record (inhoudsdigest, repository, exacte bouwbranch, exacte bronbestanden) aan een
   spec die beschermde bronbestanden nodig heeft, en houdt de verplichte checks voor `pr:verify`. Rechten gelden pas na de merge;
   een werkversie, prompt, label of commit-auteur vervangt dat niet. Een statusbesluit zonder `--path` krijgt geen record.
9. **Taakgebonden broncode** (was 0027 punt 3). Alleen de bekende developer mag met een geldig record de genoemde bronbestanden
   wijzigen: core alleen in de template, de beschermde compositie-roots en permissietabel ook in een app. Hooks, CI, scripts,
   dependencies, tests, fixtures, gegenereerde bestanden en het register krijgen geen extra rechten. Andere branch, repository,
   inhoud, symlink of intrekking geeft geen mandaat. Lokaal geldt opgehaalde `origin/main`; CI gebruikt de actuele default branch.
10. **Gebouwd met bouwbewijs** (was 0027 punt 4). Een spec gaat naar `gebouwd` zodra de implementatie is vastgelegd, de PR open is
    en alle verplichte GitHub Actions-checks groen zijn op de broncommit; de statusregel noemt PR en gevalideerde SHA. Daarna mogen
    alleen statusregels en het roadmapvinkje van de eigen spec veranderen. Gebouwd is aangeboden en gecontroleerd, geen merge of
    release. ADR's kennen geen `gebouwd`.
11. **Label als markering** (was 0027 punt 5). De hoofdsessie zet met `pr:label-gate` het label alleen op documentatie-PR's
    (`gateMarker: docs` op main). Verruiming vraagt een eigenaarbesluit. Een label vervangt geen eigenaarreview.

**Lanes en mini-spec** (was 0029)

12. **Framework-lane** (was 0029 punt 1 en lanedefinitie, 0038 punt 5). Alles wat `src/core`, rails, gates of agentconfiguratie
    raakt en elk besluit met een ADR. Het besluit gaat in een besluit-PR zonder code; bouwen volgt in een volgende PR.
13. **Mini-spec** (was 0029 punt 5; eigenaarbesluit 2026-10-15). Eigen sjabloon `docs/specs/_mini.md` met marker `sjabloon: mini`,
    voor een route, een permissie of een nieuwe tabel. Migraties alleen als nieuwe tabel via `pnpm new:resource`; alles onder A2
    (bestaande rijen, rollen/RLS-model, `security definer`) en elke wijziging in `src/core` gaat via het volledige sjabloon.
14. **Feature-lane** (was 0029 punt 6). App-werk met één mini-spec. De mini-spec ontstaat uit de verhelderende vragen van de
    architect; de eigenaar keurt hem in de sessie goed vóór het bouwen. Spec en bouw mogen in één PR, die de eigenaar merget (punt
    31). Geen `src/core`, geen pad uit `voorReview`, geen ADR, geen gewijzigde of verwijderde bestaande test of migratie, geen tweede
    document met eigenaarstatus. Het geldende bereik is de lane-herkenning (`scripts/kit/lane.mjs`), beschreven in
    `docs/operations/agent-doorloop.md`.
15. **Herkenning** (was 0029 punt 7, gewijzigd door 0038 punt 5). `check-document-status` herkent zonder record alleen een
    besluit-PR of een feature-lane-PR; bij een rename tellen beide paden. Past een PR in geen van beide, dan heeft de status een
    record op main nodig. Diff-guard en CODEOWNERS blijven voor elk gate-pad gelden.

**Werkstraat tot de merge** (was 0025, 0027 punt 7 en 0030 punt 1 en 8)

16. **Stap Opleveren** (was 0025 punt 1). Tussen reviewer en eigenaar, alleen door de hoofdsessie: branch pushen, PR openen,
    CI-lus, conflicten oplossen, eindmelding. Push naar `main` en force-push blijven verboden.
17. **Conflicten via `git merge origin/main`**, nooit rebase (was 0025 punt 2).
18. **Modelkeuze per spec** (was 0025 punt 3). Frontmatter `model: sonnet | opus`, bij opus `modelreden`, gezet door de architect;
    geldt voor developer en tester; reviewer en architect blijven opus. Opus alleen bij gelijktijdigheid of geld, datamigratie op
    bestaande rijen, de kern van auth, MFA, sessies of `src/core`, of een `security definer`-functie of -view. Escalatie op bewijs:
    na 2 rode correctierondes of 2 gelijke blokkerende reviewbevindingen één keer opus, met reden in de PR. De hoofdsessie draait
    standaard op Sonnet (werkafspraak).
19. **Runner** (was 0025 punt 4 en 0027 punt 6). Runner, hostcontrole en vaste runnerchecks: zie het ADR dat 0009 vervangt.
20. **Gecommitte migratie** (was 0025 punt 5) is voor het rolhek: staat in de merge-base met `origin/main`, zoals `check:migrations`.
21. **Mergen en force-push dicht** voor elke rol in het rolhek, ook `--auto`, `gh api …/merge` en GraphQL-merge (was 0025 punt 6),
    behalve de vorm van punt 30 als die aanstaat.
22. **Rolhekgaten en MCP** (was 0025 punt 7–8). Testhulpbestanden en configs als gate, hooks met de root uit de payload; MCP-tools
    onder het rolhek met een allowlist `mcpLezen` voor leestools.
23. **Rood bewijzen bij migraties** (was 0025 punt 9). De tester bewijst rood met één `pnpm test:db`-run; de uitslag staat in de PR.
24. **Onvoltooid blijft onvoltooid** (was 0027 punt 7). Een weigering meldt de developer met de werkelijke rolhekuitvoer aan de
    hoofdsessie; die verwerkt de blokkade of legt een concrete scope-uitbreiding voor. De groen-eis van de stop-hook krijgt geen
    tekstuele uitzondering; een rode of ontbrekende check is geen voltooide taak.
25. **CI-lus tot groen** (was 0030 punt 1). De hoofdsessie wacht met `pnpm pr:verify <nr> --watch` (SHA, branch, herkomst GitHub
    Actions), herstelt rood en herhaalt, zonder vast aantal rondes. Stoppen en vragen als de fix een regel, check, hook of test
    afzwakt; dezelfde fout drie keer achter elkaar; de oorzaak buiten de code ligt; of een gate- of beschermd pad moet wijzigen.
    Fixes na de review ziet de reviewer opnieuw. De lus leeft alleen in de sessie: geen timer, token of credential.
26. **Opruimen na de merge** (was 0030 punt 8), door de hoofdsessie in elke modus, alleen na bevestigde merge: main fast-forward,
    alleen de eigen branch en worktree weg; stoppen bij een vuile werkmap of ongepusht werk. Nooit rebase, `reset --hard`,
    `--force` of `--delete main`.

**Promptbeleid en agent-merge** (was 0029 en 0030)

27. **`voorReview`** (was 0029 punt 8; twijfelgevallen eigenaarbesluit 2026-10-15). Deelverzameling van de gate-paden in
    `.claude/gates.json` met effect vóór review: (a) gereedschap dat lokaal of in CI draait (scripts, CI, hooks, dependencies,
    omgeving, configs; niet app- en testcode, die in de runner draaien), (b) instructies, rechten of hooks van de agent, (c) de
    vertrouwde basis van checks. De roadmap, ADR's, specs, `docs/nieuwe-app.md`, `src/api`, `src/core`, `deploy/**` en testpaden
    horen er niet in. De lijst `voorReview` in `.claude/gates.json` is het besluit over de twijfelgevallen.
28. **Prompts** (was 0029 punt 9). Buiten de onderhoudsmodus vraagt het rolhek de hoofdsessie op een `voorReview`-pad; op de andere gate-paden geeft het een
    melding. Commando-`ask`'s, migraties, gegenereerde bestanden en bestaande tests blijven ongewijzigd; CODEOWNERS blijft `gates` +
    `jsonGates`. Welke Edit-regels `ask` zijn en wat subagentrollen op gate-paden krijgen: zie het ADR dat 0032 en 0033 vervangt.
29. **Compensatie vóór versoepeling** (was 0029 punt 10). Een versoepeling (punt 28, 30 en 32) komt pas na de P5-checks
    (AC→test en risico-overzicht in de diff-guard) op main.
30. **Merge-modus, staat uit** (was 0030 punt 2–3, eigenaarbesluit 2026-10-14; was 0029 punt 14, eigenaarbesluit 2026-10-15,
    mergevorm, prompt en toets 2026-10-18). Sleutel `merge` in `.claude/gates.json`, gelezen uit `origin/main`: `"eigenaar"` (ook
    bij ontbreken of onleesbaar), `"feature-lane"`, `"agent-na-akkoord"` (ongebruikt; `check-docs` faalt erop). `.claude/**` is een
    gate-pad, dus alleen de eigenaar zet de sleutel. Aanzetten kan pas als `scripts/check-github.mjs` tegen
    `.github/settings/main-protection.json` bewijst dat de ruleset groene verplichte checks eist. Bij `"feature-lane"` mag alleen
    de hoofdsessie exact `gh pr merge <nr> --squash --match-head-commit <sha>` met `<sha>` = lokale `HEAD`, als (1) `pr:verify`
    groen is op die SHA, (2) een onafhankelijke reviewer die SHA zonder open blokkerende bevinding goedkeurde, (3) de diff-guard de
    lane bevestigt en de PR geen gate-pad buiten de mini-spec raakt, (4) de modus en het rulesetbewijs gelden. Het rolhek geeft dan
    `ask`, nooit `allow` (vangnet voor een fail-open hook); de eigenaar krijgt achteraf een melding. `--admin`, `--auto`,
    `gh api …/merge` en subagent-merge blijven deny.
31. **Wie merget** (was 0038 punt 7; agentvoorstel). Een PR waarin een document een eigenaarstatus krijgt, ook een feature-lane-PR
    met spec en code, merget altijd de eigenaar. De agent merget alleen een bouw-PR van een mini-spec die al goedgekeurd op main
    staat, met dezelfde inhoudscontrole als de feature-lane (migratie alleen een nieuwe tabel, niets uit de uitsluitingen).
32. **`src/api/app.ts` en `src/shared/permissions.ts` geen gate** (was 0029 punt 18; eigenaarbesluit 2026-10-15; A3). Compensatie: het
    risico-overzicht noemt elke nieuwe of gewijzigde permissiesleutel en route; `defineRoute`, test per verboden rol en `can()`
    blijven. Zwakte: minder menselijke review op wie wat mag.
33. **Framework-lane geparkeerd** (was 0030 punt 4–5, eigenaarbesluit 2026-10-14; 0029 punt 15, eigenaarbesluit 2026-10-15).
    Agent-merge met akkoord per PR in de sessie blijft geparkeerd; daar merget de eigenaar.
34. **Harde grens is GitHub** (was 0030 punt 6; eigenaarbesluit 2026-10-14). De ruleset eist groene checks; de agent zet geen review
    of label rechtstreeks.
35. **Volgorde** (was 0029 punt 16; eigenaarbesluit 2026-10-15). Agent-merge is actief pas na de P5-checks en met de lane-uitslag in
    `requiredChecks`.

**Meten** (was 0029 punt 11–13, met 0038 Gevolgen)

36. Per besluit: PR's tot de eindstatus op main en doorlooptijd; doel mediaan één PR (basislijn: 2 PR's, 2u03m). Per sessie en
    branch: prompts, weigeringen, beurten, CI-rondes en correcties van de eigenaar (elk eigenaarbericht na de opdracht, als
    bovengrens; eigenaarbesluit 2026-10-15), via fail-open hooks zonder netwerk en zonder promptinhoud of geheimen.
37. Nulmeting en dezelfde meting na elke werkstraatwijziging. Herzien na de eerste 5 besluiten als de mediaan > 1 PR is of de
    doorlooptijd niet onder de basislijn ligt; direct bij één onbedoelde status op main; en als prompts niet dalen of weigeringen,
    blokkerende bevindingen of correcties stijgen.

**Vertrouwensgrens** (was 0027, 0030 Gevolgen). Main berust op de afspraak dat alleen de eigenaar merget, behalve punt 30. De agent
werkt met de identiteit van de eigenaar; een rolnaam is geen onafhankelijk reviewbewijs. De Claude-hooks zijn runtime-specifiek;
CI en GitHub blijven de grens voor andere runtimes.

## Alternatieven

- **Statusstap in de webeditor of sessieakkoord (0029, 0035):** extra ronde of machinerie zonder sterker anker (was 0038).
- **A4 loslaten:** verworpen door de eigenaar (was 0038).
- **Auto-merge na groen of akkoord via label of comment:** geen moment waarop de eigenaar de head ziet; label en comment kan de
  agent zelf zetten (was 0030).
- **Agent-merge zonder prompt:** bij een falende hook zou een merge zonder lanecheck doorgaan (was 0029, 2026-10-18).
- **Rebase met force-push; vast maximum aan CI-rondes; `gh pr checks --watch`:** verworpen (was 0025, 0030).
- **Tweede bouwagent of model per rol:** de keuze hangt aan het werk (was 0025).
- **Status, label of agentreview als akkoord; iedere developer blijvende toegang:** verworpen (was 0027).
- **Gates uit CODEOWNERS of diff-guard halen voor minder prompts:** verworpen (P2), behalve punt 32 (was 0029).

## Gevolgen

- Werkinstructie (commando's, opruimstappen, records) staat in `docs/operations/agent-doorloop.md` en de skill `opleveren`.
- `docs/specs/agent-merge.md` wordt vóór invoering van punt 30 op punt 31 aangepast (was 0038 punt 7).
- Restrisico's: de agent pusht en zou mergen onder het account van de eigenaar, dus de diff-guard geeft `overgang`; het
  reviewerakkoord is een sessie-artefact; het rulesetbewijs is een momentopname; het rolhek is fail-open (was 0029 punt 17,
  eigenaarbesluit 2026-10-15 en 2026-10-18; 0030 Gevolgen).
- Niet beslist: een GitHub App voor de agent (ST-01, W-3); drempelwaarden voor punt 37.
