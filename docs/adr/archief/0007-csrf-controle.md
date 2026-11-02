# 0007 — CSRF-controle: header-regels en testmatrix

Status: vervangen door 0041

## Context

ADR 0003 eiste voor niet-GET `Sec-Fetch-Site: same-origin` **of** `Origin === APP_ORIGIN`, plus `Content-Type: application/json`.
Die "of" liet een request door met een aanwezige, afwijkende header zolang de andere klopte (bijvoorbeeld `Sec-Fetch-Site: same-site`
met een geldige `Origin`). Hono's `csrf()` dekt alleen formulier-content-types; JSON-POST glipt erdoor, dus de middleware is eigen werk.

## Besluit

Eigen middleware vóór alle routes. Voor elk niet-GET/HEAD/OPTIONS-request:

1. Het mediatype van `Content-Type` is `application/json` (hoofdletterongevoelig); parameters zoals `charset=utf-8` zijn toegestaan. Clients sturen deze header bij elk niet-GET-request, ook zonder body (DELETE, bodyloze POST zoals sign-out); de API-client (`src/core/web/lib/api-client.ts`, ADR 0008) doet dat standaard; de Better Auth-client moet het ook doen (zie Gevolgen).
2. Minstens een van `Sec-Fetch-Site` en `Origin` is aanwezig.
3. Elke aanwezige header klopt: `Sec-Fetch-Site` is `same-origin`; `Origin` is exact gelijk aan `APP_ORIGIN` (schema, host en poort, hoofdlettergevoelig, geen slash achteraan).
4. Een van deze headers (`Sec-Fetch-Site`, `Origin`, `Content-Type`) die meer dan eens of als lijst voorkomt, telt als niet kloppend.
5. Anders weigert de middleware met 403 en foutcode `CSRF_REJECTED` (`{ code, requestId }`; tekst in `src/web/copy/errors.ts`).

GET, HEAD en OPTIONS worden niet gecontroleerd; eigen routes wijzigen daarmee nooit state. Uitzondering die de library meebrengt: GET-links van
Better Auth die een sessie maken (e-mailverificatie, magic link). Die openen een scherm dat de actie met een POST bevestigt, zodat een
aanvaller het slachtoffer niet ongemerkt in zijn eigen account logt (login-CSRF). Geen `cors()`.

### Testmatrix (verplicht voor de middleware)

| # | `Sec-Fetch-Site` | `Origin` | `Content-Type` | Uitkomst |
|---|---|---|---|---|
| 1 | `same-origin` | afwezig | `application/json` | toegestaan |
| 2 | afwezig | `APP_ORIGIN` | `application/json` | toegestaan |
| 3 | `same-origin` | `APP_ORIGIN` | `application/json` | toegestaan |
| 4 | `same-origin` | afwezig | `application/json; charset=utf-8` | toegestaan |
| 5 | afwezig | afwezig | `application/json` | geweigerd |
| 6 | `same-site` | `APP_ORIGIN` | `application/json` | geweigerd |
| 7 | `cross-site` | afwezig | `application/json` | geweigerd |
| 8 | `none` | afwezig | `application/json` | geweigerd |
| 9 | `same-origin` | andere origin | `application/json` | geweigerd |
| 10 | afwezig | `null` | `application/json` | geweigerd |
| 11 | `same-origin` | afwezig | `text/plain`, `multipart/form-data` of `application/x-www-form-urlencoded` | geweigerd |
| 12 | `same-origin` | afwezig | `application/jsonx` | geweigerd |
| 13 | `same-origin` | afwezig | afwezig (DELETE of POST zonder body) | geweigerd |
| 14 | `same-origin` | afwezig | `Application/JSON` | toegestaan |
| 15 | `same-origin` | `APP_ORIGIN` tweemaal of als lijst | `application/json` | geweigerd |
| 16 | willekeurig of afwezig | willekeurig of afwezig | willekeurig | GET, HEAD en OPTIONS: niet gecontroleerd |
| 17 | `same-origin` | afwezig | `application/json` tweemaal | geweigerd |
| 18 | `same-origin` | afwezig | `application/json` (methode PUT, PATCH of DELETE) | toegestaan |

## Alternatieven

- Hono's `csrf()`: dekt JSON niet.
- CSRF-token (double submit): extra client-logica; `SameSite=Lax` plus deze controle dekt de bekende vectoren voor een same-origin JSON-API.
- Alleen `Origin` of alleen `Sec-Fetch-Site`: laat geen client toe waarvan die ene header ontbreekt. “Minstens één aanwezig, alle aanwezige kloppen” accepteert beide en weigert een aanwezige foute header.

## Gevolgen

- Clients zonder beide headers (curl, server-naar-server) worden geweigerd; zulke clients bestaan niet voor deze API.
- Strenger dan ADR 0003: een aanwezige foute header weigert nu, ook als de andere header klopt.
- Bodyloze niet-GET-requests zonder `Content-Type` falen. Verifieer in fase 1 dat de Better Auth-client op `/api/auth/*` (o.a. sign-out) `Content-Type: application/json` meestuurt; zo niet, los het op in de client-configuratie en niet door de regel te verzwakken.
- De matrix is de acceptatiecriteria-lijst voor de middleware (roadmap fase 1, stuk 2 "Auth").
