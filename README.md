# App-template

Fundering voor webapps die je met code-agents bouwt, met React, een Hono-API en Postgres. De template bevat inloggen met tweestapsverificatie, accountbeheer, een UI-kit en controles voor codekwaliteit en datatoegang.

Gedeelde onderdelen staan in `src/core`; eigen schermen, routes en contracten komen in de app-laag. Zo kunnen apps later updates uit de template overnemen.

Agents werken met vaste instructies, featurespecs, voorbeelden en controles. De eigenaar bepaalt wat er gebouwd wordt en beoordeelt wijzigingen. Deze werkwijze is onderdeel van de template.

## Wat er staat

- React met Vite, TanStack Router en Query, React Hook Form en Tailwind.
- Een Hono-API met gevalideerde routes, permissies en vaste foutresponses.
- Better Auth met uitnodigingen, sessies en TOTP voor beheerders.
- Postgres met migraties, rolgebaseerde toegang en row-level security.
- Een componentcatalogus, formulieren en toegankelijke navigatie.
- Een lokale database en mailserver, tests en GitHub Actions.
- Een containerimage die de webapp en API op dezelfde origin serveert.

De basis is nog in ontwikkeling. Uitgebreid accountbeheer, achtergrondtaken, auditlogging en privacyfuncties staan op de [roadmap](docs/roadmap.md). Een eerste app moet nog bewijzen dat starten en template-updates soepel verlopen. Hosting en een databaseprovider kies je per app.

## Documentatie

Begin bij de [leeswijzer](docs/README.md).

| Document | Wanneer je het nodig hebt |
|---|---|
| [Framework](docs/framework.md) | Architectuur en ontwikkelafspraken |
| [Roadmap](docs/roadmap.md) | Open werk, prioriteiten en acceptatiecriteria |
| [Een feature bouwen](docs/gouden-pad.md) | Een uitbreiding van database tot scherm |
| [Definition of Done](docs/dod.md) | Een wijziging controleren en opleveren |
| [Agentinstructies](AGENTS.md) | Werken met een code-agent; Claude Code leest ook [CLAUDE.md](CLAUDE.md) |

## Lokaal draaien

Voor de ondersteunde ontwikkelomgeving heb je Ubuntu 24.04 of WSL2, Docker Engine, [mise](https://mise.jdx.dev), GitHub CLI, `bubblewrap` en `socat` nodig. De laatste twee gebruikt de Claude Code-sandbox. De toolversies staan in `mise.toml` en `package.json`.

Voer na het clonen eenmalig de installatie uit:

```sh
scripts/bootstrap.sh
```

Start daarna de lokale omgeving:

```sh
pnpm dev
```

Dit start Postgres en Mailpit, past migraties toe en start de API en webapp. Standaard staat de webapp op `http://localhost:5173`, de API op poort 8787 en Mailpit op `http://localhost:54324`.

Poorten staan in `.env.local`. Bij meerdere apps moet je ook de bijbehorende poorten in de database-URL's en `SMTP_URL` aanpassen.

### Lokale accounts

`pnpm dev` maakt onderstaande demoaccounts. Het wachtwoord is `lokaal-demo-wachtwoord`.

| Account | Rol |
|---|---|
| `admin@template.test` | Beheerder, met TOTP |
| `gebruiker@template.test` | Gebruiker |

Voeg de lokale beheerder toe aan je authenticator-app met deze URI:

```text
otpauth://totp/localhost:admin%40template.test?secret=NRXWWYLBNQWWIZLNN4WXI33UOAWXG3DFOV2GK3BNGAYDAMBQGAYA&issuer=localhost&digits=6&period=30
```

Deze accounts en waarden zijn alleen voor lokaal gebruik. Voor een eerste beheerder of accountherstel in een andere omgeving volg je het [beheerdersrunbook](docs/operations/eerste-admin.md).

## Cloud

Opdrachten geven vanaf telefoon of browser (claude.ai/code, Code-tab in de app) gaat via een cloudsessie: een verse clone in een VM van Anthropic. Eenmalig per repo:

1. Maak op claude.ai/code een omgeving met netwerktoegang **Trusted** (de standaard). `mise.run` staat niet op die allowlist; het script haalt mise daarom van github.com.
2. Zet als setup-script `bash scripts/cloud-setup.sh`. Het installeert mise, de toolchain uit `mise.toml`, de dependencies en de git-hooks, zonder geheimen. Klaar binnen ongeveer vijf minuten betekent dat de omgeving wordt gecachet.
3. Start elke sessie met **één repo**. Alleen dan gelden de hooks en permissieregels uit `.claude/settings.json`.

Een cloudsessie heeft geen lokale stack: `pnpm gate:slow` en `pnpm test:db` draaien in CI. De GitHub-proxy beperkt niet naar welke branch gepusht wordt, dus de ruleset op `main` is daar de grens. Wat in een echte sessie wel en niet werkt (sandbox, hooks, `ask` vanaf de telefoon), staat in de cloudreview onder `docs/reviews/`. Tot die er is, is het pad naar het setup-script vanuit de omgeving niet bewezen.

## Controles

| Commando | Controleert |
|---|---|
| `pnpm gate:fast` | Formatteren, lint, types, architectuurregels en unittests |
| `pnpm gate:slow` | Database- en integratietests, schermtests en schema-snapshot |
| `pnpm build` | TypeScript en de productiebuild van de webapp |
| `scripts/doctor.sh` | De lokale ontwikkelomgeving |
| `node scripts/kit/feiten.mjs` | Beschikbare controles, registraties en documentstatussen |

Database- en schermtests draaien in de runner-container. Zie [ADR 0009](docs/adr/0009-tests-buiten-de-sandbox.md) voor de inrichting en [de DoD](docs/dod.md) voor controles per wijziging. GitHub Actions voert controles uit; branchbescherming wordt apart ingesteld.

## Nieuwe app starten

Volg het [setup-playbook](docs/nieuwe-app.md) om een app aan te maken, te hernoemen en aan de templategeschiedenis te koppelen. Dat playbook is geschreven voor Claude Code. Je kunt het zo klaarzetten:

```sh
mkdir -p ~/setup
curl -fsSL https://raw.githubusercontent.com/BramLambertJansen/template/main/docs/nieuwe-app.md -o ~/setup/nieuwe-app.md
cd ~/setup
claude
```

Geef Claude Code de opdracht: `Volg nieuwe-app.md`.

De eigenaar moet **Settings → Template repository** inschakelen voordat **Use this template** beschikbaar is. Een nieuwe app krijgt daarna eenmalig een merge-commit die de geschiedenis koppelt. Latere updates gaan met `git merge template/main` op een branch en via een PR. Merge zulke updates met **Create a merge commit**, zodat de koppeling behouden blijft; zie [ADR 0006](docs/adr/0006-app-uit-template.md).

App-eigen architectuurbesluiten nummeren vanaf `0100`. De keuze voor hosting en een beheerde database volgt bij de eerste release.
