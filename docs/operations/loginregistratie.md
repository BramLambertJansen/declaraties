# Loginregistratie en MFA-inschrijving

`src/core/api/auth/account-lifecycle.ts` registreert alleen een voltooide login (ADR 0052).
De before-hook onderscheidt een TOTP-loginchallenge van het instellen van MFA binnen een bestaande sessie.

- Een gebruiker met een al geldige login die optioneel MFA instelt, houdt zijn bestaande laatste-logintijdstip.
- Een beheerder die na het wachtwoord nog zijn verplichte MFA moet instellen, voltooit daarmee zijn login en krijgt
  wel een tijdstip. De app levert deze MFA-eis via de bestaande callback; auth leest geen app-tabellen.
- Een reeds met MFA geauthenticeerde sessie krijgt door nogmaals verifiëren geen nieuwe loginregistratie.

`test/auth/enrollment-login.int.test.ts` bewijst de optionele inschrijving met echte auth, cookies en database.
`test/auth/login-tracking.int.test.ts` bewaakt de verplichte inschrijving, nieuwe challenges, races en mislukte logins.
