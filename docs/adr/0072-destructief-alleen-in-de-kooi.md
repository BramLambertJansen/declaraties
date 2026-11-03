# 0072 — Destructieve en overgenomen commando's alleen in de kooi

Status: geaccepteerd
Herzien: 2026-11-03 (#466): punt 2 (de proef schrijft in een alleen-lezen systeemmap; uitwerking en `/proc/sys` alleen-lezen in de
spec)

Vult [0045](0045-railwerk.md) en [0066](0066-schrijfgrens-op-effect.md) aan; voorwaarde voor bouw-PR 1 van
[0071](0071-rolhek-vooraf-vaste-lijst.md) (corpus op effect). Drempel: A4 (nieuwe bewaking). Uitwerking:
[spec](../specs/kooi.md). Aanleiding: het incident van 3 november 2026, leerpunten #461 en #462.

## Context

Op 3 november 2026 bouwde een cloudsessie een prototype dat de vastgelegde rolhek-testgevallen als echte commando's uitvoerde,
elk in een eigen tijdelijke repository. Daar zitten bewust destructieve commando's tussen (`rm -rf`, `find … -delete`). De
enige afscherming was de werkmap: `cwd` stond op de tijdelijke map. Minstens één commando liep daarbuiten, en de container
draaide als root. Daardoor verdwenen onder andere `/etc`, de werkbestanden van de sessie en de lokale geheugenmap van het
project. De repository op GitHub bleef heel, want er was nog niets gecommit.

Drie dingen maakten dat mogelijk:

- **Een werkmap is geen grens.** Een absoluut pad, `..`, `cd /`, `$HOME`, een glob of een link gaat er zonder moeite uit.
- **In een cloudsessie ontbreekt de lokale grens.** Lokaal draait elk Bash-commando in de sandbox van Claude Code
  (bubblewrap): schrijven buiten de projectmap faalt in de kernel, wat het commando ook is. In de cloudsessie van dit
  incident, en in die van dit besluit, was er geen bubblewrap en draaiden de projecthooks niet: geen `.git/agent-meting`,
  geen `.claude/hooks/.cache`, en schrijven in `/root` lukte. Het rolhek en de sandbox waren daar dus allebei afwezig.
- **Niets in de repository dwingt af hoe een test of script een shellcommando uit data uitvoert.** Vandaag starten vier
  tests een shell met een commandotekst: drie op een tekst die niet letterlijk in de test staat
  (`test/hooks/rolhek-effect.test.ts`, `test/scripts/runner-trusted-base.test.ts` met een fragment uit `compose.yaml`,
  `test/rails/ci-scan.test.ts` met een fragment uit `ci.yml`) en één letterlijk (`test/hooks/statusregel.test.ts`). Het
  corpus van 0071 zou er honderden toevoegen.

## Besluit

1. **Eén kooi.** Een commando dat iets kan verwijderen of overschrijven buiten zijn werkmap en dat niet letterlijk voor dit
   moment is geschreven (een rij uit een corpus, een stuk uit een configbestand, gegenereerd), of een destructief experiment,
   draait alleen via `scripts/kit/kooi.mjs`. De kooi start het commando met bubblewrap: het hele bestandssysteem alleen-lezen,
   één schrijfbare werkmap onder de tijdelijke map van het systeem, een lege `/tmp`, lege `/run` en `/var/run` (geen
   socketbestanden van docker, Postgres of een ssh-agent, want verbinden met een socket lukt ook op een alleen-lezen mount),
   een lege thuismap met alleen de toolchain alleen-lezen erin (geen inloggegevens van `gh`, Claude of de proxy), geen
   netwerk, geen capabilities (ook niet als root), eigen proces- en sessienamespace, en het commando stopt als de aanroeper
   stopt of de tijd op is. De grens ligt in de kernel, niet in een analyse van de commandotekst: wat er ook in de rij staat,
   buiten de werkmap kan het niets veranderen en niets bereiken.
2. **De kooi valt dicht.** Ontbreekt bubblewrap, of lukt de proef niet, dan draait het commando niet en geeft de kooi een fout
   met de oplossing. De proef draait één keer per proces vóór het eerste commando: schrijven binnen de werkmap moet lukken,
   schrijven in een systeemmap moet falen omdat die alleen-lezen is. Een werkmap die geen echte submap van de tijdelijke map is
   (de root van de repository, de thuismap, `/`, een link), weigert de kooi. Een test die de kooi nodig heeft, slaat zichzelf
   nooit over; hij faalt.
