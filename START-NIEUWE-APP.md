# Start een nieuwe app — opdracht voor de coding agent

**Je bent een coding agent die een nieuwe applicatie begint vanuit [BramLambertJansen/template](https://github.com/BramLambertJansen/template).** Je werkt niet in de oorspronkelijke template en je maakt er geen fork van. Je maakt een **nieuwe GitHub-repository vanuit de template**, kloont die naar de lokale ontwikkelmachine, koppelt de templatehistorie, richt de omgeving in en draagt de werkende app-repo over voor featureontwikkeling.

Dit is het **korte startdocument** voor vóór er een app-repository bestaat. Het bestaande [setup-playbook](docs/nieuwe-app.md) blijft de **enige uitvoerbron** voor machine-inrichting, GitHub-stappen, repo-koppeling, beveiliging, installatie en overdracht. Kopieer de lange procedure niet in een tweede document. Bij verschil geldt het actuele playbook op `template/main`; meld een onduidelijkheid als bevinding.

## Context van jouw opdracht

Lees het startbericht. De gebruiker geeft bij voorkeur een appnaam en een beknopt doel. Zijn die al gegeven, vraag ze **niet opnieuw**. Alleen een ontbrekende appnaam mag worden uitgevraagd. Bewaak bestaande eigenaarbesluiten, geen nieuwe product- of providerkeuzes verzinnen.

Voor **ST-09** is de opdracht al bepaald:
- Appnaam: **Meldpunt**
- Repo-slug: **`meldpunt-st09`** (indien nog vrij)
- Doel: echte proefapp om de template te toetsen, niet een feature in de template zelf
- Meet- en bouwopdracht: [ST-09 praktijkproef](docs/operations/st-09-praktijkproef.md)
- De log van handwerk, fouten en meetresultaten begint **vóór de eerste setupstap**; de blijvende rapportage komt na repo-creatie in de app-repo. Een tijdelijk voortgangsbestand in `~/setup` voorkomt verlies bij herstart.

Voor een **andere app** geldt ST-09 niet automatisch. Gebruik dan alleen het algemene setup-playbook en het opgegeven appdoel.

## Welk traject kies je?

**Kies GitHub-eerst, niet lokaal-eerst.** Een GitHub-templaterepository levert een nieuwe repository met eigen identiteit en één initiële commit. Via GitHub CLI kan die in dezelfde opdracht worden aangemaakt en gekloond. Eerst lokaal `git clone BramLambertJansen/template` uitvoeren, de `origin` ombuigen en dan pas een repo maken is **niet** de normale route. Daarmee omzeil je juist de templatefunctie die we willen toetsen en introduceer je extra herkomst-/remote-werk.

Voer de volgende fasen uit **volgens `docs/nieuwe-app.md`**, niet op basis van verkorte commando's hieronder:

| Fase | Wat je doet | Wie voert uit? | Afsluitend bewijs |
| --- | --- | --- | --- |
| 0. Voorbereiden | Opdracht en appnaam vaststellen, omgeving herkennen, voor ST-09 meetlog aanmaken | Agent; eigenaar bij ontbrekende beslissing | Appnaam, doel, omgeving en startlog vastgelegd |
| 1. Voorwaarden | Linux/WSL2, GitHub-auth, lokale tools, rechten en de werkelijke `is_template`-instelling controleren | Agent controleert; eigenaar doet vereiste installatie/inlog/goedkeuring | Preflight-uitkomst en blokkades |
| 2. GitHub-repo | Via `gh repo create <owner>/<slug> --private --template BramLambertJansen/template --clone` een nieuwe repo maken en direct klonen naar `~/code/<slug>` | Agent, na preflight en binnen het playbook | Correcte nieuwe repo, `origin` en één initiële commit |
| 3. Herkomst koppelen | `template` als remote toevoegen, exact bron-tree controleren, eenmalige `-s ours`-merge uitvoeren en `app:init` gebruiken | Agent | Tweeouder-merge, juiste bron-SHA, hernoemwijzigingen |
| 4. Veiligstellen | Eigenaar pusht de twee setup-commits; daarna repo-instellingen en branchregels configureren en **daadwerkelijk** controleren | Eigenaar voor eerste `main`-push en aangewezen beveiligingsstappen; agent ondersteunt | Push en beschermingsstatus met bewijs |
| 5. Lokaal starten | Bootstrap, poorten, migraties, Postgres/Mailpit, web/API en sandbox volgens playbook | Eigenaar start de afgeschermde stack; agent controleert | `doctor`, migratiebewijs, login en werkende app |
| 6. Overdragen | Start werk in `~/code/<slug>`, laat volgende agent de app-instructies en specs lezen | Agent | Overdracht, open beslissingen, volgende actie |

**Waarom eerst lokaal voorbereiden maar niet eerst lokaal clonen?** De agent moet eerst weten dat GitHub, toolchain en WSL beschikbaar zijn. Dat is een **preflight**, nog geen applicatie-repository. De app ontstaat pas bij `gh repo create --template --clone`; daarna volgen het lokale Git-werk en de stack.

## Handelingen van de agent versus de eigenaar

- **Agent:** inspecteren, controleren, GitHub-repository uit de template aanmaken, clonen, koppeling/hertoewijzing van remote, `app:init`, bewijs verzamelen, vervolgbranches en PR's voorstellen of voorbereiden.
- **Eigenaar:** inloggen of toegang verlenen; noodzakelijke machine-installaties en het starten van de lokale Docker-stack; de **eenmalige** eerste setup-push naar `main`; de aangewezen GitHub-beveiligingsinstellingen en formele goedkeuringen; later PR's beoordelen/mergen.
- **Nooit aannemen** dat de agent rechten heeft die niet werkelijk blijken. Lukt private branchbescherming niet met het accountplan, noteer het, vraag de eigenaar te kiezen en zet de repo niet uit eigen beweging public. GitHub-settings van een template worden niet automatisch meegenomen.
- **Geen andere git-aanpak verzinnen** bij een fout. Bij een bestaande doelrepo of doelmap: controleer eerst de voortgang en remotes, overschrijf niets en hervat alleen wanneer herkomst en staat aantoonbaar kloppen. Anders stop en leg één gerichte keuze voor.

## Verplicht controleren voordat je koppelt

Een nieuwe repo uit **Use this template** heeft een losstaande initiële commit. Het playbook koppelt die bewust met `git merge --allow-unrelated-histories -s ours template/main`. Dat is veilig voor de historie **alleen als** de inhoud op dat moment overeenkomt met de bedoelde bronversie: `-s ours` neemt verschillen namelijk niet mee.

Vergelijk daarom vóór de eenmalige koppeling:

```bash
git rev-parse HEAD^{tree}
git rev-parse template/main^{tree}
```

Zijn deze waarden verschillend, **niet** stilzwijgend mergen. Registreer het verschil en vraag de eigenaar om een herstelkeuze; stel niet zelf een bronversie als verwerkt voor als de inhoud afwijkt. Het canonieke playbook bevat de volledige controle en vervolgstappen.

## Voor ST-09: eerste overdracht naar de bouwagent

Na succesvolle setup, lees in de **nieuwe app-repo** de meegestarte `AGENTS.md`, `CLAUDE.md`, `docs/framework.md` en de [ST-09 opdracht](docs/operations/st-09-praktijkproef.md). Maak daar `docs/validation/st-09/` en houd vanaf dan de acceptatiematrix, testuitvoer, interventies, nulmeting en latere template-update bij.

Voor ST-09 geldt: een geslaagde setup is **checkpoint 1**, niet een geslaagde hele proef. Meld exact wat getest is en welke veiligheidsinstellingen werkelijk actief zijn. De nieuwe app-code blijft buiten de template.

## Hoe je dit document gebruikt vóórdat de app bestaat

**Minimale bootstrap voor de eerste agentsessie:** een coding agent kan zijn eigen CLI niet installeren voordat hij gestart is. Zorg eerst voor een werkende Ubuntu-terminal (native of WSL2) en een geïnstalleerde Claude Code CLI. Bij een nog niet geïnstalleerde CLI voert de eigenaar in die Ubuntu-terminal eenmalig de installatiestap uit die ook in fase 3.2 van het setup-playbook staat:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Daarna moet `claude` vanuit die terminal kunnen starten. Voor Windows zonder werkende WSL2 is installatie van Ubuntu/WSL eerst een eigenaarstap; de overige toolchain, GitHub-inlog, Docker/Poorten en de repo worden daarna door de agent **gecontroleerd of via gerichte overdracht** volgens het playbook behandeld. Claim geen volledig agent-gestuurde nul-installatie. Dit onderscheid tussen *agent kunnen starten* en *app kunnen starten* hoort in het setupverslag.

De eigenaar kan deze **publieke** instructie en het actuele playbook in een Bash-/Ubuntu-/WSL-omgeving klaarzetten:

```bash
mkdir -p ~/setup
curl -fsSL https://raw.githubusercontent.com/BramLambertJansen/template/main/START-NIEUWE-APP.md -o ~/setup/START-NIEUWE-APP.md
curl -fsSL https://raw.githubusercontent.com/BramLambertJansen/template/main/docs/nieuwe-app.md -o ~/setup/nieuwe-app.md
cd ~/setup
claude
```

Startprompt voor ST-09:

> Je bent een coding agent. Start **Meldpunt**, een nieuwe app vanuit `BramLambertJansen/template`, voor de praktijkproef ST-09. Volg `START-NIEUWE-APP.md`, daarna het actuele `nieuwe-app.md` voor de setup en de ST-09-uitvoeringsopdracht voor het bewijs. De appnaam is al gekozen. Werk in een **nieuwe** repo `meldpunt-st09`, niet in de template. Registreer fouten en handmatige stappen vanaf het begin. Laat de eigenaar de stappen doen die het playbook aan hem voorbehoudt.

Is de toolchain of WSL nog niet beschikbaar, volg eerst de omgevingsfasen van het playbook en neem de sessie voortgangsgestuurd weer op. Ga niet direct een app ontwikkelen in `~/setup`. Voor Codex of andere agents die de `.claude/`-hooks niet afdwingen, is dezelfde procedure een werkinstructie maar **geen bewezen sandboxgrens**; maak het ontbreken van die afdwinging expliciet in de overdracht.
