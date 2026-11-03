---
status: gebouwd # #478; gevalideerd: 07f11046f35617711ddeba1150895ad42d6311b1
namespace: rolhek-dicht
sjabloon: mini
---

# Rolhek valt dicht bij storing

## Doel

Een rolhek dat niet start, crasht of zijn timeout haalt, laat de tool-aanroep niet meer door: `onFailure: "block"` op de
PreToolUse-entry van het rolhek ([ADR 0045](../adr/0045-railwerk.md) punt 3, herzien). Aanleiding: bevinding P9 van de
review van 3 november 2026.

## Rollen en wie wat ziet

n.v.t. — tooling voor de hoofdsessie en subagents in Claude Code; geen app-gebruikers.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|

n.v.t. — geen routes.

## Kopieer de vorm van

- `test/hooks/werkstraat-script.test.ts` — `.claude/settings.json` lezen en een hook-entry vastpinnen
- `test/hooks/rolhek-script.test.ts` — het rolhek als proces draaien met echte stdin
- `scripts/kit/toolchain.mjs` — voorcontrole met een melding die de oplossing noemt

## Acceptatiecriteria

- **rolhek-dicht/AC-1** — Gegeven `.claude/settings.json`, dan staat `"onFailure": "block"` op het hook-object
  (`hooks[0].onFailure`) van de PreToolUse-entry die `.claude/hooks/rolhek.mjs` start. Geen enkel ander hook-object, onder
  welk event ook, heeft de sleutel. Test leest alle events en entries.
- **rolhek-dicht/AC-2** — De timeout van het rolhek blijft 10 seconden. De bouw-PR meet de hele keten, `node
  .claude/hooks/rolhek.mjs` met een echt anker (stub, lader, hashcontrole), met warme cache en met koude cache (eerste
  aanroep na een nieuw anker), en zet mediaan en maximum met de machine in de PR-beschrijving. Is het maximum hoger dan
  2 seconden, dan stopt de bouw en komt er eerst een nieuwe besluit-PR.
- **rolhek-dicht/AC-3** — Versiecontrole op Claude Code 2.1.295 of nieuwer (de versie waarin `onFailure` kwam):
  `scripts/doctor.sh` volledig en met `--machine` geeft exit 1 bij een oudere of onleesbare versie, met
  `✗ Claude Code <versie> is te oud: het rolhek valt pas vanaf 2.1.295 dicht bij storing` en daaronder
  `  → werk Claude Code bij`. Zonder `claude` op het pad (CI) slaat de doctor de controle over met een regel die dat zegt.
  `werkstraat session-start` zet bij een te oude of onleesbare versie dezelfde melding in de context. Een tabeltest dekt
  ouder, gelijk, nieuwer, onleesbaar en afwezig. De bouw-PR legt in de beschrijving vast wat een versie onder 2.1.295 met
  de onbekende sleutel doet; verwerpt die de hook of het hele bestand, dan stopt de bouw en komt er eerst een besluit-PR.
- **rolhek-dicht/AC-4** — Met `block` is ongeldige uitvoer ook een storing. Een test draait elke uitvoervorm van het rolhek
  als proces (deny, ask, allow, alleen context, leeg) en eist: exitcode 0 of 2, en stdout leeg of één JSON-object met alleen
  de veldnamen uit de Claude Code-docs voor PreToolUse (`hookSpecificOutput.hookEventName`, `permissionDecision`,
  `permissionDecisionReason`, `additionalContext`).
- **rolhek-dicht/AC-5** — Docs die na de bouw onwaar zouden zijn, gaan mee: R-ROL-09 in `docs/framework.md` (rolhek dicht bij
  elke storing; werkstraat en effect open bij timeout; meethook, melding, statusregel altijd open), het commentaar in
  `.claude/hooks/laden.mjs` ("timeout … fail-open"), `docs/ENVIRONMENT.md` (minimale versie en waarom). Het regelboek groeit
  netto niet: bytes van `docs/framework.md` vóór en na in de PR. Historische plekken (ADR 0046, spec `agent-merge`) blijven
  zoals ze zijn; deze herziening van 0045 gaat voor.
- **rolhek-dicht/AC-6** — `docs/operations/agent-doorloop.md` beschrijft een blokkade door storing: de foutregel van Claude
  Code herkennen (hook error of timeout met `onFailure` `block`), wat nog werkt (Read, Grep, Glob, subagent, de eigenaar
  vragen) en wat niet (elk Bash-commando, elke MCP-tool, schrijven), melden als leerpunt, de eigenaar vragen, de hook nooit
  uitzetten of omzeilen (R-PRINC-09).

## Hergebruik en UX

n.v.t. — geen UI. Melding van de doctor letterlijk zoals in AC-3.

## Open vragen

- **OV-1 ✅ besloten** — `onFailure` op werkstraat (Stop, SubagentStop)? Nee: volgens de Claude Code-docs heeft het veld daar
  geen effect, en PostToolUse kan achteraf niets tegenhouden.
- **OV-2** — Terugval meetbaar maken met een drempel, of via leerpunten? Aanbeveling: leerpunten (elke blokkade door storing
  is er een, bij het derde beslist de eigenaar); vraagt geen nieuwe meetcode, en de meethook ziet zo'n blokkade nu niet.