3. **Een lintregel houdt shell-uit-data in de kooi.** Buiten `scripts/kit/kooi.mjs` weigert ESLint in code en tests: een
   shell starten met een commandotekst (`bash`, `sh`, `zsh`, `dash` met `-c`, ook via een pad zoals `/bin/sh`), `shell: true`
   (elke waarde behalve een letterlijke `false`) in een `child_process`-aanroep, en `exec`/`execSync` uit `child_process`. De
   drie bestaande gevallen met een tekst uit data gaan over naar de kooi; het letterlijke geval in de statusregeltest krijgt
   een vorm zonder shell. Er komt geen uitzonderingslijst.
4. **Een regel voor de sessie zelf.** Wat een sessie buiten de repository ad hoc draait (een prototype in de scratchpad), ziet
   geen lintregel. Daarvoor komt een regel in het regelboek (§11) en één zin in `AGENTS.md`, het enige bestand dat elke
   runtime laadt, ook een cloudsessie zonder hooks: zo'n commando gaat via de kooi (`node scripts/kit/kooi.mjs`); een werkmap
   als afscherming telt niet.
5. **Overal dezelfde kooi.** Lokaal is bubblewrap er al (`scripts/bootstrap.sh`, de sandbox van Claude Code). De cloud krijgt
   het via `scripts/cloud-setup.sh`, dat het al installeert. CI installeert het in de job van `gate:fast`, met een
   AppArmor-profiel dat alleen `/usr/bin/bwrap` een user-namespace geeft (Ubuntu 24.04 beperkt die standaard); daar draait de
   proef van punt 2 mee, zodat een kooi die niet afschermt CI rood maakt. Die workflowwijziging pusht de eigenaar
   (R-REPO-01). `scripts/doctor.sh` draait dezelfde proef.
6. **De cloud-bevinding wordt een eigen leerpunt.** Dat projecthooks en sandbox in een cloudsessie ontbraken (#462), raakt het hele
   rolhek, niet alleen dit incident. Dit besluit lost dat niet op; het zorgt dat het gevaarlijkste gevolg (overgenomen
   destructieve commando's) ook zonder rolhek en sandbox in een kooi draait.

## Alternatieven

- **Elke corpusrij vooraf toetsen op paden buiten de tijdelijke repository.** Dat is dezelfde tekstanalyse die 0071 juist
  afbouwt omdat ze gaten houdt (globs, links, `node -e`, `find -exec`). Een gemiste vorm is hier geen vals negatief in een
  rapport, maar een gewiste machine.
- **`unshare` met een alleen-lezen remount.** Werkt als root, maar zonder root vraagt het een user-namespace die Ubuntu 24.04
  via AppArmor beperkt, en een recursieve alleen-lezen-mount moet je dan zelf goed krijgen. Bubblewrap doet precies dat, is al
  overal aanwezig en is wat de sandbox van Claude Code zelf gebruikt.
- **Een container (`docker run --read-only`).** `docker` is voor agents uitgesloten (R-TOOL-02) en is in de cloud niet
  aanwezig.
- **Alleen een regel in het regelboek.** Het incident gebeurde terwijl de sessie wist dat de commando's destructief waren.
  Een regel zonder grens in de kernel en zonder lintregel had het niet tegengehouden.

## Gevolgen

- Een kooi-aanroep kost een extra proces (enkele milliseconden op deze repository), de proef één keer per testproces. Het
  groeit met het aantal uitgevoerde commando's, niet met de repository.
- Een machine zonder bubblewrap kan geen kooitests draaien; `gate:fast` is daar rood met de installatie-instructie. Lokaal
  vereist de sandbox van Claude Code bubblewrap al.
- Of bubblewrap binnen de sandbox van Claude Code (genest) werkt, meet de bouw-PR als eerste stap. Lukt dat niet, dan stopt
  de bouw en komt er eerst een nieuwe besluit-PR; dit besluit verandert R-TOOL-02 niet.
- Een opzettelijke omweg (een shell onder een andere naam, `spawn` met een berekende programmanaam) ziet de lintregel niet. De
  regel vangt het ongeluk, niet de tegenstander; de tegenstander houden sandbox, CI en eigenaarmerge tegen.
- Een socketbestand buiten `/run`, `/var/run` en de thuismap (bijvoorbeeld in de repository) blijft bereikbaar; de
  template en de lokale stack leggen daar geen sockets neer.
- De replay van 0071 kan veilig draaien, ook in een cloudsessie als root.
