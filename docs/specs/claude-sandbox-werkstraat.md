---
status: goedgekeurd # bedoelde status; geldt pas na eigenaarmerge op main (ADR 0046)
namespace: claude-sandbox-werkstraat
---

# Dagelijks werk in de Claude Code-sandbox

## Doel

Claude Code voert op Ubuntu/WSL snelle pnpm-checks, gewone commits, featurebranch-pushes en PR-aanmaak uit zonder
terugkerende eigenaarstaken, binnen de bestaande sandbox en kwaliteitsgrenzen.

[ADR 0061](../adr/0061-claude-sandbox-werkstraat.md) besluit over de beperkte rechtenwijziging. Dit is een docs-only
besluitvoorstel: de bedoelde status hierboven activeert niets vóór eigenaarmerge op `main`; implementatie volgt daarna.
De aanleiding en afweging staan in het ADR, niet in een nieuw roadmap-item.

## Rollen en wie wat ziet

- Eigenaar: beoordeelt en merget besluit en implementatie. Bestaande setup blijft de inrichting van de toolchain.
- Hoofdsessie: coördineert tester, bouwer en onafhankelijke reviewer; pusht de featurebranch, opent de PR en verzamelt CI-bewijs.
- Architect: alleen dit besluit en deze spec. Tester: tests vóór implementatie. Bouwer: uitsluitend toegestane paden.
- Bestaande rolbeperkingen blijven gelden; een subagent krijgt geen push, PR-aanmaak, eigen goedkeuring of ruimer taakmandaat.

## Datawijzigingen (met grants)

n.v.t. — geen databasewijziging, grants of migratie.

## Routes en foutcodes

n.v.t. — geen API-contract, route, app-permissie of foutcode.

## Kopieer de vorm van

Geen functioneel accountbeheerpad uit `docs/gouden-pad.md` past: dit betreft de bestaande werkstraat, zonder product-UI.

- `test/rails/sandbox-settings.test.ts` — behoud van sandboxgrenzen en gerichte instellingenregressies.
- `test/scripts/cloud-setup.test.ts` — setupvolgorde, idempotentie en expliciet stoppen bij fouten.
- `scripts/kit/toolchain.mjs` — bestaande toolchaindiagnose, zonder nieuwe dependency of parallelle controlepijplijn.

## Hergebruik en UX

- Bestaande componenten: n.v.t. — geen UI; hergebruik mise, bootstrap, cloud-setup, Lefthook, rolhek en `pr:verify`.
- Staten per scherm, focus en toetsenbord: n.v.t. — terminalwerk.
- Alle zichtbare tekst: bestaande uitvoer blijft; bij een verkeerde pin of werkelijke versie noemt de diagnose verwacht
  en aangetroffen versie en verwijst naar de bestaande setup. Native pnpm- en Git-fouten worden niet als succes gemeld.
- Dagelijkse push: `git push origin HEAD`, zonder upstreamregistratie. PR-aanmaak gebruikt altijd een expliciete
  `--head` met de werkbranch en `--body-file`; geen impliciete pushkeuze door gh.

### Werking

`packageManager` blijft de enige pnpm-versiebron. De shellvrije mise-afleiding moet dezelfde exacte pin selecteren.
Het prototype hieronder selecteerde met mise 2026.10.4 aantoonbaar 11.28.2, toen nog niet geïnstalleerd in mise;
compatibiliteit met de bestaande cloudpin 2026.9.18 is nog te bewijzen tijdens implementatie:

```toml
pnpm = '''{{ read_file(path='package.json') | split(pat='"packageManager"') | last | split(pat='"') | nth(n=1) | split(pat='@') | last }}'''
```

De bestaande setup installeert de geselecteerde exacte versie vooraf. De werkelijke versie moet overeenkomen met een
geldige exacte `pnpm@x.y.z`-pin; automatische download of stille terugval mag een ontbrekende of verkeerde installatie
niet verhullen. Geen nieuwe dependency, globale cacheopening of projectstoremigratie. Als het prototype niet voldoet,
eerst een passende shellvrije afleiding bewijzen; geen ongeteste templatefunctie of automatische mise-upgrade.

`autoAllowBashIfSandboxed` wordt expliciet `true`. Gerichte regels ondersteunen gewone `git add` en `git commit`,
featurepushes en gh-aanmaak/lezen. Voorbeelden van bestaande of gerichte toestemmingen zijn `feat/`, `fix/`, `docs/`,
`chore/`, `test/`, `refactor/`, `claude/`, `codex/` en `feature/`; dit introduceert geen verplicht branchnaamformaat.
De bestaande HEAD-maincheck blijft gelden; geen nieuwe prefixweigering of rolheklogica. Bestaande verboden en
rolbeperkingen blijven leidend.

Git-metadata blijft bij Claude's ingebouwde ondersteuning. Alleen als de echte gh-logproef een cacheblokkade bewijst,
komt exact `~/.cache/gh` in `allowWrite`. Geen bredere caches, Git-config/hookrechten of credentialwrites.

## Acceptatiecriteria

- **claude-sandbox-werkstraat/AC-1** — De geldige exacte `packageManager`-pin bepaalt de mise-selectie; zowel de lokale
  mise-versie als de bestaande cloudpin selecteren dezelfde versie, zonder tweede versieliteral of mise-upgrade.
- **claude-sandbox-werkstraat/AC-2** — Na bestaande setup gebruiken een nieuwe shell en de echte Git-hooks de exacte
  pin. Een ongeldige, ontbrekende of verkeerde installatie stopt met diagnose; exitcode 0 met een andere versie faalt.
