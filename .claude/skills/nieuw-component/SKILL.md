---
name: nieuw-component
description: Een component of variant aan de kit toevoegen (src/web/ui of src/core/web/ui), met catalogus, contrast en tests. Alleen als geen bestaand component past.
allowed-tools: Bash(node scripts/kit/feiten.mjs *)
---

# Nieuw component of variant

Bestaande componenten:

!`node scripts/kit/feiten.mjs componenten`

Eerst: past een bestaand component met een variant? Dan een variant (afleiden uit de variantkaart van core, niet forken).
1. App-specifiek: `src/web/ui/`; voor elke app: `src/core/web/ui/` (beschermd pad: akkoord eigenaar). Exporteer via `src/web/ui/index.ts`.
2. Alleen tokens (geen hex of benoemde kleuren), 44 px aanraakdoel en de focusring uit het recept; native elementen alleen hier.
3. Zet het op `/design-system` (`src/web/features/design-system/design-system-page.tsx`): `pnpm check:catalogus` eist een bereikbaar voorbeeld voor elk component en elke eindige variant (ADR 0048). Geen uitzonderingslijst.
4. Nieuwe Button-variant: een rij in `test/ui/contrast.test.ts`.
5. Een componenttest (`*.test.tsx`, jsdom) voor gedrag en toegankelijke naam; `pnpm ui:check` voor axe in licht en donker.
