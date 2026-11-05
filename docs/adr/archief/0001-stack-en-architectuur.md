# 0001 — Stack en architectuur

Status: vervangen door 0039

## Context

Eén webapp, gebouwd door agents. Alle schermen achter login. Ontwikkelen volledig lokaal; hosting per app (ADR 0002).

## Besluit

Vite + React SPA en Hono-API in één pakket (`src/web`, `src/api`, `src/shared`), gewone Postgres.
De browser praat alleen met de API; de API raakt Postgres alleen via `withUser()` onder de identiteit van de gebruiker.
Details: `docs/framework.md` §2 en §6.

## Alternatieven

- Monorepo met drie pakketten: meer onderhoud (configs, workspace-links, build-volgorde) voor dezelfde garantie.
- Full-stack framework met server functions (TanStack Start, React Router framework mode): even veilig,
  maar koppelt sterker aan de host; Hono houdt de uitwijkroute open.
- Server-rendering: levert niets op achter een login.

## Gevolgen

- Grenzen tussen mappen moeten met dependency-cruiser bewaakt worden.
- Open risico: `api_user` + `withUser()` achter een pooler in transaction mode is nog niet bewezen (fase 0).
