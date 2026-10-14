---
status: goedgekeurd
namespace: task-mandate
---

# Taakmandaat en bewijs voor de agentdoorloop

## Doel

De eigenaar heeft deze uitbreiding en bewijsgebonden statusadministratie op 2026-10-13 in de opdracht goedgekeurd.
Een developer kan afgebakend frameworkwerk doen; de hoofdsessie verzorgt statussen, documentatielabel en runnerbewijs.
Kwaliteitschecks, inhoudelijke besluiten en eigenaarreview blijven verplicht. [ADR 0027](../adr/0027-taakmandaat-voor-frameworkwerk.md).

## Rollen en wie wat ziet

- Eigenaar: inhoud, scope, intrekking en vervanging; review en merge van besluitrecords en resultaat.
- Hoofdsessie: bereidt records voor, registreert bewezen statussen, labelt binnen het mandaat en handelt CI af.
- Developer: genoemde beschermde bronbestanden binnen een geldig taakmandaat; onbekende rollen krijgen geen mandaat.
- Architect: voorstellen en door main bewezen statusadministratie. Tester en reviewer houden hun bestaande rechten.
- App: core blijft gesloten. Template: core kan via een expliciet taakmandaat worden ontwikkeld.

## Datawijzigingen (met grants)

Geen databasewijziging. Het beschermde register `.claude/decisions.json` bevat document, inhoudsdigest, repository,
featurebranch, status en exacte bronpaden per besluit, plus de verplichte CI-checknamen. `pnpm docs:decision` bereidt
een voorstel voor; pas eigenaarreview en merge naar main geeft bevoegdheid. Geen wildcards, maptoestemming,
padtraversal, symlinks of vertrouwen in het register van de werkbranch. De digest sluit alleen de ene statusregel uit.

## Routes en foutcodes

Geen HTTP-route of applicatiefoutcode. Rolhek behoudt `allow`, `ask`, `deny` met reden. Ontbrekend of ongeldig bewijs
geeft geen extra recht. CLI-verificatiefouten geven niet-nul exitcode en maken geen status groen.

## Hergebruik en UX

Hergebruikt rolhek, shell-parser, gate-lijst, diff-guard, geïsoleerde runner en CI. Geen UI of nieuwe agentrol.
`pnpm docs:status` wijzigt alleen de statusregel, met `--roadmap` ook het vinkje van de eigen taak; `pnpm pr:verify` leest echte checks; `pnpm pr:label-gate` zet de markering.
Agentinstructies volgen [de procedure](../operations/agent-doorloop.md). Een weigering noemt bestand en grens;
de hoofdsessie verzorgt opvolging. Geen routineverzoek aan de eigenaar om veilig uitvoerbare runnerchecks te draaien.

## Acceptatiecriteria

- **task-mandate/AC-1** — Zonder geldig bewijs blijven bestaande rolhekbeslissingen gelijk; onbekende subagents krijgen geen mandaat.
- **task-mandate/AC-2** — De developer mag een genoemd core-bronbestand wijzigen of toevoegen in de template wanneer
  repository, featurebranch, documentinhoud en eigenaarbesluit uit main overeenkomen.
- **task-mandate/AC-3** — In een app geeft het mandaat alleen toegang tot genoemde beschermde app-broncode;
  gekopieerd templatebewijs geeft geen app-core-rechten.
- **task-mandate/AC-4** — Tests, fixtures, setup, gegenereerde bestanden en bewaking worden niet door een broncodemandaat
  geopend; bestaande testregels blijven gelden.
- **task-mandate/AC-5** — Werkbranch, gewijzigde spec, eigen register, rolnaam of ongeldige invoer geeft geen goedkeuring.
  Andere repository, branch, symlink, traversal of intrekking maakt het mandaat ongeldig.
- **task-mandate/AC-6** — Edit, Write, MultiEdit en herkende Bash-schrijfdoelen gebruiken dezelfde controle;
  een samengesteld commando met een verboden doel blijft verboden. Onherkenbare shellcode geeft geen mandaat.
- **task-mandate/AC-7** — Alle bestaande ADR- en spec-statussen zijn te administreren met passend bewijs; een voorstel
  geeft geen inhoudelijk akkoord. Terminale statussen en ADR-vervanging vereisen eveneens een eigenaarbesluit.
- **task-mandate/AC-8** — Een goedkeuringsstatus geeft op zichzelf geen bouwbewijs of broncodemandaat.
  Inhoud wijzigen onder een bestaande goedkeuringsstatus zonder nieuw eigenaarbesluit wordt geweigerd.
