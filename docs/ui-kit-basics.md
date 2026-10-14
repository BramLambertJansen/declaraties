# UI-basiselementen gebruiken

De uitbreiding volgt [de goedgekeurde spec](specs/ui-kit-basics.md). Importeer componenten via
`src/web/ui/index.ts`; de voorbeelden staan op de bestaande, beveiligde `/design-system`-route.

## Invoervelden

- `Textarea` gebruikt dezelfde inputtokens als Input. Geef domeinlimieten vanuit het schema/de app door.
- `Checkbox` heeft een klikbaar `label` en native booleansemantiek. Arrayselectie en indeterminate vallen buiten deze kit.
- `RadioGroup` krijgt `label`, `value`, `options` en `onValueChange`. Native radios verzorgen selectie en toetsenbediening.
  `description` en `error` worden aan elke optie gekoppeld. De ref wijst naar de eerste niet-uitgeschakelde optie.
- Gebruik binnen `Form` de bestaande `useZodForm`. `FormField` bindt stringvelden, inclusief Textarea;
  `FormCheckboxField` bindt uitsluitend booleanvelden en `FormRadioGroupField` uitsluitend stringvelden.
  Geef passende defaultwaarden door. Een ontbrekende of ongeschikte default veroorzaakt een assertion, geen stille lege waarde.
- Reset en schema-/serverfouten blijven via RHF lopen. `Form.fieldForCode` koppelt de serverfout en focust het veld of groepsanker.

Bronnen: `src/core/web/ui/form.tsx:94`, `src/core/web/ui/form-checkbox-field.tsx:15`,
`src/core/web/ui/form-radio-group-field.tsx:15`, `src/web/features/design-system/ui-basics-examples.tsx`.
Additieve acceptatietests: `src/core/web/ui/form-controls.test.tsx`. Bestaande tests blijven ongewijzigd.

## Status en leegte

`StatusBadge` presenteert aangeleverde tekst met `tone="neutral"`, `accent` of `destructive`.
De tekst-/vlakparen zijn dezelfde als de bestaande contrasttest voor muted, accent en destructive Button,
in licht en donker (`test/ui/contrast.test.ts`). Core kent geen accountstatussen.

`EmptyState` heeft `title`, optionele `description` en `action`. De app beslist over toegang tot de actie.
Gebruik `AsyncView.emptyContent` voor deze samengestelde weergave, naast `isEmpty`; zonder custom inhoud
blijft `emptyText` gelden. Loading/error/retry blijven in AsyncView.

## Busy acties

`Button.busy` en `busyLabel` tonen de actie in uitvoering. `aria-disabled` bewaart focus;
capturehandlers weigeren click en Enter/Space voordat de actie of native submit/navigatie kan plaatsvinden.
Ook `asChild` behoudt zijn element tijdens de labelwissel. Geef een geschikt aangeleverd busy-label door,
ook wanneer de gewone knop uitsluitend een pictogram heeft. Native `disabled` blijft beschikbaar.

Menu-items ondersteunen `busy`, `busyLabel` en `disabled`. Busy blijft focusbaar; disabled wordt door
Radix overgeslagen. Beide weigeren selectie en sluiten het menu niet. De caller beëindigt busy,
bijvoorbeeld bij succes of fout; de kit doet geen automatische retry, timer of toast.

Voorbeelden: `src/web/features/design-system/ui-basics-examples.tsx`. De voorbeeldquery in `queries.ts`
levert uitsluitend lokale fictieve data; er zijn geen nieuwe API-aanroepen of rechten.

## Acceptatiebewijs

| Criteria | Testpad |
|---|---|
| AC-1 t/m AC-5: bestaande binding, textarea, boolean, radio, schema-/serverfout, default en reset | `src/core/web/ui/form-controls.test.tsx`, bestaande `form.test.tsx` |
| AC-6/7: aangeleverde badgetekst, EmptyState met/zonder actie en AsyncView-fallback | `src/core/web/ui/empty-state.test.tsx`, bestaande `async-view.test.tsx` |
| AC-8: focus, dubbele activering, asChild-capture/naam, submit, menu en herstel | `src/core/web/ui/button-busy.test.tsx`, `src/core/web/ui/dropdown-menu-busy.test.tsx` |
| AC-6/9/10: alle tonen en voorbeelden, native Space/pijltjestoetsen, mobiel/desktop, licht/donker, CSP en axe | `e2e/ui-kit-basics.spec.ts`, `check:catalogus`, bestaande `test/ui/contrast.test.ts` |

De tabel beschrijft de testdekking; de werkelijke uitslagen en gevalideerde commit staan in de bouw-PR.