- **claude-sandbox-werkstraat/AC-3** — In native Claude Code slagen een bestaande snelle pnpm-check en een normale
  commit met werkelijk uitgevoerde opmaak-, lint-, Betterleaks- en commit-msgcontrole, zonder nieuwe eigenaarstaak.
- **claude-sandbox-werkstraat/AC-4** — Vanuit een featurebranch slaagt `git push origin HEAD`, met de echte
  pre-push en `gate:fast`; daarna slagen PR-aanmaak met expliciete head/bodyfile en het ophalen van werkelijke CI.
- **claude-sandbox-werkstraat/AC-5** — De native proef van AC-3/4 werkt in hoofdcheckout en gekoppelde worktree zonder
  `.git`-allowWrite; upstreamvarianten krijgen geen nieuwe automatische toestemming.
- **claude-sandbox-werkstraat/AC-6** — Negatieve tests blijven `main`-push, ook via HEAD, main-verwijdering, force,
  `--all`, `--mirror`, hookoverslaan, PR-merge via gh/API, zelfreview en directe Docker weigeren. Lokale
  `git merge origin/main`, fast-forward en bestaande veilige taakbranchopruiming blijven toegestaan, zonder nieuwe
  beperkingen. Subagents blijven push en PR-aanmaak weigeren.
- **claude-sandbox-werkstraat/AC-7** — Sandbox verplicht, fail-closed en zonder ontsnappingsmogelijkheid; bestaande
  `ask`/`deny`, runneruitzonderingen, netwerkdomeinen en `allowRead` blijven behouden. Alleen bewezen noodzakelijk
  `~/.cache/gh`-schrijfrecht is toegestaan; pnpm-opslag, mise-installaties en credentials blijven onschrijfbaar.
- **claude-sandbox-werkstraat/AC-8** — Supplychaininstellingen en `verifyDepsBeforeRun: error` blijven intact; een
  afwijkende dependency-installatie stopt nog steeds vóór run/exec. Geen installatiereparatie via lokaal `CI=true`.
- **claude-sandbox-werkstraat/AC-9** — Vergelijkbare native Claude-metingen vóór/na noemen runtime/toolchainversies,
  checkoutvorm, opdracht, exitcode, promptaantal en hook-/CI-bewijs. Onuitgevoerde stappen blijven expliciet onbewezen.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Pin ongeldig, exacte versie ontbreekt of runtime wijkt af | stoppen; bestaande setup als herstel | n.v.t. |
| Cloud-mise kan afleiding niet evalueren | implementatie niet opleveren; geen stille upgrade | n.v.t. |
| Huidige branch is main of HEAD is detached | bestaande main-weigering of geen branchpush mogelijk | n.v.t. |
| gh-logcache is al schrijfbaar | geen extra allowWrite toevoegen | n.v.t. |
| Native Git weigert beschermde metadata | blokkade melden; geen brede Git-rechten | n.v.t. |
| Native Claude-proef ontbreekt | geen claim dat de dagelijkse flow werkt | n.v.t. |

## Raakt ook

Implementatie beperkt tot `mise.toml`, `.claude/settings.json`, noodzakelijke bestaande toolchain-/setupcontrole en hun
tests, met gebruiksdocumentatie in `docs/ENVIRONMENT.md` en `docs/operations/agent-doorloop.md`. Wijzig setupscripts
alleen wanneer de versiecontrole dat vereist. Bestaande sandboxtests wijzigen uitsluitend voor het besloten gedrag,
met reden in de PR. Beschermde paden, rolhek uit main, CI en eigenaarmerge blijven gelden; geen nieuw broncodemandaat.

## Buiten scope

Codexinstellingen, modelkeuze, provider/dependencywijzigingen, runner- of netwerkverruiming, nieuwe pijplijn,
projectstore/cache/stateherinrichting, globale pnpm-writes, Git-upstreamregistratie, nieuwe rolheklogica en PR-mergen.

## Testplan

Een aparte tester schrijft eerst falende regressies voor de versieafleiding, settings, negatieve Git-/rolgevallen en
behoud van dependencycontrole. Setupfixtures bewijzen de volgorde, maar vervangen de echte installatieproef niet.
De bouwer controleert gericht; een onafhankelijke reviewer toetst daarna diff, criteria en testinhoud. De hoofdsessie
laat pre-push en volledige CI draaien en wacht met `pr:verify` op echte uitslagen.

Nulmeting: in een gerichte bwrap-proef met alleen eigen tijdelijke opslag schrijfbaar gaf native pnpm 11.28.5 een
SQLite-waarschuwing bij omschakeling en vervolgens 11.28.5 met exit 0; rechtstreeks native 11.28.2 gaf 11.28.2 met
exit 0; die exacte pnpm gaf met `exec prettier --version` in dezelfde proef 3.9.9 met exit 0.
`mise exec -- betterleaks version` gaf 1.9.0 met exit 0. Dit bewijst uitsluitend die probes. Leg vóór en na
implementatie daarnaast AC-9 vast in echte Claude Code-sessies; echte commits/pushes/PR-aanmaak en hooks horen bij
die proef, geen gemockte vervanging of overslaan van controles.

## Open vragen

Geen onbesliste productkeuzes. Compatibiliteit en native uitvoer zijn expliciete bewijsverplichtingen uit AC-1/9,
geen verondersteld behaalde resultaten. De eigenaar besluit met zijn merge; dit voorstel bevat geen implementatie.
