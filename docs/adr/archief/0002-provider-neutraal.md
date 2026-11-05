# 0002 — Template is provider-neutraal

Status: vervangen door 0039

## Context

Plan v1 (verwijderd; staat in de git-geschiedenis, zie CHANGELOG) koos Supabase (Postgres + Auth) en Vercel. De template moet de basis zijn
voor elke app; de hosting- en databaseprovider verschilt per app.

## Besluit

- De template bevat geen provider-SDK, -config of -workflow. Lokaal: gewone Postgres en Mailpit in Docker.
- De database is gewone Postgres. Rollen (`api_user`, `app_authenticated`), RLS en `app.current_user_id()` staan in
  eigen migraties; geen `auth.uid()` of andere providerfuncties.
- Hosting en beheerde Postgres zijn poorten (`docs/framework.md` §3). Een app kiest ze per ADR en voegt een adapter
  toe in `deploy/<host>/`. Supabase en Vercel blijven de standaardvoorkeur van de eigenaar, niet van de template.

## Alternatieven

- Supabase en Vercel in de template: sneller voor de eerste app, maar elke andere keuze betekent eerst slopen.
- Lokaal de volledige Supabase-stack: dichter bij één provider, ~7 GB RAM, en provider-functies sluipen in migraties.

## Gevolgen

- Auth lokaal: zie ADR 0003 (Better Auth in de API).
- Fase 0 test `api_user` + `withUser()` tegen gewone Postgres, direct en via PgBouncer in compose. De pooler van de gekozen provider
  wordt bij de providerkeuze van een app opnieuw getest.
- Release-workflows, smoketest tegen de provider en runbooks zijn werk van fase 3, per app.
