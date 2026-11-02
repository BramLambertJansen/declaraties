# 0034 — Gedeelde Claude Code-permissies

Status: vervangen door 0045

## Context

De eigenaar vraagt op 2026-10-18 om commit `4d6c0ab` ("editted settings") naar `main` te brengen. Die commit zet
`acceptEdits` als standaardmodus en voegt toestemmingen toe voor snelle checks, featurebranch-pushes, PR-aanmaak
en lezende GitHub-commando's. Omdat dit rechten verruimt, geldt drempel A3 uit ADR 0029 punt 4.

De bronbranch loopt achter op `main` en bevat ander werk. Alleen de inhoudelijke toevoegingen van deze commit
worden op de actuele instellingen toegepast (`.claude/settings.json:4`).

## Voorstel

Neem de genoemde standaardmodus en commandotoestemmingen op in de gedeelde `.claude/settings.json`.
Dit wijzigt ADR 0033 punt 6 voor deze instellingen: de eigenaar wil ze via versiebeheer delen in plaats van
alleen lokaal instellen. De bestaande `deny`- en `ask`-regels, sandbox en hooks van `main` blijven gelden.
Een `allow` heft geen `deny` of `ask` op.

## Gevolgen

Nieuwe Claude Code-sessies gebruiken deze standaardmodus en commandotoestemmingen ook na een template-update.
De configuratie is specifiek voor Claude Code. Voor Codex blijven de eigen sandbox en GitHub-checks gelden.
Inhoudelijke goedkeuring en samenvoeging blijven bij de eigenaar.