- **task-mandate/AC-9** — Gebouwd vereist overeenkomende PR, onveranderde goedgekeurde inhoud, een gevalideerde
  vooroudercommit, uitsluitend latere statuswijzigingen en het vinkje van het roadmap-item van de eigen spec en alle verplichte Actions-checks groen.
  Verkeerde SHA/App-identiteit, ontbrekende checks en latere mislukte runs worden geweigerd.
- **task-mandate/AC-10** — CI gebruikt main en controleert de volledige diff, inclusief beide renamepaden.
  Een werkbranch vervangt de controle niet. Diff-guard en eigenaarreview blijven gelden.
- **task-mandate/AC-11** — Alleen de hoofdsessie zet via de helper het gate-label binnen de scope uit main.
  Standaard uitsluitend documentatie; directe label-, review- en check-statusschrijfacties blijven verboden.
- **task-mandate/AC-12** — Vaste runneropdrachten mogen automatisch bij toestemming uit main en onveranderde hostcode.
  Gewijzigde, ongetrackte of genegeerde hostbestanden en ontbrekend Git-bewijs geven geen automatische runtoestemming.
- **task-mandate/AC-13** — De agent omzeilt geen runnercontrole. Voor gewijzigd railwerk wacht de hoofdsessie op echte CI
  op de juiste repository, branch en SHA. Ontbrekende of rode runs blokkeren oplevering.
- **task-mandate/AC-14** — Lokale hooks doen geen netwerkwerk; GitHub-bewijs komt expliciet via read-only `gh`,
  behalve de labelhelper. Een veranderende werkmap of PR maakt opgehaald bewijs ongeldig.
- **task-mandate/AC-15** — Een weigering wordt met werkelijke rolhekuitvoer als onvoltooid gemeld. Een tekstmelding of
  falende test geeft geen uitzondering op de groen-eis; de hoofdsessie mag geen voltooiing claimen.
- **task-mandate/AC-16** — Een toegestane core-proef en verboden bewakingswijziging worden in echte tijdelijke
  Git-repositories gecontroleerd. Live invoering vereist bestaande checks en eigenaarreview; geen onafhankelijke
  review claimen zonder afgedwongen rolgrenzen.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Besluit ontbreekt op main | Geen extra mandaat of goedkeuringsstatus | n.v.t. |
| Status bewezen op main, inhoud identiek | Administratief overnemen toegestaan | n.v.t. |
| Alleen status verandert | Digest gelijk; passend bewijs blijft nodig | n.v.t. |
| Code verandert na groene run | Nieuw bouwbewijs op nieuwe SHA | n.v.t. |
| ADR geïmplementeerd | ADR blijft geaccepteerd; gekoppelde spec kan gebouwd zijn | n.v.t. |
| Hostcode verandert | Geen automatische lokale runner; wegwerp-CI | n.v.t. |
| CI loopt, faalt of ontbreekt | Wachten, herstellen of concrete blokkade melden | n.v.t. |
| Runtime zonder rolhek/aparte identiteit | Beperking melden; CI/GitHub/eigenaarreview nodig | n.v.t. |

## Raakt ook

Framework §8/§10, AGENTS.md, architect/developer/docs-instructies, spec-skill, rolhek/CI-guard, gates/register,
status- en PR-helpers, DoD en procedure. Geen bestaande checks, tests, dependencies of databasegrants verwijderen.
Nieuwe broncodetaken krijgen een eigen besluitrecord; deze spec opent zelf geen core-bestanden.

## Buiten scope

Permanent core-schrijfrecht, autonome inhoudelijke goedkeuring, automatische merge, nieuwe credentials/dependencies,
GitHub App, het ontbrekende `check-core` en app-functionaliteit. Geen stop-hookuitweg die rode checks groen maakt.

## Testplan

Fase 1, stukken 4/5. Nieuwe positieve en negatieve bewijs- en rechtentests plus echte tijdelijke Git-repositories
voor main/werkbranch, worktrees, scope, intrekking, symlinks en runnerhostbestanden. Pure GitHub-gegevensvalidatie bewijst
beslislogica; alleen live opgevraagde uitslagen tellen als bouwbewijs. Geen gemockte applicatie-API of database.
Bestaande hook-, werkstraat- en diff-guardtests blijven regressiebewijs. Daarna `pnpm gate:fast`, toepasselijke bestaande
GitHub-checks en eigenaarreview. Geen gebouwd-status zonder echte PR en vereiste groene uitslagen.
