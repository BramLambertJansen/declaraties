---
status: gebouwd # #474
namespace: kooi
---

# Kooi voor destructieve en overgenomen commando's

## Doel

Een commando dat buiten zijn werkmap iets kan verwijderen of overschrijven en dat niet letterlijk voor dit moment is
geschreven, draait in een kooi die de kernel afdwingt; zonder werkende kooi draait het niet
([ADR 0072](../adr/0072-destructief-alleen-in-de-kooi.md)). Aanleiding: het incident van 3 november 2026.

## Rollen en wie wat ziet

n.v.t. — tooling voor tests, scripts en sessies (hoofdsessie en subagents); geen app-gebruikers.

## Datawijzigingen (met grants)

n.v.t. — geen database.

## Routes en foutcodes

n.v.t. — geen routes.

## Kopieer de vorm van

- `scripts/kit/toolchain.mjs` — voorcontrole met een melding die de oplossing noemt
- `eslint.config.js` — een eigen alias van `no-restricted-syntax` per regel, met een melding die de juiste helper noemt
- `test/setup/tmp-root.ts` — de tijdelijke map per testrun

## Hergebruik en UX

n.v.t. — geen UI. Melding zonder bubblewrap: `✗ kooi: bubblewrap ontbreekt; het commando is niet uitgevoerd → installeer
het (scripts/bootstrap.sh lokaal, scripts/cloud-setup.sh in de cloud), zie docs/ENVIRONMENT.md`. Melding bij een mislukte
proef: `✗ kooi: de proef schreef buiten de werkmap; het commando is niet uitgevoerd`.

## Acceptatiecriteria

- **kooi/AC-1** — `scripts/kit/kooi.mjs` exporteert `inKooi(commando, { werkmap, env, timeout })` en is als CLI te starten:
  `node scripts/kit/kooi.mjs --werkmap <map> -- <commando>`. Het commando draait als `bash -c` onder bubblewrap, in deze
  volgorde: `--ro-bind / /`, `--dev /dev`, `--proc /proc`, daarna `/proc/sys`, `/proc/sysrq-trigger`, `/proc/irq` en `/proc/bus`
  weer als `--ro-bind` (een verse `/proc` is voor root schrijfbaar, ook zonder capabilities: een sysctl zoals
  `kernel.core_pattern` toetst alleen de bestandsrechten), `--tmpfs /tmp`, `--tmpfs /run`, `--tmpfs /var/run`, `--tmpfs` over
  de thuismap en over `$XDG_RUNTIME_DIR` van de aanroeper, daarna de toolchain (de installatiemap van mise en de map van
  `node`) weer als `--ro-bind`, en als laatste de werkmap als enige `--bind`; verder `--unshare-all` (geen netwerk),
  `--cap-drop ALL`, `--die-with-parent`, `--new-session` en `--chdir <werkmap>`. De timeout (standaard 30 s) stopt bubblewrap
  met `SIGKILL`; met de proces-namespace stoppen alle kindprocessen mee. Uitslag: `{ status, stdout, stderr }`. De omgeving is
  alleen wat de aanroeper meegeeft plus `PATH`, `HOME=<werkmap>` en `TMPDIR=/tmp`; geen tokens uit de omgeving van de
  aanroeper.
- **kooi/AC-2** — Werkmap. De kooi weigert, vóór het starten, een werkmap die na `realpath` geen echte submap is van
  `os.tmpdir()` (dus niet die map zelf), of die de root van de repository, de thuismap of `/` is of bevat.
- **kooi/AC-3** — Dicht vallen. Zonder `bwrap` op het pad, of als bubblewrap niet start, gooit `inKooi` een fout met de
  melding uit Hergebruik en draait het commando niet. Vóór het eerste commando per proces draait een proef: schrijven binnen
  een proefwerkmap lukt, en schrijven naar `/usr/.kooi-proef` faalt met `Read-only file system` (niet alleen met een
  rechtenfout, die ook zonder kooi zou komen). Faalt de proef, dan draait geen enkel commando in dat proces; een bestand dat
  een mislukte proef toch maakte, ruimt de kooi buiten de kooi op.
