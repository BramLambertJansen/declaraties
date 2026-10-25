# Focus van het foutenoverzicht

`src/core/web/ui/form-error-summary.tsx` focust het overzicht na een mislukte verzendpoging en bij nieuwe serverveldfouten
na clientvalidatie. De serverfouten worden onderscheiden via het bestaande RHF-type `server`, zoals Form dat gebruikt.
De focus volgt de uitgestelde veldfocus van RHF. Wijzigende gewone veldfouten tijdens invoer trekken de focus niet terug.

`form-summary-late-errors.test.tsx` bewaakt later toegevoegde fouten en focusbehoud. De bestaande
`form-summary-focus.test.tsx` bewaakt clientvalidatie en serverfouten tijdens de normale verzendcyclus.
