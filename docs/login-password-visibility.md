# Wachtwoord tonen bij inloggen

Op `/login` kan de gebruiker het ingevulde wachtwoord tijdelijk zichtbaar maken met **Wachtwoord tonen**. Nogmaals
activeren schermt het weer af. Het veld begint afgeschermd en behoudt bij wisselen zijn waarde en autocomplete-instelling.
Automatische hoofdletters, autocorrectie en spellingcontrole staan voor dit veld uit, ook bij zichtbare invoer.

De bestaande Button is een toggle met een vaste naam, `aria-pressed` voor de toestand en `aria-controls` naar het veld.
De actieve variant maakt de toestand ook visueel herkenbaar. De knop werkt met muis, Enter en Spatie en verstuurt het
formulier niet. Enter in het wachtwoordveld blijft inloggen, ook wanneer de tekens zichtbaar zijn.

De zichtbaarheid blijft alleen in het geheugen van het inlogformulier. Na opnieuw laden begint het formulier weer
afgeschermd. Dit wijzigt geen authenticatie-, validatie- of MFA-regels en introduceert geen route, permissie of opslag.

`e2e/login-password-visibility.spec.ts` controleert tegen de echte stack op 375 en 1280 px: standaard afschermen,
tonen/verbergen met behoud van invoer, toetsenbordbediening zonder submit, toegankelijke toggle, geen horizontale
overflow, axe, opnieuw laden en één geslaagde login via Enter met een zichtbaar wachtwoord.