- **kooi/AC-4** — Bewijs dat de kooi afschermt, als test in `gate:fast` zonder verwijdercommando's. Kanariebestanden staan
  buiten de werkmap: in de tijdelijke map van de test, in de repository en in de thuismap van de aanroeper. Vanuit de kooi
  proberen afkappen (`: >`) en hernoemen (`mv`) via een absoluut pad, via `../`, via `cd /`, via `$HOME` van de aanroeper en via
  een symlink in de werkmap die naar buiten wijst; na afloop is elk kanariebestand byte-gelijk en op zijn plek. Een kanarie
  die in de kooi zichtbaar is (alleen-lezen) geeft bovendien `Read-only file system`; een kanarie onder een lege map (`/tmp`,
  de thuismap) is in de kooi onzichtbaar. Verder: schrijven naar `/proc/sys/kernel/core_pattern`, `/proc/sys/vm/drop_caches` en onder `/sys` faalt, ook als root; een netwerkverbinding
  faalt; verbinden met een socketbestand dat de test onder `/run` of de thuismap opent, faalt; een bestand in de thuismap van de
  aanroeper is niet leesbaar; `CapEff` en `CapBnd` in `/proc/self/status` zijn 0, voor elke uid; een `sleep 600` stopt bij de
  timeout, met zijn kindprocessen.
- **kooi/AC-5** — Lintregel, met hetzelfde bereik als `CODE` in `eslint.config.js` plus `deploy/` en `*.mjs` in de root,
  behalve `scripts/kit/kooi.mjs`. ESLint weigert: `spawn`, `spawnSync`, `execFile` of `execFileSync`, ook als member-aanroep
  (`cp.spawnSync`), met als eerste argument een letterlijke `bash`, `sh`, `zsh`, `dash` of `ksh` (ook met pad, zoals
  `/bin/sh`) en ergens in de argumentenlijst een optie met `c` (`-c`, `-ec`, `-eu -c`); een eigenschap `shell` met een andere
  waarde dan een letterlijke `false` in elke aanroep van die vier functies; en `exec` of `execSync` uit `child_process` of
  `node:child_process`, via `import`, `import()` of `require`. De melding noemt `inKooi`. Geen uitzonderingslijst en geen
  onderdrukking (R-CODE-04).
- **kooi/AC-6** — Bestaande gevallen. `sh()` in `test/hooks/rolhek-effect.test.ts`, het `sh -c`-fragment uit `compose.yaml`
  in `test/scripts/runner-trusted-base.test.ts` en het `bash -eu -c`-fragment uit `ci.yml` in `test/rails/ci-scan.test.ts`
  draaien via `inKooi`, met dezelfde verwachtingen. `test/hooks/statusregel.test.ts` zoekt `git` op `PATH` zonder shell. Het
  aantal testgevallen verandert niet.
- **kooi/AC-7** — Overal aanwezig. `scripts/doctor.sh` draait de proef van AC-3 (`node scripts/kit/kooi.mjs --proef`) in
  plaats van alleen `bwrap … true`. De job `gate:fast` in `.github/workflows/ci.yml` installeert altijd `bubblewrap` en laadt
  een AppArmor-profiel dat alleen `/usr/bin/bwrap` een user-namespace geeft, vóór `pnpm gate:fast`; de eigenaar pusht die
  workflowwijziging. `docs/ENVIRONMENT.md` noemt bubblewrap als vereiste voor `gate:fast`.
