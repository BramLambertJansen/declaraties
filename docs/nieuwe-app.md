# Nieuwe app vanaf `BramLambertJansen/template` — geautomatiseerde setup

Je bent een coding agent. Dit bestand is jouw instructie, geen documentatie voor de gebruiker. Volg het van boven naar beneden.

De gebruiker is de eigenaar van de nieuwe app: soms technisch, soms zonder enige technische kennis. Hij beslist; jij voert
uit binnen dit bestand. Begeleid volgens [Begeleiding](../START-NIEUWE-APP.md#begeleiding-ook-voor-wie-niet-technisch-is):
kort en zonder jargon, uitleg alleen waar die de volgende stap begrijpelijk maakt; laat de uitleg weg bij een technische gebruiker.

Dit bestand staat in de template als `docs/nieuwe-app.md` en volgt de afspraken in [ADR 0040](adr/0040-template-app-en-grens-core-app.md).
Voor een korte start vóór de app-repo bestaat: [START-NIEUWE-APP.md](../START-NIEUWE-APP.md). Deze instructie hier blijft de enige gedetailleerde setup-procedure.
Werk altijd met de versie op `main` van de template. De gebruiker zet hem zo klaar:
`mkdir -p ~/setup && curl -fsSL https://raw.githubusercontent.com/BramLambertJansen/template/main/docs/nieuwe-app.md -o ~/setup/nieuwe-app.md`,
start `claude` in `~/setup` en zegt: *Volg nieuwe-app.md*.

De machine- en sandboxstappen hieronder beschrijven Claude Code op Ubuntu/WSL2. Stel eerst vast welke runtime werkelijk draait.
Bij een andere agent zijn `.claude/`-hooks geen automatisch actieve grens. Installeer of wissel niet stilzwijgend van agent;
laat de eigenaar de start- en veiligheidsstappen voor die runtime bevestigen. Behoud de bestaande GitHub-, installatie- en
runnerregels en rapporteer precies welke lokale rol- en sandboxgrenzen ontbreken.

## Je doel

Stop als dit allemaal waar is, niet eerder:

1. De machine draait Ubuntu 24.04 (native of WSL2) met systemd, Docker Engine, mise, gh, bubblewrap en socat.
2. Er is een nieuwe GitHub-repo `<owner>/<slug>`, gemaakt met **Use this template**, gekloond naar `~/code/<slug>` — nooit op `/mnt/c`.
3. `main` bevat een merge-commit die de geschiedenis van de template koppelt (`-s ours`), plus één commit die de app hernoemt.
   De eigenaar heeft die zelf gepusht.
4. De repo heeft een ruleset op `main` met verplichte checks en de merge-instellingen uit Fase 6 (of de eigenaar weet waarom dat niet kon).
5. De eigenaar heeft `scripts/bootstrap.sh` gedraaid: toolchain uit `mise.toml`, dependencies en git-hooks (pre-commit, pre-push) staan.
6. De lokale stack draait via `pnpm dev`: Postgres 17 + pgTAP en Mailpit, op poorten die niet botsen met een andere app.
   `scripts/doctor.sh` is groen.
7. De migraties zijn toegepast als `app_migrator`, en je hebt met `psql` bewezen wat Fase 8 noemt.
8. De gekozen agent werkt in `~/code/<slug>`; bij Claude Code zijn VS Code, sandbox en deny-regels volgens Fase 9 gecontroleerd.
   Bij een andere runtime zijn ontbrekende lokale grenzen expliciet met de eigenaar besproken, niet als werkzaam opgevoerd.
9. Je hebt de overdracht uit Fase 10 gestuurd.

## Harde regels

- **Nooit op `/mnt/c`.** De repo staat op ext4 in `~/code/<slug>`. Via 9p is alles tientallen keren trager en file-watching werkt niet.
- **Nooit pushen naar `main`.** De twee setup-commits pusht de eigenaar zelf (Fase 6). Daarna gaat alles via PR. Nooit `--force`, nooit `--no-verify`, nooit mergen.
- **Geen squash bij de template-koppeling.** De `-s ours`-merge en elke latere template-update moeten als echte merge-commit op `main` landen.
  Squash gooit de tweede ouder weg; de volgende `git merge template/main` conflicteert dan op elk bestand.
- **Niets aan de inhoud van de template veranderen** behalve wat Fase 5 noemt. Geen regels "verbeteren", geen bestanden opruimen, geen dependencies toevoegen.
  Zie je iets wat fout lijkt in de template: noteer het voor de overdracht.
- **`.env.local` alleen maken met `cp` uit `.env.example`** en daarna alleen poortnummers vervangen (Fase 7). Geen andere waarden, geen echte geheimen, nooit `.env.example` aanpassen.
- **Geen destructieve commando's.** Nooit `docker compose down -v`, `docker system prune`, `rm -rf` buiten mappen die je in deze run zelf hebt gemaakt, `wsl --unregister`.
- **`wsl --shutdown` alleen in Fase 3.3**, vóór er een stack draait. Draai je zelf in WSL, dan beëindigt het jouw sessie — dan is het een overdracht.
- **Jij installeert geen toolchain en draait geen checks of tests.** `mise install`, `pnpm install`, `lefthook install` en
  `scripts/doctor.sh` draait de eigenaar via `scripts/bootstrap.sh` (Fase 7.2; framework §8: de toolchain installeert de eigenaar, niet de agent).
  Uitzondering: het hernoemscript in fase 5.2 (alleen Node, via `mise exec`).
- **Alleen ontbrekende intake vragen.** Vraag appnaam en een korte beschrijving van doel en doelgroep; herhaal geen al gegeven antwoorden.
  Andere instellingen volgen *Standaardwaarden*, tenzij de eigenaar afwijkt. Productdetails komen pas bij de eerste featurespec.
- **Eén overdracht tegelijk.** Geef terminal of plek, genummerde stappen, het verwachte resultaat en "Typ klaar als dit gelukt is;
  plak bij een fout de melding, zonder geheimen." Stop en wacht. Geef nog geen volgende eigenaarstaak.
- **Klaar is geen bewijs.** Controleer na de reactie de uitkomst. Kun je die niet zelf lezen, vraag de relevante uitvoer of
  waarneming, zonder geheimen. Vink pas daarna af. Bij een fout blijf je bij de huidige fase; herhaal geen geslaagde installatie.
- **Faalt iets:** lees de fout, kijk in de tabel onderaan, zeg in één zin wat je nu probeert. Na twee mislukte pogingen voor hetzelfde: stoppen en melden.

## Taal

Schrijf in het Nederlands. Houd letterlijk in het Engels wat de gebruiker op zijn scherm ziet: knoppen, menupaden,
commando's, paden, productnamen (Use this template, Settings → Rules → Rulesets, Reopen in WSL). *Verder*, *klaar* en *ga door* betekenen: ga door.

## Standaardwaarden (niet vragen)

| Wat | Waarde |
|---|---|
| Template | `BramLambertJansen/template` (public), branch `main` |
| Owner van de nieuwe repo | het account van `gh api user --jq .login` |
| Zichtbaarheid | `public` (voorlopig; private vraagt GitHub Pro of Team voor de ruleset en betaalde code scanning voor CodeQL, zie Fase 6) |
| Map | `~/code/<slug>` |
| Distro (WSL) | `Ubuntu-24.04`; bestaat alleen `Ubuntu` en is dat 24.04, gebruik die |
| Poorten | `54322` (Postgres), `54324` (Mailpit UI), `54325` (SMTP), `8787` (API), `5173` (web); bezet → +10 bij alle vijf tot ze vrij zijn |
| Git-identiteit | bestaande `git config --global`; ontbreekt die: naam en `<id>+<login>@users.noreply.github.com` uit `gh api user` |

Slug: kebab-case van de app-naam, alleen `a-z0-9-`, begint met een letter, maximaal **50** tekens (zoals `scripts/kit/app-init.mjs`). Bestaat `~/code/<slug>` of `<owner>/<slug>` al: controleer eerst of dit een eerder begonnen, aantoonbaar juiste setup uit `SETUP-PROGRESS.md` is. Hervat alleen na verificatie van origin, branch, naam en laatste fase; anders stop en vraag de eigenaar hoe verder. Nooit een repo of map overschrijven.

## Omgeving herkennen

Bepaal één keer en noteer in het voortgangsbestand:

- **WSL-binnen**: `grep -qi microsoft /proc/version` is waar. Je draait in Ubuntu. Root-commando's kosten een sudo-wachtwoord dat jij niet kunt geven
  → schrijf ze in een script en laat de gebruiker `sudo bash <script>` draaien (één overdracht per fase).
- **Windows**: je Bash-tool is PowerShell of Git Bash op Windows. Linux-commando's via `wsl.exe -d <distro> -- bash -lc "<cmd>"`, als root via
  `wsl.exe -d <distro> -u root -- bash -lc "<cmd>"` (geen wachtwoord). Langer dan één regel: schrijf een `.sh` in de WSL-home en draai die.
  `wsl -l -q` geeft UTF-16 met NUL-tekens; filter met `(wsl -l -q) -replace "\0",""` voordat je vergelijkt.
- **Native Ubuntu**: geen Windows-stappen; root-commando's zoals bij WSL-binnen.

In niet-interactieve shells wordt `~/.bashrc` niet geladen. Roep mise daarom altijd aan als `~/.local/bin/mise exec -- <cmd>` (kort: `mise x --`).

## Voortgangsbestand — lees dit eerst, elke keer

De gebruiker moet WSL mogelijk herstarten (Fase 3.3) en komt dan terug met een nieuwe sessie.
Begin elke sessie met `SETUP-PROGRESS.md` naast dit bestand. Bestaat het: lees het, controleer de laatst afgevinkte fase opnieuw, ga verder bij de eerste open fase.
Herschrijf het na elke fase:

```markdown
# Template-setup — voortgang

- App-naam: <naam>
- Korte beschrijving: <doel en doelgroep, door de eigenaar opgegeven>
- Slug: <slug>
- Owner/repo: <owner>/<slug>
- Agent/runtime: <werkelijk gebruikte agent en geverifieerde lokale grenzen>
- Omgeving: wsl-binnen | windows | native — distro: <naam>
- Poorten: PG <p>, Mail-UI <p>, SMTP <p>, API <p>, web <p>
- Publieke app-origin: http://localhost:<web>
- Template-commit: <sha van template/main bij koppeling>

## Fasen

- [ ] 1 — naam, beschrijving en repo-naam vastgelegd
- [ ] 2 — Windows: WSL en .wslconfig
- [ ] 3 — Ubuntu: gereedschap, Docker Engine, herstart
- [ ] 4 — GitHub: ingelogd, template gecontroleerd, repo gemaakt en gekloond
- [ ] 5 — gekoppeld aan template en hernoemd (lokaal)
- [ ] 6 — gepusht door eigenaar, ruleset en instellingen
- [ ] 7 — bootstrap door eigenaar, `pnpm dev` draait, doctor groen
- [ ] 8 — migraties en databasebewijs
- [ ] 9 — VS Code en Claude Code in de repo
- [ ] 10 — overgedragen

## Notities voor de overdracht
- <afwijkingen, fouten in de template, dingen die de eigenaar moet beslissen>
```

---

## Fase 1 — Naam en beschrijving

Lees eerst de opdracht en eventuele voortgang. Gebruik een al gegeven appnaam, beschrijving of repo-naam zonder opnieuw te vragen.
Vraag alleen wat ontbreekt, in één bericht, en wacht:

> Hoe moet de app heten? Geef ook een korte beschrijving: wat doet de app en voor wie?
> Ik leid de repo-naam af van de appnaam. Standaard wordt de repo openbaar (public); de overige instellingen volgen het setup-bestand.
> Wil je een andere repo-naam, eigenaar of zichtbaarheid, zeg het erbij.

Toon appnaam → slug, beschrijving, eigenaar, zichtbaarheid en doelmap kort en schrijf die in het voortgangsbestand.
Vraag alleen een gerichte keuze als iets onduidelijk, ongeldig of bezet is; verzin geen appnaam of domein. Ga bij een
complete intake door met de preflight. Vraag nog geen hostingprovider, volledige backlog of productiegeheimen.

## Fase 2 — Windows (alleen bij WSL)

Sla over bij native Ubuntu.

1. **WSL en distro.** `wsl --status` en `wsl -l -v`. Geen WSL of geen Ubuntu 24.04: overdracht —
   PowerShell als Administrator: `wsl --install -d Ubuntu-24.04`, daarna gebruikersnaam en wachtwoord kiezen, daarna "verder".
   WSL-versie moet 2 zijn (`wsl --set-version <distro> 2`).
2. **`.wslconfig`** in `%UserProfile%`. Voeg onder `[wsl2]` toe wat ontbreekt; bestaande regels laten staan:
   ```ini
   [wsl2]
   networkingMode=mirrored
   ```
   Mirrored zorgt dat `127.0.0.1:<poort>` in WSL en in de Windows-browser hetzelfde is.
3. **Docker Desktop.** Draait Docker Desktop met WSL-integratie voor deze distro, dan botst die met Docker Engine.
   Zie je in WSL `readlink -f "$(command -v docker)"` met `docker-desktop` erin: overdracht —
   Docker Desktop → Settings → Resources → WSL integration → zet de distro uit (of sluit Docker Desktop af), daarna "verder".

Draai je op Windows, dan kun je dit zelf; draai je in WSL, dan zijn 2.2 en 2.3 een overdracht met de exacte tekst.

## Fase 3 — Ubuntu: gereedschap en Docker Engine

### 3.1 Root-script

Inspecteer eerst welke voorwaarden al werken. Op een ingerichte machine sla je installatie en herstart over als de controles
slagen. Is installatie nodig, benoem de ontbrekende onderdelen en volg de eigenaarstappen; installeer niet blind opnieuw.

Schrijf `~/setup/root-setup.sh` en draai het als root (Windows: `-u root`; WSL-binnen/native: overdracht `sudo bash ~/setup/root-setup.sh`).
Vervang `<user>` door de gewone gebruiker (`whoami` buiten root).

```bash
#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update
# git/curl/jq: basis; bubblewrap+socat: sandbox van Claude Code (failIfUnavailable in .claude/settings.json);
# postgresql-client: alleen voor het bewijs in Fase 8.
apt-get install -y ca-certificates curl git jq unzip bubblewrap socat postgresql-client

install -m 0755 -d /etc/apt/keyrings

# Docker Engine (geen Docker Desktop) — docs.docker.com/engine/install/ubuntu
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

# GitHub CLI
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  > /etc/apt/sources.list.d/github-cli.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin gh
usermod -aG docker <user>
systemctl enable docker 2>/dev/null || true

# Vite/Vitest watchers (framework §11)
echo 'fs.inotify.max_user_watches=524288' > /etc/sysctl.d/60-inotify.conf
sysctl --system >/dev/null

# Alleen WSL: systemd aan (nodig voor Docker Engine). Bestaande [boot]/[user]-regels blijven staan.
if grep -qi microsoft /proc/version; then
  touch /etc/wsl.conf
  if ! grep -q '^systemd=true' /etc/wsl.conf; then
    if grep -q '^\[boot\]' /etc/wsl.conf; then sed -i '/^\[boot\]/a systemd=true' /etc/wsl.conf
    else printf '\n[boot]\nsystemd=true\n' >> /etc/wsl.conf; fi
  fi
fi
echo "root-setup klaar"
```

### 3.2 Gebruikersgereedschap (als gewone gebruiker, geen root)

De installatieregel voor Claude Code geldt alleen wanneer dat de gekozen runtime is en de CLI ontbreekt. Sla die regel bij
een andere agent over; bevestig diens bestaande installatie en veiligheidsstappen met de eigenaar, zonder van agent te wisselen.

```bash
curl -fsSL https://mise.run | sh                       # ~/.local/bin/mise
grep -q 'mise activate bash' ~/.bashrc || echo 'eval "$(~/.local/bin/mise activate bash)"' >> ~/.bashrc
command -v claude >/dev/null || curl -fsSL https://claude.ai/install.sh | bash   # Claude Code in WSL, voor Fase 9
mkdir -p ~/code
```

### 3.3 Herstart (één keer)

- **WSL, jij draait op Windows:** `wsl --shutdown`, wacht 8 seconden, ga door.
- **WSL, jij draait in WSL:** schrijf eerst het voortgangsbestand, dan overdracht:
  > 1. Open PowerShell en voer uit: `wsl --shutdown`
  > 2. Open Ubuntu opnieuw, `cd ~/setup` en start `claude`.
  > 3. Typ: *verder met nieuwe-app.md*
- **Native:** geen herstart; gebruik tot de volgende login `sg docker -c "<cmd>"` voor docker-checks en zeg de gebruiker dat hij één keer uit- en inlogt.

### Controle

Alles moet slagen; anders de tabel onderaan.

```bash
ps -p 1 -o comm=                          # systemd   (alleen WSL)
docker run --rm hello-world               # "Hello from Docker!"
docker compose version                    # v2.x
readlink -f "$(command -v docker)"        # /usr/bin/docker, niets met docker-desktop
~/.local/bin/mise --version
gh --version; bwrap --version; socat -V | head -1; psql --version
sysctl -n fs.inotify.max_user_watches     # 524288
pwd                                        # nooit /mnt/c/...
```

`docker` gebruik je in deze setup alleen voor `hello-world`. De app-stack is van de eigenaar (Fase 7).

## Fase 4 — GitHub en de nieuwe repo

### 4.1 Inloggen

`gh auth status`. Niet ingelogd of scope `workflow` ontbreekt: overdracht —

> 1. Voer in je Ubuntu-terminal uit: `gh auth login --hostname github.com --git-protocol https --web --scopes workflow`
> 2. Kopieer de code, druk Enter, plak de code in de browser, klik **Authorize**.
> 3. Typ *klaar*.

Daarna zelf: `gh auth setup-git`. `workflow` is nodig omdat jij (de eigenaar) later template-updates met `.github/workflows/` pusht.
Let op: tot de GitHub App voor de agent bestaat (ADR 0039 punt 8), draait Claude Code als dezelfde WSL-gebruiker en gebruikt dus deze login,
inclusief `workflow`. De grens is dan de ruleset en jouw review (framework §6, Agentveiligheid). Zeg dat in de overdracht van Fase 10.
Zet de git-identiteit volgens *Standaardwaarden* als die ontbreekt.

### 4.2 Template controleren

```bash
gh api repos/BramLambertJansen/template --jq '{is_template, visibility, default_branch}'
gh api repos/BramLambertJansen/template/commits/main --jq .sha
```

- `is_template` is `false`: overdracht — vraag toestemming en voer dan uit `gh repo edit BramLambertJansen/template --template`
  (gelijk aan Settings → **Template repository**). Zonder dat vinkje kan **Use this template** niet.
- Noteer de sha in het voortgangsbestand. Verschilt `docs/nieuwe-app.md` op `main` van het bestand dat je volgt:
  `curl` het opnieuw (zie de kop), meld het en begin bij de eerste open fase.

### 4.3 Repo maken en klonen

```bash
cd ~/code
gh repo create <owner>/<slug> --<zichtbaarheid> --template BramLambertJansen/template --clone   # --public, tenzij de eigenaar anders koos
cd <slug>
```

GitHub maakt de repo uit een template asynchroon. Is `git log` leeg of mislukt de clone:
wacht 5 seconden, `git pull origin main` (of opnieuw `gh repo clone <owner>/<slug>`), maximaal drie keer.

Controle: `git log --oneline` toont één commit; `ls` toont `AGENTS.md`, `compose.yaml`, `db/`, `docs/`; `pwd` is `/home/<user>/code/<slug>`.

## Fase 5 — Koppelen aan de template en hernoemen (lokaal, nog niet pushen)

### 5.1 Koppelen

"Use this template" maakt een nieuwe geschiedenis zonder band met de template. Leg die band één keer:

```bash
git remote add template https://github.com/BramLambertJansen/template.git
git remote set-url --push template DISABLED   # nooit per ongeluk naar de template pushen
git fetch template
# Harde voorwaarde: de nieuwe repo en template/main moeten exact dezelfde Git-tree hebben.
# Als de template sinds 'Use this template' is gewijzigd, zou -s ours dat verschil stilzwijgend verbergen.
created_tree=$(git rev-parse 'HEAD^{tree}')
template_tree=$(git rev-parse 'template/main^{tree}')
if [ "$created_tree" != "$template_tree" ]; then
  echo 'STOP: broninhoud van de nieuwe repo wijkt af van template/main; koppel nog niet.' >&2
  echo "App-tree: $created_tree; template-tree: $template_tree" >&2
  exit 1
fi
# Alleen bij overeenkomende tree en een nieuwe, nog niet gekoppelde repo:
git merge --allow-unrelated-histories -s ours template/main \
  -m "chore: link to template ($(git rev-parse --short template/main))"
```

`-s ours` houdt de inhoud van de app en registreert de template als voorouder. Daarna haalt `git merge template/main` alleen nieuwe template-commits binnen.
Controle: noteer de gekoppelde volledige `template/main` SHA en beide tree-ID's in het voortgangsbestand. `git log --oneline --graph -5` toont een merge met twee ouders; `git diff HEAD~1 --stat` is leeg. **Bij een treeverschil:** niet mergen, niet de inhoud weggooien en niet heimelijk de templateversie als verwerkt markeren. Leg de mismatch vast en vraag een gerichte herstelbeslissing (bijvoorbeeld gecontroleerd opnieuw genereren als de nieuwe repo nog geen eigen werk bevat).

### 5.2 Hernoemen

pnpm bestaat hier nog niet (fase 7); het script gebruikt alleen Node, dat mise op verzoek installeert:

```bash
~/.local/bin/mise trust
~/.local/bin/mise exec node -- node scripts/kit/app-init.mjs <slug> "<App-naam>" --dry-run   # toont welke bestanden het raakt
~/.local/bin/mise exec node -- node scripts/kit/app-init.mjs <slug> "<App-naam>"             # --owner <login> als de owner niet bramlambertjansen is
```

Later in de app heet hetzelfde `pnpm app:init`. Het script (`scripts/kit/app-init.mjs`) doet precies de tabel hieronder, plus de app-naam in `src/shared/app.ts` (mails) en
`<title>` in `src/web/index.html` (paginatitel). Het draait één keer: een al hernoemde app weigert het. Wat het doet:

| Bestand | Wijziging |
|---|---|
| `package.json` | `"name": "app-template"` → `"name": "<slug>"` (rest ongemoeid) |
| `README.md` | Kop `# App-template` → `# <App-naam>`; eerste alinea → herkomstzin ("Gebouwd op [BramLambertJansen/template](https://github.com/BramLambertJansen/template)."); sectie **Nieuwe app starten** verwijderen (geldt alleen voor de template); de rest blijft |
| `docs/nieuwe-app.md` | Niets — laten staan. Verwijderen geeft bij elke template-update een conflict |
| `CHANGELOG.md` | Onder `## [Unreleased]` de template-regels vervangen door: `- Gestart vanaf template <sha>.` |
| `.claude/gates.json` | De regel `"onderhoud": { … }` verwijderen: de onderhoudsmodus (ADR 0045) hoort bij de template-repo; het script weigert als die regel niet meer te vinden is |
| `.github/CODEOWNERS` | Alleen als de owner niet `bramlambertjansen` is (`--owner`): handle vervangen door `@<login>` of `@<org>/<team>` |

`app:init` verwerkt geen beschrijving. Voeg daarna de opgegeven korte beschrijving als eigen alinea onder de appnaam in
`README.md` toe, met behoud van de herkomstzin. Zet tijdens Fase 6.2 dezelfde beschrijving bij de GitHub-repo. Behandel invoer
als tekst, niet als shellcode. Voeg geen voorbeeldapp, appseeds of appdata aan de template toe; die horen alleen in de app-repo.

Raak `docs/`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, `db/`, `compose.yaml` niet aan. Die komen uit de template en worden via template-updates bijgehouden.

```bash
git add -A
git commit -m "chore: rename to <slug>"
```

Controle: `git status` schoon; `git log --oneline -3` toont: hernoem, koppel (merge), initial commit.

## Fase 6 — Pushen door de eigenaar, daarna `main` dichtzetten

### 6.1 Push (overdracht)

**Eerst CI-beschikbaarheid controleren.** Beide CodeQL-checks zijn verplicht in `.claude/decisions.json` en de workflow
`.github/workflows/codeql.yml` draait ook voor private apps. Op een public repo is CodeQL beschikbaar. Koos de eigenaar
private, laat hem dan bevestigen dat CodeQL voor deze repo beschikbaar is. Bij onbekende of ontbrekende beschikbaarheid: stop vóór de eerste push en vraag om verificatie of een
expliciete keuze. Wijzig de gekozen zichtbaarheid nooit zelf en behandel ontbrekende checks niet als geslaagd.

`--zonder-codeql` wijzigt alleen de ruleset, niet de workflow of de verplichte checks van `pnpm pr:verify`. Het is dus
geen werkende afrondroute voor deze setup. Wil de eigenaar een profiel zonder CodeQL, dan vraagt dat eerst een
appspecifiek ADR en een samenhangende aanpassing van workflow, ruleset en verificatieregister. Tot die route gebouwd
en gecontroleerd is, blijft de setup hier open; een overdrachtsnotitie alleen lost dit niet op.

> Ik heb twee commits lokaal klaargezet: de koppeling met de template (merge-commit) en de hernoeming.
> Agents pushen nooit naar `main`, dus dit doe jij, één keer:
> 1. `cd ~/code/<slug> && git log --oneline --graph -4` — controleer dat je een merge en een hernoem-commit ziet.
> 2. `git push origin main`
> 3. Typ *klaar*.

Controle: `git status -sb` toont geen `ahead`; `gh api repos/<owner>/<slug>/commits/main --jq '.parents | length'` is `1` (hernoem-commit) en
`gh api repos/<owner>/<slug>/commits/main~1 --jq '.parents | length'` is `2`.

### 6.2 Repo-instellingen

"Use this template" kopieert geen instellingen of rulesets. Zet de basis nu, vóór er een PR bestaat.

```bash
R=<owner>/<slug>
# Merge-commit aan: nodig voor template-updates. Squash aan: gewone feature-PR's. Rebase uit.
gh repo edit "$R" --enable-merge-commit --enable-squash-merge --enable-rebase-merge=false \
  --delete-branch-on-merge --enable-auto-merge=false

# Actions: workflows alleen lezen, mogen geen PR's goedkeuren, acties op volledige SHA.
gh api -X PUT "repos/$R/actions/permissions/workflow" -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
gh api -X PUT "repos/$R/actions/permissions" -F enabled=true -f allowed_actions=all -F sha_pinning_required=true
```

Zet de korte beschrijving uit de intake met `gh repo edit "$R" --description "<korte beschrijving>"` en controleer die via
`gh repo view "$R" --json description`. Quote de werkelijke waarde veilig; voer geen shellcode uit de beschrijving uit.

**Ruleset op `main` (overdracht).** `scripts/github-ruleset.sh` zet de ruleset `main` volgens framework §10: geen delete of force push,
PR-plicht, opgeloste reviewgesprekken, merge en squash, en de verplichte checks uit `.github/workflows/` (`gate:fast`, `gate:slow`,
`secrets`, `image`, `check:new-resource`, `codeql (actions)`, `codeql (javascript-typescript)`, `osv-scanner`, alle van GitHub Actions). Dat is `main-dicht` van de template plus opgeloste gesprekken en `codeql (javascript-typescript)`.
`test/scripts/github-ruleset.test.ts` houdt de lijst gelijk aan de workflows. Opnieuw draaien werkt de bestaande ruleset bij.
Het script schrijft naar GitHub met de login van de eigenaar; jij draait het niet.

> 1. `cd ~/code/<slug> && scripts/github-ruleset.sh <owner>/<slug>`
> 2. Typ *klaar*, of plak de uitvoer als er een ✗ staat.

Controleer de werkelijke ruleset en de checknamen. De CI-beschikbaarheidscontrole uit 6.1 blijft van kracht; laat geen
verplichte checks weg om deze stap groen te krijgen.

Waarom 0 goedkeuringen en geen code-owner-review: zolang de agent nog onder het account van de eigenaar pusht, is de eigenaar ook de PR-auteur,
en GitHub laat je je eigen PR niet goedkeuren. Zodra de GitHub App voor de agent bestaat (roadmap ST-01, ADR 0039 punt 8), gaan beide aan.
De diff-guard (`guard.yml`) is tot dan geen verplichte check (ADR 0045 punt 17). Zet dat in de overdracht.

Geplande inrichting van de App (**nog niet gebouwd**, roadmap ST-01; het besluit is ADR 0045 punt 19):

- Rechten: `contents: write`, `pull_requests: write`, `issues: write` (labels, commentaar), `metadata: read`, `checks: read`,
  `actions: read`. Geen `workflows`, `administration` of `secrets`. De App staat niet in `goedkeurders` (`.claude/gates.json`),
  dus een goedkeuring door de App telt niet.
- Sleutel buiten de repo (`~/.config/template-agent/app.pem`, modus 600), nooit leesbaar in de sandbox. Een token van één uur
  via een script zonder dependency (`node:crypto`, JWT RS256) dat als git-credential-helper en als `GH_TOKEN` dient; dat script
  komt in de App-PR.
- Met de App: de ruleset met code-owner-review en 1 goedkeuring, en de diff-guard als verplichte check.

Weigert de API iets:
- ruleset op een private repo zonder Pro/Team → het script meldt het en stopt; meld de keuze aan de eigenaar (Pro, organisatie met Team, of public). Wijzig zelf de zichtbaarheid niet.
- `sha_pinning_required` onbekend → meld: Settings → Actions → General → **Require actions to be pinned to a full-length commit SHA**.

Controle: `gh api repos/$R/rulesets --jq '.[].name'` toont `main`; `gh repo view $R --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed`.
Niets controleert daarna nog of de ruleset blijft staan: `check-github` bestaat nog niet (roadmap ST-01).

## Fase 7 — Toolchain, git-hooks en lokale stack

Jij maakt `.env.local` (7.1); de eigenaar installeert de toolchain (7.2) en start de stack (7.3). Zonder 7.2 heeft de app geen
pre-commit en pre-push, en is de afdwinging lokaal zwakker dan in de template.

### 7.1 Poorten en `.env.local`

```bash
ss -ltnH | awk '{print $4}' | grep -E ':(54322|54324|54325|8787|5173)$' || echo vrij
```

Bezet (meestal een andere app): tel 10 op bij **alle vijf** en controleer de nieuwe kandidaten opnieuw. Stop nooit een andere
app om poorten vrij te maken. API en Vite mogen niet op de oude poorten blijven staan terwijl alleen database en mail verschuiven.
Leg de vijf gekozen poorten en de bijbehorende publieke app-origin vast in de voortgang. Maak daarna voor een nieuwe app:

```bash
cp -n .env.example .env.local
```

Pas uitsluitend de poortvelden en bijbehorende URL-poorten aan; vervang niet blind ieder voorkomen van een getal in het bestand.
Deze samenhang is verplicht, ook als de API- en webpoort nog niet als aparte variabele in het voorbeeld staan:

| Instelling in de nieuwe app | Waarde |
|---|---|
| `PG_PORT` en de poort in `DATABASE_URL`, `AUTH_DATABASE_URL`, `MIGRATOR_DATABASE_URL` | gekozen PG-poort |
| `MAIL_UI_PORT` | gekozen Mailpit-UI-poort |
| `SMTP_PORT` en de poort in `SMTP_URL` | gekozen SMTP-poort |
| `API_PORT` | gekozen API-poort; voeg de variabele toe als die ontbreekt |
| `WEB_PORT` | gekozen webpoort; voeg de variabele toe als die ontbreekt |
| `APP_ORIGIN` en `AUTH_BASE_URL` | beide exact `http://localhost:<web>` |

Behoud protocol, host, gebruikersnaam, wachtwoord en databasepad van de lokale voorbeeld-URL's. Lees of toon geen geheimen
om poorten te controleren. Bestond `.env.local` al, overschrijf hem niet: bevestig eerst de vastgelegde poorten van die app;
bij een afwijkende bestaande configuratie vraag je de eigenaar om de beperkte poortaanpassing. De agent verandert geen andere waarden.
`pnpm dev` maakt een ontbrekend bestand met standaardpoorten; daarom is deze stap vóór het starten nodig.

### 7.2 Toolchain en git-hooks (overdracht)

`scripts/bootstrap.sh` doet `mise trust`, `mise install` (Node, pnpm, dbmate, Betterleaks, osv-scanner uit `mise.toml`),
`pnpm install --frozen-lockfile`, `pnpm exec lefthook install` (pre-commit en pre-push uit `lefthook.yml`) en daarna `scripts/doctor.sh --machine`.
Deze installatiecontrole vereist de toolchain, sandbox, Docker en git-hooks, maar nog geen draaiende appdiensten.

> De toolchain installeer jij, niet ik (framework §8):
> 1. Open een nieuwe Ubuntu-terminal (dan is `mise activate` uit `~/.bashrc` geladen) en `cd ~/code/<slug>`.
> 2. `scripts/bootstrap.sh`
> 3. De machinecontrole moet zonder fouten eindigen. Bij een ✗ of een foutcode: plak de uitvoer hier; ga nog niet verder.
> 4. Typ *klaar*.

Controle (jij): `test -x .git/hooks/pre-commit && grep -q lefthook .git/hooks/pre-commit && echo hooks-ok` en `ls -d node_modules`.

### 7.3 Stack starten (overdracht)

De template laat de agent geen Docker gebruiken; de stack is van de eigenaar. `pnpm dev` (`scripts/dev.mjs`) start compose met
`--env-file .env.local` (Postgres 17 + pgTAP, Mailpit), draait de migraties als `app_migrator` (`scripts/db-migrate.sh`), de seed
(`scripts/seed.mjs`), en daarna Hono en Vite. Het compose-project heet naar de map, dus elke app heeft een eigen volume.

> 1. `cd ~/code/<slug> && pnpm dev` en laat die terminal open
>    (eerste keer 1–3 minuten: het Postgres-image met pgTAP wordt gebouwd).
> 2. In een tweede terminal: `cd ~/code/<slug> && scripts/doctor.sh` — alles ✓.
> 3. Typ *klaar*, of plak de laatste regels als het faalt.

De volledige doctor blijft hier verplicht en controleert ook de vier draaiende appdiensten. Gebruik `--machine` of de
diagnostische `--quick` niet als vervanging voor die eindcontrole. De browser/login/MFA-controle volgt in Fase 9.

### Controle (jij, zonder docker)

```bash
timeout 2 bash -c 'exec 3<>/dev/tcp/127.0.0.1/<pg>' && echo pg-ok
curl -fsS http://127.0.0.1:<mailui>/api/v1/info | jq -r .Version     # v1.31.4 (compose.yaml)
psql "postgres://app_migrator:app_migrator@127.0.0.1:<pg>/app" -Atc "select current_user"   # app_migrator
```

## Fase 8 — Migraties en databasebewijs

`pnpm dev` heeft de migraties al gedraaid. Moeten ze opnieuw zonder de rest van de stack, dan draait de eigenaar in zijn terminal
`pnpm db:migrate` (`scripts/db-migrate.sh`, dbmate uit `mise.toml`; het script roept `mise` aan, dat in jouw niet-interactieve shell niet op `PATH` staat). Draai dbmate nooit los of met `pnpm dlx`: het script is het enige pad, met `MIGRATOR_DATABASE_URL` (ADR 0042).

Bewijs met `psql` (`M=postgres://app_migrator:app_migrator@127.0.0.1:<pg>/app`, `A=postgres://api_user:api_user@127.0.0.1:<pg>/app`):

| Bewering | Commando | Verwacht |
|---|---|---|
| Alle migraties toegepast | `psql "$M" -Atc "select count(*) from schema_migrations"` | gelijk aan `ls db/migrations/*.sql \| wc -l` |
| Schema's bestaan | `psql "$M" -Atc "select string_agg(nspname, ',' order by nspname) from pg_namespace where nspname in ('app','better_auth','tap')"` | `app,better_auth,tap` |
| Migrator is geen superuser (RLS geldt ook voor hem) | `psql "$M" -Atc "select rolsuper from pg_roles where rolname = current_user"` | `f` |
| `api_user` ziet zonder rolwissel niets | `psql "$A" -Atc "select app.current_user_id()"` | `ERROR: permission denied for schema app` |
| Met `SET LOCAL ROLE` wel, zonder gebruiker | `psql "$A" -At -c begin -c "set local role app_authenticated" -c "select coalesce(app.current_user_id(), '<null>')" -c rollback` | `<null>` |
| Rolwissel blijft niet hangen | `psql "$A" -At -c begin -c "set local role app_authenticated" -c commit -c "select current_user"` | `api_user` |

Een afwijking is een bevinding over de template, geen setupfout: niet repareren, noteren voor de overdracht.

## Fase 9 — VS Code en Claude Code in de repo

Deze stappen gelden voor Claude Code. Bij een andere runtime bevestigt de eigenaar hoe die in de app-repo start en welke
lokale beveiliging daadwerkelijk werkt. Gebruik de Claude-stappen niet als bewijs voor een andere runtime; laat een
onuitvoerbare controle expliciet open en schakel geen bestaande grens uit om hem alsnog te laten slagen.

Overdracht:

> 1. In je Ubuntu-terminal: `code ~/code/<slug>` — VS Code opent met **WSL: Ubuntu-24.04** linksonder.
>    (Eerste keer: VS Code installeert de VS Code Server; vraagt hij om de **WSL**-extensie, klik **Install**.)
> 2. Open de terminal in VS Code (**Terminal → New Terminal**) en start `claude`.
> 3. Start Claude Code niet, of zie je een sandbox-fout: plak de melding hier.
> 4. Typ in die nieuwe sessie: *Voer `docker ps` uit en lees `.env.local`.* Beide moeten geweigerd worden.
> 5. Laat VS Code met die sessie open, kom hier terug en typ *klaar*.

Waarom: `.claude/settings.json` van de template zet de sandbox aan met `failIfUnavailable: true` en weigert `docker *` en het lezen van `.env.*`.
Werkt de sandbox niet, dan start de agent in deze repo niet — liever nu dan bij de eerste taak.

Alleen bij WSL: `ls -la ~/code/<slug>` moet `/home/...` zijn; staat VS Code op `\\wsl$`-paden vanuit Windows geopend, dan opnieuw via stap 1.

### Browser- en logincontrole (elke runtime)

Een luisterende poort of groene doctor bewijst geen werkende login. Open de app op de `APP_ORIGIN` die `pnpm dev` toont;
haal geen geheimen uit `.env.local`. Gebruik voor de lokale rooktest de bestaande rolwisselaar uit de
[README](../README.md#lokaal-draaien), zonder nieuwe demoaccounts of domeindata te verzinnen.

Controleer dat de ingelogde startpagina en het adminscherm voor de passende rol openen en dat uitloggen teruggaat naar
de inlogpagina. De rolwisselaar bewijst geen wachtwoord-/MFA-login. Controleer die afzonderlijk met de bestaande lokale
accounts volgens de README, of laat de eigenaar dat doen zonder wachtwoord of TOTP-geheim te delen. Voor een eigen
beheerder volgt de eigenaar het [beheerdersrunbook](operations/eerste-admin.md), niet een nieuw herstelpad.

Heb je geen browsertoegang, draag alleen deze stap over met de app-URL, de flow en de verwachte schermen:

> Open de app op het getoonde adres, controleer aanmelden, de startpagina en uitloggen.
> Controleer voor de beheerder ook de vereiste tweestapsverificatie en het adminscherm.
> Typ klaar als dit gelukt is; beschrijf bij een fout de stap en melding, zonder inloggegevens.

Leg per controle vast wie hem uitvoerde en wat werkelijk is waargenomen. Een niet-uitgevoerde login- of MFA-controle
blijft open en wordt in de overdracht genoemd; claim dan niet dat de setup volledig gecontroleerd is.

## Fase 10 — Overdracht

Schrijf het voortgangsbestand af en stuur één bericht, ongeveer zo:

> **<App-naam> staat klaar** in `~/code/<slug>` → github.com/<owner>/<slug>.
> Draait: Postgres 17 + pgTAP op 127.0.0.1:<pg>, Mailpit op http://127.0.0.1:<mailui>. Migraties toegepast, rollen bewezen.
> API: http://localhost:<api>; web en beide origins: http://localhost:<web>.
> Afgedwongen zoals in de template: git-hooks (pre-commit: format, lint, secrets; pre-push: `pnpm gate:fast`), de hooks, sandbox en
> permissies van Claude Code (`.claude/`), CI (`gate:fast`, `gate:slow`, `secrets`, `image`, `check:new-resource`, CodeQL, osv-scanner)
> en de ruleset op `main` met die checks verplicht, uitsluitend voor zover hierboven werkelijk gecontroleerd.
> Browser/login/MFA: <uitvoerder en uitslag, of niet uitgevoerd met reden>.
>
> **Wat er nog níet is:** de GitHub App voor de agent (roadmap ST-01, ADR 0039 punt 8; geplande inrichting in 6.2) — tot dan pusht de agent onder jouw account, met jouw
> `gh`-login inclusief `workflow`, en is de diff-guard (`guard.yml`) geen verplichte check; `check-github`, dat controleert of de
> ruleset blijft staan (ST-01). Herbruikbare templateverbeteringen horen in de template.
> Een eventuele ST-09-proef en alle appfunctionaliteit, appspecificaties en appgegevens horen in de **aparte app-repo**;
> alleen generieke verbeteringen en beknopt bewijs komen terug naar de template.
>
> **Dagelijks:** `pnpm dev` (stack, migraties, API en web); de containers stoppen met `docker compose stop`. `scripts/doctor.sh` bij twijfel.
> Nooit `down -v` tenzij je de database kwijt wilt.
>
> **Template-updates binnenhalen:** zie hieronder. Altijd **Create a merge commit**, nooit squash.
>
> **Later aanzetten:** goedkeuring en code-owner-review in de ruleset, en de diff-guard als verplichte check, zodra de agent via de GitHub App pusht.
> CodeQL: <beschikbaarheid en beide verplichte checks gecontroleerd, of setup nog geblokkeerd bij Fase 6.1>.
>
> **Bevindingen:** <notities uit het voortgangsbestand, of "geen">

Sluit af met: "De setup is afgerond voor zover hierboven bewezen; dit staat nog open." Geef daarna de openingsopdracht
voor de Claude-sessie die de eigenaar in Fase 9 in de app-map startte, kopieerbaar en met de werkelijke paden:

> Dit is mijn nieuwe app <App-naam>. Lees `~/setup/SETUP-PROGRESS.md` (de overdracht van de setup) en de
> projectinstructies. Controleer dat je in `~/code/<slug>` werkt. Leg kort uit wat er al staat en help me de eerste
> functionaliteit te bedenken. Begin nog niet met bouwen voordat we het doel hebben besproken.

Zeg erbij dat Claude toestemming vraagt om dat bestand buiten de app-map te lezen, en dat de eigenaar die mag geven.
Zet het voortgangsbestand niet in de app-repo. Stop daarna met de setup: featurewerk gebeurt in die nieuwe sessie, volgens
de eigen regels van de app. Een antwoord "klaar" op de vorige eigenaarstaak is geen opdracht om features te bouwen.

---

## Naslag: template-updates naar de app

Door de eigenaar, of door de agent tot en met de PR:

```bash
cd ~/code/<slug>
git fetch template
git switch -c chore/template-$(git rev-parse --short template/main) origin/main
git merge template/main                # conflicten: app-specifiek behouden, regels uit de template overnemen
git push -u origin HEAD
gh pr create --fill --title "chore: template-update $(git rev-parse --short template/main)"
```

De eigenaar merget met **Create a merge commit**. Zit er een wijziging in `.github/workflows/` in, dan pusht de eigenaar de branch (de agent heeft geen `workflows`-recht).

App-eigen ADR's: begin bij `0100` (`docs/adr/0100-…`). `0001`–`0099` zijn van de template; zelfde nummers in de app geven bij een update een conflict (ADR 0040 punt 4).

## Fout → oorzaak

| Je ziet | Oorzaak | Doe |
|---|---|---|
| `pwd` begint met `/mnt/c` | Gestart vanuit een Windows-map | `cd ~/code/<slug>`; nooit daar klonen |
| `ps -p 1` geeft `init`, niet `systemd` | `wsl.conf` niet toegepast | `/etc/wsl.conf` controleren, opnieuw `wsl --shutdown` |
| `permission denied … /var/run/docker.sock` | Groep `docker` nog niet actief | WSL herstarten of opnieuw inloggen; tijdelijk `sg docker -c "…"` |
| `docker` wijst naar `docker-desktop` | WSL-integratie van Docker Desktop aan | Fase 2.3 |
| `Cannot connect to the Docker daemon` | Docker-service draait niet | `sudo systemctl start docker` (overdracht) |
| `mise ERROR … not trusted` | Nieuwe map, `mise.toml` niet vertrouwd | `mise trust` in de repo |
| `node: command not found` na `mise install` | `.bashrc` niet geladen | `mise exec -- …`, of nieuwe terminal |
| Clone is leeg / `couldn't find remote ref main` | Template-generatie nog bezig | 5 s wachten, opnieuw (max 3×) |
| `Use this template` ontbreekt / `is not a template repository` | Vinkje Template repository uit | Fase 4.2 |
| `refusing to merge unrelated histories` | `--allow-unrelated-histories` vergeten | Commando uit 5.1 exact gebruiken |
| Template-update conflicteert op alles | Koppeling of eerdere update is gesquasht | Opnieuw koppelen met `-s ours` op een branch, mergen als merge-commit |
| `Upgrade to GitHub Pro or make this repository public` | Rulesets op private repo vereisen Pro/Team | Melden, eigenaar kiest |
| `port is already allocated` | Andere app of oude stack op die poort | Fase 7.1 met +10; nooit een andere stack stoppen zonder vragen |
| Andere poort in `.env.local` maar stack gebruikt 54322 | Stack met losse `docker compose` gestart, zonder `--env-file .env.local` | Stoppen en starten met `pnpm dev` (geeft de vlag mee) |
| `dependency failed to start: container … is unhealthy` | `db/init` faalt, of volume van een oudere poging | `docker compose --env-file .env.local logs postgres` laten plakken; oud volume alleen met toestemming weggooien |
| `role "app_migrator" does not exist` | Volume bestond al vóór `db/init` (init draait alleen op een leeg volume) | Eigenaar beslist: `docker compose down -v` en opnieuw — vernietigt die database |
| dbmate `permission denied for database app` | Gedraaid als verkeerde rol | Alleen via `pnpm db:migrate` / `scripts/db-migrate.sh` (gebruikt `MIGRATOR_DATABASE_URL`) |
| `doctor.sh`: ✗ git-hooks ontbreken | `scripts/bootstrap.sh` niet (helemaal) gedraaid | Eigenaar draait `scripts/bootstrap.sh` opnieuw (Fase 7.2) |
| `mise: command not found` in een script | Niet-interactieve shell zonder `mise activate` | Eigenaar draait het in een nieuwe terminal; jij gebruikt `~/.local/bin/mise exec --` |
| Claude Code: sandbox niet beschikbaar / `bwrap: … Permission denied` | `bubblewrap`/`socat` ontbreekt, of AppArmor beperkt user namespaces (`sysctl kernel.apparmor_restrict_unprivileged_userns` = 1) | Pakketten installeren; AppArmor-instelling niet zelf wijzigen, melden |
| `code: command not found` in Ubuntu | VS Code ontbreekt op Windows of staat niet op `PATH` | Eigenaar installeert VS Code op Windows, opent Ubuntu opnieuw en herhaalt Fase 9 stap 1 |
| `gh: … missing required scope 'workflow'` | Ingelogd zonder scope | `gh auth refresh -s workflow` (overdracht) |
