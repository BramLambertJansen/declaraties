---
status: gebouwd # #513; gevalideerd: 95e24f75c81b4883bb5b3b6b28673ab4602da8b8
namespace: e-maillengte
sjabloon: mini
model: opus
---

# Maximale lengte van het nieuwe e-mailadres bij een e-mailwijziging

Lichte fixes zonder mini-spec; deze raakt `src/core/api/auth/` en is dus kritiek (R-WERK-05): eerst dit besluit, dan de bouw.

## Doel

`POST /api/auth/change-email` weigert een nieuw e-mailadres langer dan `MAX_EMAIL_LENGTH` (254 tekens, RFC 5321), zoals het
formulier al doet. Nu controleert alleen de SPA de lengte; een directe aanroeper kan een langer adres laten opslaan
(leerpunt #487 punt 1, Codex-bevinding uit PR #93).

Buiten scope: punt 2 van #487 (race bij gelijktijdig blokkeren/deblokkeren). Dat is op `main` al opgelost:
`db/migrations/20261019070000_account_audit_idempotency.sql` neemt de advisory lock vóór het lezen van `blocked_at`, en
`test/api/account-audit-race.int.test.ts` bewijst dat twee gelijktijdige verzoeken samen één auditregel schrijven.

## Rollen en wie wat ziet

Ongewijzigd: elke ingelogde gebruiker mag zijn eigen e-mailadres wijzigen (spec eigen-account). Alleen de invoergrens komt erbij.

## Routes en foutcodes

| Methode | Pad | Permissie | Foutcodes |
|---|---|---|---|
| POST | `/api/auth/change-email` | eigen sessie (Better Auth) | bestaand, plus 400 `VALIDATION` bij een te lang adres |

Volgorde in de before-hook (`createHooks` in `src/core/api/auth/hooks.ts`): een geweigerde sessie (`dropRejectedSession`, 401) en
de levensloopregels (`lifecycle.beforeEndpoint`, geblokkeerd of gedeactiveerd) gaan voor; daarna geen sessie (401 van het
endpoint), MFA-eis (403 `MFA_REQUIRED`), verse sessie (403 `SESSION_NOT_FRESH`), dan de lengte (400 `VALIDATION`), dan het
bezet-adres-antwoord (OV-9 van eigen-account). De hook weigert alleen als `newEmail` een string is die langer is dan
`MAX_EMAIL_LENGTH`, gemeten op de ruwe invoer; een ontbrekende, niet-string of ongeldige `newEmail` gaat door naar het endpoint,
dat zelf 400 geeft. De hook gebruikt `safeParse` of een typecontrole, nooit `parse` (een ZodError zou een 500 worden).
Geen nieuwe foutcode of tekst: de SPA zet elke 400 al om in `VALIDATION` (`changeEmailCode` in `src/core/web/lib/auth.ts`).

## Kopieer de vorm van

- `src/core/api/auth/hooks.ts` — `requireFreshSession` en `fail()` voor een weigering in de before-hook.
- `src/shared/limits.ts` — het doorgeven van `MAX_PAGE_SIZE` uit core voor `MAX_EMAIL_LENGTH`.

## Acceptatiecriteria

Een "te lang adres" in deze criteria is een geldig adres van 255 tekens: lokaal deel van hooguit 64 tekens en domeinlabels van
hooguit 63, zodat alleen de totale lengte de grens overschrijdt en `z.email()` van Better Auth het verder accepteert. "Geen mail"
meet de test zoals `test/api/eigen-account-deel2.int.test.ts` (`mailCountNow`/`countMails`, oude en nieuwe adres).

- **e-maillengte/AC-1** — Gegeven een ingelogde gebruiker met een verse sessie, wanneer hij `/api/auth/change-email` aanroept met
  een te lang adres, dan antwoordt de server 400 met code `VALIDATION`, gaat er geen mail uit (niet naar het oude en niet naar
  het nieuwe adres) en blijft zijn e-mailadres ongewijzigd.
- **e-maillengte/AC-2** — Gegeven dezelfde gebruiker, wanneer het nieuwe adres op dezelfde manier precies 254 tekens telt, dan is
  het gedrag gelijk aan nu: 200 en de bevestigingsmail naar het oude adres (eigen-account).
- **e-maillengte/AC-3** — Een te lang adres dat al bij een ander account hoort, geeft 400 `VALIDATION` en geen neutrale mail
  (OV-9 van eigen-account): de lengte gaat vóór het bezet-adres-antwoord.
- **e-maillengte/AC-4** — Een te lang adres met een sessie die niet vers is, geeft 403 `SESSION_NOT_FRESH`; met TOTP en een
  sessie met sterkte `password` 403 `MFA_REQUIRED`; zonder sessie 401. De lengte komt na de sessie-eisen.
- **e-maillengte/AC-5** — `MAX_EMAIL_LENGTH` (254) staat als harde grens in `src/core/shared/limits.ts`; `src/shared/limits.ts`
  geeft die waarde door en definieert geen eigen getal. Hook en `changeEmailInput` (`src/shared/schemas/auth.ts`) leggen dezelfde
  grens: 254 tekens door, 255 geweigerd (unittest op het schema, integratietest op de hook).

## Buiten scope

- `scripts/admin-create.mjs` heeft geen lengtegrens; alleen een operator draait het.
- `better_auth."user".email` is `text` zonder CHECK. Een CHECK vraagt een migratie op bestaande rijen (A2) en een eigen besluit.
- Andere schrijfpaden zijn al dicht of begrensd: `/update-user` en `/sign-up/email` staan uit (`src/core/api/auth/options.ts`),
  uitnodigen heeft `.max` in het contract.
- Docs in de bouw-PR: het commentaar bij `answerTakenAddress` in `hooks.ts` en de routetabel en OV-9 in `docs/specs/eigen-account.md`.

## Hergebruik en UX

n.v.t. — geen UI-wijziging; het formulier (`changeEmailInput` in `src/shared/schemas/auth.ts`) weigert al client-side met
"Hooguit 254 tekens.".

## Open vragen

- **OV-1 ✅ besloten** — Waar woont de grens? In core (`src/core/shared/limits.ts`), want de hook staat in core en core importeert
  geen app-code (R-LAAG-02); RFC 5321 is een template-grens. De app geeft hem door, zodat bestaande importeurs blijven werken.
