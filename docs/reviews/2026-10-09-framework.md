# Review framework — 2026-10-09 (na PR #4)

Vier reviews, elk met schone context en alleen lezend: consistentie, security en database, Claude Code-configuratie (getoetst aan
code.claude.com/docs, geraadpleegd 2026-10-09, nieuwste genoemde versie v2.1.285), uitvoerbaarheid. De hoofdsessie heeft de bevindingen
samengevoegd, de SQL-claims zelf nagelopen en de keuzes hieronder door de eigenaar laten maken.

**Oordeel:** het security- en dataontwerp was in de kern goed. Er zaten drie echte fouten in de database (zie A1–A3), en de sandbox
had een gat via commando's buiten de sandbox (A4). Het proces was te zwaar en sommige dingen liepen in de verkeerde volgorde. Na deze
ronde is het een werkbare basis, op voorwaarde dat de eigenaar ADR 0006–0010 accepteert of verwerpt.

## Besluiten van de eigenaar

| Vraag | Keuze |
|---|---|
| Baseline aanpassen (nog nergens gedraaid) | Ja: rechten voor `app_definer` gefixt en schema `auth` → `better_auth` (ADR 0010) |
| Regel "nooit een bestaande test wijzigen" | Versoepeld: wijzigen mag bij gewijzigd gedrag, met reden in de PR; verwijderen/skippen alleen met akkoord |
| `excludedCommands` | Patronen met ` *`, en dezelfde commando's in `ask`: de eigenaar keurt elke run buiten de sandbox goed |
| Volgorde roadmap | Rails en test-infra in stuk 1; stuk 3 opgeknipt in 3a–3d |

## Doorgevoerd

| # | Bevinding | Fix |
|---|---|---|
| A1 | `alter function … owner to app_definer` faalt: `app_definer` mist CREATE op `app` | Baseline: `grant usage, create on schema app to app_definer` + default privileges |
| A2 | FORCE RLS geldt ook voor `app_definer`: een datamigratie ziet nul rijen | Regel: eigen policy `to app_definer` per tabel, met pgTAP-test |
| A3 | Schema `auth` botst met Supabase | ADR 0010, baseline, docs |
| A4 | Uitgesloten commando's laden code die de agent lokaal kan schrijven (configs, `.npmrc`, `mise.toml`, compose-override, `.env.local`); test kan via superuser in de Postgres-container | ADR 0009 herzien: alles in de runner, vaste compose-argumenten, eigen test-Postgres, script weigert bij gewijzigde host-bestanden |
| A5 | `excludedCommands` matcht exact: `pnpm ui:check /login` faalt | Patronen met ` *` + `ask` |
| A6 | Geen `denyRead` op inloggegevens | `~/.ssh`, `~/.aws` (Read-deny én sandbox); `~/.config/gh` pas na het App-token (anders werkt `gh` niet) |
| A7 | Edit-regels dekken `sed -i` niet | `ask` op `sed -i`/`perl -pi`; guard-files-hook dekt Bash-schrijfacties |
| A8 | Env-regel te omzeilen (hele-string-vergelijking, localhost achter proxy) | `APP_ENV` verplicht; URL's geparsed; `AUTH_SECRET` ≥ 32 bytes; https; `AUTH_BASE_URL = APP_ORIGIN` |
| A9 | App kan `createApp` omzeilen; MFA-eis was een optionele vlag; `check-core` te vervalsen | ADR 0008: `createApp` geeft alleen `fetch`, lint op `hono`, compositie-roots beschermd, MFA uit de rol, concrete `check-core`-controle |
| A10 | Login-CSRF via GET-links; dubbele `Content-Type` | ADR 0007 rij 17–18, POST-bevestiging; framework §6 |
| A11 | `session_strength`: `'none'` ongedocumenteerd; spoofbaar via `set_config` | Framework §6 en database-regel: `password`/`mfa`, `none` = geen actor; lint op `set_config`/`current_setting` |
| B1 | Voorgestelde ADR's behandeld als wet; 0006 onterecht afgevinkt | AGENTS.md + roadmap: eerst accepteren; 0006 terug op `[ ]` |
| B2 | Health-route geen uitzondering in §3; clientfouten-route wijkt af van ADR 0003 | §3 aangevuld |
| B3 | Fase 0 hing van Better Auth en ontbrekende tooling af | Better Auth naar stuk 2; minimum uit stuk 1 mag mee |
| B4 | `withUser`-contract, aliassen, test-indeling, typed client niet vastgelegd | Framework §4/§6, roadmap |
| B5 | Reviewer mocht `gate:*` niet draaien | Toegevoegd aan readonly-bash |
| B6 | CODEOWNERS-claim in §11 tegen ADR 0009; PR-template miste checks | §11 herschreven; PR-template bijgewerkt |
| B7 | Playbook: `workflow`-token bij de agent verzwegen; dbmate niet gepind; Nederlandse commits | `nieuwe-app.md` |
| B8 | Kleinere zaken: `auth_service` idle-timeout, `lock_timeout`, `SMTP_URL` bij poortwissel, `--exclude-extension=pgtap`, CSP-aanvullingen, hook fail-open, SubagentStop in settings, DoD-fasekop, dubbele werkstraat in CLAUDE.md | Doorgevoerd |

## Bewust niet of later

- ADR 0008 en 0009 zijn langer dan één pagina; inkorten na acceptatie.
- `pnpm` staat zowel in `mise.toml` (`"11"`) als in `packageManager`; de hash in `packageManager` volgt in stuk 1.
- Werken op native Windows: de sandbox start daar niet (`failIfUnavailable`). Werk in WSL2 op ext4, zoals §11 voorschrijft.