- **kooi/AC-8** — Regels. Het regelboek krijgt in §11 **R-TOOL-03**: een commando dat buiten zijn werkmap kan verwijderen of
  overschrijven en dat niet letterlijk voor dit moment is geschreven (een corpusrij, een fragment uit een bestand, gegenereerd),
  of een destructief experiment, draait alleen via de kooi (`inKooi` of `node scripts/kit/kooi.mjs`); een werkmap als
  afscherming telt niet; dat geldt ook buiten de repository en in een cloudsessie (0072). `AGENTS.md` krijgt die regel als één
  zin onder Repo en grenzen. `Afgedwongen door:` van §11 noemt de lintregel en de kooitest.
- **kooi/AC-9** — Volgorde. De bouw-PR meet eerst of de kooi binnen de sandbox van Claude Code (genest) werkt. Lukt dat niet,
  dan stopt de bouw en komt er eerst een besluit-PR; R-TOOL-02 verandert niet zonder besluit.

## Randgevallen

| Situatie | Gedrag | Foutcode |
|---|---|---|
| Commando in de kooi doet `rm -rf /` | faalt op een alleen-lezen bestandssysteem; alleen de werkmap kan leeg raken | n.v.t. |
| Werkmap is een symlink naar de repository | geweigerd na `realpath` (AC-2) | n.v.t. |
| Kooi binnen de sandbox van Claude Code (genest) | moet werken; lukt het niet, dan stopt de bouw voor een besluit-PR (AC-9) | n.v.t. |
| Cloudsessie zonder bubblewrap | fout met de installatie-instructie, niets uitgevoerd (AC-3) | n.v.t. |
| Commando heeft netwerk nodig | niet via de kooi; een overgenomen commando krijgt geen netwerk | n.v.t. |
| Commando probeert `/var/run/docker.sock` of de Postgres-socket | bestaat niet in de kooi (`--tmpfs /run`, `/var/run`) | n.v.t. |
| Commando leest `~/.config/gh/hosts.yml` | lege thuismap in de kooi | n.v.t. |
| Commando als root schrijft een sysctl (`/proc/sys/…`) | faalt: `/proc/sys` is alleen-lezen in de kooi (AC-1) | n.v.t. |
| Commando loopt vast | timeout; bubblewrap stopt met de aanroeper | n.v.t. |
| Een git-commando in de kooi op de tijdelijke repository | werkt; `.git` ligt in de werkmap | n.v.t. |
| Test heeft de kooi nodig maar bubblewrap ontbreekt | test faalt, wordt nooit overgeslagen | n.v.t. |

## Raakt ook

`scripts/kit/kooi.mjs` (nieuw), `eslint.config.js`, `test/rails/eslint.test.ts`, `test/hooks/rolhek-effect.test.ts`,
`test/scripts/runner-trusted-base.test.ts`, `test/rails/ci-scan.test.ts`, `test/hooks/statusregel.test.ts`, `scripts/doctor.sh`, `.github/workflows/ci.yml` (eigenaar pusht),
`docs/ENVIRONMENT.md`, `docs/framework.md` §11, `AGENTS.md`, spec rolhek-vooraf-krimp (AC-2 draait in de kooi).

## Buiten scope

Projecthooks en sandbox in een cloudsessie laten werken (eigen leerpunt, ADR 0072 punt 6); een tekstanalyse van
commando's vooraf (ADR 0072 Alternatieven); netwerk in de kooi.

## Testplan

`test/scripts/kooi.test.ts`: AC-1 tot en met AC-4 met kanariebestanden buiten de werkmap, zonder verwijdercommando's; de
proef faalt bewust met een kooi zonder `--ro-bind` (R-PRINC-04). `test/rails/eslint.test.ts`: elk verboden patroon van AC-5
geeft een fout (ook `cp.spawnSync`, `-eu -c`, `shell: '/bin/bash'`, `require('child_process').execSync`),
`execFileSync('git', ['-c', …])`, `shell: false` en `RegExp#exec` niet. AC-6: bestaande tests groen via de kooi.

## Open vragen

Geen. OV-1 (geneste sandbox) is beslist in AC-9: meten, en bij falen eerst een besluit-PR.
