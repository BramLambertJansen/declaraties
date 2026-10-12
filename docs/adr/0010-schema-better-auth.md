# 0010 — Schema `better_auth` in plaats van `auth`

Status: geaccepteerd (2026-10-09) — voorgesteld door de agent na de review van 2026-10-09, geaccepteerd door de eigenaar. Vervangt de
schemanaam `auth` in [ADR 0003](0003-auth-in-de-api.md) en [ADR 0004](0004-database-tooling.md); de rest van die besluiten blijft staan.

## Context

ADR 0003 zet de tabellen van Better Auth in schema `auth`. Supabase, de standaardvoorkeur van de eigenaar voor beheerde Postgres
(ADR 0002), heeft al een schema `auth` van zijn eigen auth-server. Een app op Supabase kan dat schema niet gebruiken of hernoemen.
De baseline-migratie is nog nergens gedraaid; dit is het moment om het te veranderen zonder een tweede migratie.

## Besluit

- Better Auth gebruikt schema `better_auth`; `auth_service` heeft `search_path = better_auth` en alleen DML op dat schema.
- `public.user_roles.user_id` verwijst naar `better_auth."user"(id)`.
- De baseline-migratie (`20261009000000`) wordt eenmalig aangepast, omdat geen database hem heeft gedraaid. Daarna geldt weer:
  een gecommitte migratie wijzig je nooit.

## Gevolgen

- Framework, padregels, AGENTS.md, roadmap en `nieuwe-app.md` noemen `better_auth`.
- De invariant "schema dicht voor iedereen behalve `auth_service`" geldt voor `better_auth`. Uitzondering sinds ADR 0014: `app_definer` leest
  een vaste lijst kolommen voor de view `app.accounts`, waarvan `blocked_at` ook schrijfbaar is (ADR 0026, alleen via `app.set_account_blocked`).
