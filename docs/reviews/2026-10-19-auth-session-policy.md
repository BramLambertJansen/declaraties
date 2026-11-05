# Sessiebeleid op directe authenticatieroutes

Vervolg op de [codereview](2026-10-19-review-regressions.md): de gateway weigerde een geblokkeerd account of een sessie
ouder dan zeven dagen, maar directe Better Auth-routes gebruikten die controle niet. Na een mislukte sessie-opruiming
kon zo'n bestaande sessie nog accountgegevens uitlezen of authenticatie-instellingen wijzigen.

`src/core/api/auth/session-policy.ts` bevat de gedeelde beslissing voor blokkade en absolute duur. De bestaande
gatewaycontrole blijft bestaan. De Better Auth-hooks controleren ook de directe endpoints vóór hun actie. Voor
`get-session` wordt het resultaat na de sessie-opvraging gecontroleerd: een ongeldige sessie geeft `null`, zonder
sessiegegevens of token. Andere sessie-acties geven 401 `UNAUTHENTICATED`. De verlopen cookie wordt gewist met
Better Auths cookiehelper. Het verwijderen van de sessierijen is opruimwerk: een fout wordt gelogd en maakt de
sessie niet alsnog bruikbaar.

Inloggen, het eenmalige wachtwoord-resetpad en uitloggen blijven beschikbaar met een oude sessiecookie. Die acties
verlenen geen toegang op basis van die oude sessie; blokkade bij het maken van een nieuwe sessie blijft afgedwongen
door de bestaande databasehook. MFA-, verse-sessie-, CSRF- en rate-limitcontroles blijven gelden.

`test/auth/session-policy.int.test.ts` gebruikt de echte database, Better Auth en Mailpit. De tests laten een sessie
na blokkeren staan, maken een sessie ouder dan de absolute grens en laten sessie-opruiming vastlopen met een echte
rijlock. Ze controleren ook dat het oude wachtwoord blijft werken na een geweigerde wijziging en dat geldige
sessies TOTP kunnen instellen en kunnen uitloggen. Dit is onderhoud in fase 1, binnen ADR 0003 en ADR 0026;
de PR vermeldt de werkelijk uitgevoerde checks. Er zijn geen nieuwe routes, permissies of migraties.
