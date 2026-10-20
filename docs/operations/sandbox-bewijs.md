# Sandboxbewijs: `.claude/settings.json`

Handmatige proef van de Claude Code-sandbox uit `.claude/settings.json:118` (roadmap stuk 5). De hoofdsessie draaide de
probes zelf, met toestemming van de eigenaar, en legde alleen vast of een actie lukte; geen inhoud. Een test in CI kan dit
niet: de sandbox bestaat alleen in de agentsessie (`test/rails/sandbox-settings.test.ts` dekt de spiegel, niet de werking).

**Omgeving:** Ubuntu op WSL2, kernel 6.18.54.1-microsoft-standard-WSL2; `bwrap` en `socat` in `/usr/bin`. Datum 2026-10-21,
template-commit `bfa24b3`.

| Probe (elk een eigen Bash-commando) | Verwacht | Uitslag |
|---|---|---|
| `cat .env` | geweigerd | geweigerd (`Permission denied`) |
| `head -c 1 .env.example` (`allowRead`) | toegestaan | toegestaan |
| bestaand bestand `src/*secret*` lezen | geweigerd | geweigerd (`Permission denied`) |
| `ls ~/.ssh`, `ls ~/.aws` | geweigerd | niet te toetsen: de mappen bestaan op deze machine niet |
| schrijven in `~`, `/etc` | geweigerd | geweigerd (`Read-only file system`) |
| `.claude/settings.json` schrijven | geweigerd | geweigerd (`Read-only file system`) |
| netwerk `api.github.com` (`allowedDomains`) | toegestaan | toegestaan |
| netwerk `example.com` | geweigerd | geweigerd (proxy `403`) |

Daarnaast weigerde de permissielaag van Claude Code een Bash-commando dat `.env` las vóórdat het de sandbox bereikte.

## Beperkingen

- **Nieuw bestand binnen één commando.** De leesweigering op `*secret*` geldt voor paden die bestaan als het commando start.
  Een bestand dat hetzelfde commando aanmaakt en daarna leest, is leesbaar; in een volgend commando is het geweigerd. Een
  geheim dat al op schijf staat, blijft dus afgeschermd. Zo'n afgeschermd bestand kan de agent ook niet verwijderen
  (`Device or resource busy`); dat doet de eigenaar.
- **`~/.ssh` en `~/.aws`** zijn alleen als regel aanwezig; bewijs volgt op een machine waar die mappen bestaan.
- De deny- en ask-patronen in `permissions` zijn gemak, geen grens (framework §8); dit verslag bewijst de sandbox.
