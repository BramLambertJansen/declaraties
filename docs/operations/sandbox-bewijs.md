# Sandboxbewijs: `.claude/settings.json`

Handmatige proef van de Claude Code-sandbox uit `.claude/settings.json:118` (roadmap stuk 5). De hoofdsessie draaide de
probes zelf, met toestemming van de eigenaar, en legde alleen vast of een actie lukte; geen inhoud. Een test in CI kan dit
niet: de sandbox bestaat alleen in de agentsessie (`test/rails/sandbox-settings.test.ts` dekt de spiegel, niet de werking).

**Omgeving:** Ubuntu op WSL2, kernel 6.18.54.1-microsoft-standard-WSL2; `bwrap` en `socat` in `/usr/bin`. Datum 2026-10-21,
template-commit `bfa24b3`.

| Probe (elk een eigen Bash-commando, alleen de uitslag gelogd) | Verwacht | Uitslag |
| --- | --- | --- |
| `cat .env >/dev/null` | geweigerd | geweigerd door de sandbox (`Permission denied`) |
| `head -c 1 .env.example >/dev/null` (`allowRead`, `.claude/settings.json:134`) | toegestaan | toegestaan |
| `cat src/probe-secret.txt` (bestond al bij de start van het commando) | geweigerd | geweigerd (`Permission denied`) |
| `head -c 1 node_modules/better-auth/dist/context/secret-utils.mjs` (2026-10-23, met `Read(./*secret*)`) | toegestaan | geweigerd: `./*secret*` matcht op elke diepte; vervangen door `Read(/*secret*)`, uitslag daarvan open (zie Beperkingen) |
| `ls ~/.ssh`, `ls ~/.aws` | geweigerd | niet te toetsen: de mappen bestaan op deze machine niet |
| `touch ~/sandbox-probe`, `touch /etc/sandbox-probe` | geweigerd | geweigerd (`Read-only file system`) |
| `touch .claude/settings.json` | geweigerd | geweigerd (`Read-only file system`) |
| `curl https://api.github.com` (`allowedDomains`) | toegestaan | toegestaan |
| `curl https://example.com` | geweigerd | geweigerd (proxy `403`) |

Twee lagen: een eerder, samengesteld commando dat ook `.env` las, weigerde de permissielaag van Claude Code al vóór uitvoering
(`deny`, `.claude/settings.json:6`); de losse `cat .env` hierboven bereikte de sandbox en die weigerde het lezen.

## Beperkingen

- **Nieuw bestand binnen één commando.** De leesweigering op `*secret*` geldt voor paden die bestaan als het commando start.
  Een bestand dat hetzelfde commando aanmaakt en daarna leest, is leesbaar; in een volgend commando is het geweigerd. Een
  geheim dat al op schijf staat, blijft dus afgeschermd. Zo'n afgeschermd bestand kan de agent ook niet verwijderen
  (`Device or resource busy`); dat doet de eigenaar.
- **`Read(/*secret*)` en de `.claude`-regels per submap** (2026-10-23) zijn nog niet geprobeerd: de sandbox laadt de
  instellingen van de hoofd-checkout bij de start van een sessie. Open: of de sandbox `/*secret*` aan de projectroot
  verankert (zoals permissieregels) of als absoluut pad leest. Probes in een nieuwe sessie na de merge: de gemelde
  `denyOnly`; `probe-secret.txt` in de root en `.claude/` geweigerd; `secret-utils.mjs` in `node_modules` en in
  `.claude/worktrees/*/node_modules` leesbaar. Leest de sandbox `/` absoluut, dan is de root onbeschermd en volgt direct
  een herstel.
- **`~/.ssh` en `~/.aws`** zijn alleen als regel aanwezig; bewijs volgt op een machine waar die mappen bestaan.
- **`excludedCommands`** (`.claude/settings.json:122`: `pnpm test:db`, `ui:check`, `gate:slow`, `db:generate`, `check:snapshot`)
  draaien buiten de sandbox, met `ask`; ADR 0044 beschrijft dat gat.
- **Niet getoetst:** `failIfUnavailable` en `allowUnsandboxedCommands: false` (`.claude/settings.json:120`–`:121`).
- De deny- en ask-patronen in `permissions` zijn gemak, geen grens (framework §8); dit verslag bewijst de sandbox.
