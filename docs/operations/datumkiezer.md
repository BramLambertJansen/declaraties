# Datumkiezer in verschillende browsers

`src/core/web/ui/date-input.tsx` gebruikt een native datumveld met een `YYYY-MM-DD`-waarde.
Als de browser `showPicker` ondersteunt, kan de extra kalenderknop die openen en blijft de dubbele native indicator verborgen.
Ontbreekt die mogelijkheid, dan blijft de native bediening zichtbaar en wordt geen extra knop getoond. Weigert de browser
de aanroep alsnog, dan herstelt het component de native bediening. Er is geen browser- of apparaatherkenning.

`date-input-fallback.test.tsx` bewijst ontbrekende en geweigerde mogelijkheden; de bestaande component- en formuliertests
bewaken waarde, grenzen, ref, focus, readonly/disabled en de knop wanneer die beschikbaar is. DOM-tests bewijzen niet hoe
elke browser zijn eigen kalender tekent; daarvoor blijft de echte UI-runner van toepassing.
