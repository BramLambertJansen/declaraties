# PasswordInput, Breadcrumbs, CopyButton en DateInput

De vier componenten zijn via `src/web/ui/index.ts` beschikbaar. De bereikbare voorbeelden en zoekdoelen staan op
`/design-system`. Deze uitbreiding voegt geen dependency, API-route, permissie of migratie toe.

`PasswordInput` en `DateInput` combineren een invoerveld met rechts een losse icoonknop: beide 44 px hoog, met 8 px
tussenruimte. Het invoerveld vult de resterende breedte; de knop behoudt zijn aanraakdoel, ook op smalle schermen.

- `PasswordInput` bouwt op Input en Button. Het veld begint afgeschermd; een vaste knopnaam en `aria-pressed` geven de
  zichtbaarheid aan. `id`, ref, waarde, autocomplete, blur en foutattributen blijven op hetzelfde invoerelement staan.
  De oogknop krijgt zijn toegankelijke naam via verborgen tekst, zodat het wachtwoordlabel alleen het veld aanwijst.
  `visibilityLabel` kan de standaardtekst “Wachtwoord tonen” vervangen. Disabled schakelt ook de toggle uit.
  De zichtbaarheid is lokaal en verdwijnt bij unmount; formulierreset wist de waarde via RHF. Het inlogscherm gebruikt
  deze component met behoud van het bestaande gedrag (`src/web/features/login/login-page.tsx`).
- `DateInput` gebruikt Input met `type="date"`. De browser verzorgt de datumweergave en kalender; formulierwaarden zijn
  `YYYY-MM-DD` of een lege string. Er is geen omzetting naar Date, UTC of Europe/Amsterdam. Geef `min`, `max`, `step`,
  disabled en readOnly waar nodig door. Validatie in Form blijft van het zod-schema; native grenzen vervangen die niet.
  De extra kalenderknop gebruikt `showPicker()` als de functie beschikbaar is; het ingebouwde kalendericoon is dan verborgen.
  Ontbreekt de functie of weigert de aanroep, dan blijft de native kalenderbediening zichtbaar en het veld handmatig invulbaar. Disabled en readOnly schakelen de
  kalenderknop uit. `pickerLabel` kan de toegankelijke standaardnaam “Kalender openen” vervangen.
- `Breadcrumbs` ontvangt voorouders als `items` met stabiele `id`, `label` en interne `href`, plus `currentPage`.
  NavLink verzorgt de routernavigatie en native modifierklikken. Alleen de huidige pagina heeft `aria-current="page"`
  en is tekst. Zonder voorouders blijft alleen die pagina over. `label` benoemt de navigatie (standaard “Kruimelpad”).
- `CopyButton` schrijft uitsluitend na activering `value` via de Clipboard API. Tijdens het wachten weigert de knop
  dubbele acties en behoudt hij focus. “Gekopieerd.” verschijnt pas na succes, via een live status. Bij weigering of een
  ontbrekende API volgt een alert: “Kopiëren is niet gelukt. Selecteer en kopieer de tekst zelf.” De app houdt de brontekst
  zichtbaar; er is geen automatische retry, verouderde succesmelding voor een gewijzigde waarde of verborgen fallback.
  `label`, `copiedLabel` en `errorLabel` zijn aanpasbaar. De browser vereist een veilige context en klembordtoestemming.

Gebruik beide invoervelden binnen de bestaande Form/FormField-binding. Nieuwe recepten zijn niet nodig: focusring,
aanraakdoelen en kleuren volgen Input, Button en NavLink. Bronnen: `src/core/web/ui/password-input.tsx`,
`date-input.tsx`, `breadcrumbs.tsx`, `copy-button.tsx`; teksten in `src/core/web/copy/ui.ts`.

Gedragstests staan naast de componenten; `input-utilities-form.test.tsx` controleert de echte RHF-binding, payload,
validatie, foutfocus en reset. `e2e/input-utilities.spec.ts` controleert de echte stack op 375/1280 px, licht/donker,
native invoer, klembord, routernavigatie, CSP en axe. De bestaande `e2e/login-password-visibility.spec.ts` blijft
ongewijzigd als regressiecontrole. `compound-input-controls.test.tsx` dekt de wachtwoordselectie, kalenderknop, vergrendeling en terugval;
`e2e/compound-input-controls.spec.ts` meet hoogte, uitlijning en tussenruimte op beide schermbreedtes en in beide thema's.
Testdekking is geen geslaagde checkuitslag; die staat in de oplevering.
