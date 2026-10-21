# 0005 — Toolchain, bot-identiteit en toon van de regels

Status: vervangen door 0039

## Besluit

- **Node 26** (exact gepind in `mise.toml`, nu 26.11.1). Wordt 28 oktober 2026 LTS en wordt tot 2029 ondersteund;
  Node 24 gaat 20 oktober in onderhoud. Geen Corepack (zit niet meer in Node).
- **pnpm 11** (nu 11.28.2), alleen via `packageManager` in `package.json`; pnpm schakelt zelf naar die versie.
  Supply-chaininstellingen in `pnpm-workspace.yaml`.
- **TypeScript ~6.0.3**. TypeScript 7 is uit, maar typescript-eslint ondersteunt het nog niet; Renovate blokkeert 7.
- **Bot-identiteit: GitHub App** in plaats van een fijnmazig token van een bot-account: kortlevende tokens,
  geen extra seat, rechten per installatie. Geen `workflows`-recht, geen admin.
- **Toon**: korte, stellige instructies mét reden, geen hoofdletters-schreeuwen (advies van de Claude-docs: te
  agressieve taal leidt tot overreactie). Afdwingen gebeurt door checks, niet door de toon.

## Gevolgen

- Template-updates naar apps: eenmalig `git merge --allow-unrelated-histories -s ours template/main`, daarna gewone merges.
- Workflow-wijzigingen uit de template pusht de eigenaar, niet de bot.
