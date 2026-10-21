# 0039 — Stack, provider-neutraliteit en toolchain

Status: geaccepteerd

Vervangt [0001](0001-stack-en-architectuur.md), [0002](0002-provider-neutraal.md) en
[0005](0005-toolchain-en-identiteit.md). Drempel: A4. Consolidatie zonder inhoudelijke wijziging (eigenaarbesluit 2026-10-21,
[0038](0038-beslisroute.md) Gevolgen); de zones in `src/core` staan in [0040](0040-template-app-en-grens-core-app.md).

## Context

Eén webapp per repository, gebouwd door agents. Alle schermen zitten achter een login; ontwikkelen gaat volledig lokaal. De
template is de basis voor elke app, en de hosting- en databaseprovider verschilt per app. Agents volgen de regels letterlijk,
dus de toolchain ligt vast en de regels zijn kort en stellig.

## Besluit

1. **Eén pakket: SPA plus API** (was 0001). Vite + React SPA en een Hono-API in één pakket (`src/web`, `src/api`,
   `src/shared`, met de core-zone uit 0040), op gewone Postgres. De browser praat alleen met de API; de API raakt Postgres
   alleen via `withUser()` onder de identiteit van de gebruiker ([0042](0042-database-en-datapad.md)). Details:
   `docs/framework.md` §2 en §6.
2. **Geen provider in de template** (was 0002 punt 1). Geen provider-SDK, -config of -workflow. Lokaal draaien gewone
   Postgres en Mailpit in compose.
3. **Gewone Postgres** (was 0002 punt 2). Rollen, RLS en `app.current_user_id()` staan in eigen migraties en `db/init/`;
   geen `auth.uid()` of andere providerfuncties.
4. **Hosting en beheerde Postgres zijn poorten** (was 0002 punt 3). Een app kiest ze per ADR en voegt een adapter toe in
   `deploy/<host>/` (`docs/framework.md` §3). Supabase en Vercel zijn de standaardvoorkeur van de eigenaar, niet van de
   template.
5. **Node 26** (was 0005), exact gepind in `mise.toml`. Geen Corepack.
6. **pnpm 11** (was 0005), alleen via `packageManager` in `package.json`; supply-chaininstellingen in `pnpm-workspace.yaml`.
7. **TypeScript 6.0** (was 0005). Renovate blokkeert 7 zolang typescript-eslint het niet ondersteunt.
8. **Bot-identiteit: een GitHub App** (was 0005) in plaats van een fijnmazig token van een bot-account: kortlevende tokens,
   geen extra seat, rechten per installatie. Geen `workflows`-recht, geen admin. Workflow-wijzigingen uit de template pusht
   de eigenaar, niet de bot (was 0005 Gevolgen). Tot de App bestaat, geldt de overgang uit [0017](0017-diff-guard.md).
9. **Toon van de regels** (was 0005). Korte, stellige instructies met reden, zonder hoofdletters-schreeuwen: te agressieve
   taal leidt tot overreactie. Afdwingen gebeurt door checks, niet door de toon.

## Alternatieven

- **Monorepo met drie pakketten** (was 0001): meer onderhoud (configs, workspace-links, build-volgorde) voor dezelfde garantie.
- **Full-stack framework met server functions** (TanStack Start, React Router framework mode; was 0001): even veilig, maar
  sterker aan de host gekoppeld; Hono houdt de uitwijkroute open.
- **Server-rendering** (was 0001): levert niets op achter een login.
- **Supabase en Vercel in de template** (was 0002): sneller voor de eerste app, maar elke andere keuze betekent eerst slopen.
- **Lokaal de volledige Supabase-stack** (was 0002): dichter bij één provider, veel geheugen, en providerfuncties sluipen in
  migraties.

## Gevolgen

- Dependency-cruiser bewaakt de grenzen tussen mappen (was 0001).
- Release-workflows, een smoketest tegen de provider en runbooks zijn werk per app, bij de providerkeuze (was 0002).
- Een andere major-versie van Node, pnpm of TypeScript vraagt een nieuw ADR (was 0005).
