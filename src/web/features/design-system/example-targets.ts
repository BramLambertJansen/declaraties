// Eén vindplaats per bestaand kitonderdeel; de bronindex blijft de inventaris bepalen.
const groups = [
  {
    names: ['Combobox', 'ComboboxPopup'],
    id: 'example-combobox',
    text: 'Zoek en kies een optie; bekijk ook disabled, invalid en de dialoog.',
  },
  {
    names: ['FormComboboxField'],
    id: 'example-form-combobox',
    text: 'Echte formulierbinding met validatie, serverveldfout en reset.',
  },
  {
    names: ['Accordion', 'AccordionItem'],
    id: 'example-accordion',
    text: 'Open en sluit single of multiple; de tweede instantie wordt door de ouder beheerd.',
  },
  {
    names: ['List', 'ListItem'],
    id: 'example-list',
    text: 'Lijst met zelfstandige acties, lange inhoud en een lege lijst.',
  },
  {
    names: ['DescriptionList'],
    id: 'example-description-list',
    text: 'Termen en waarden, lange inhoud en een leeg metadataoverzicht.',
  },
  { names: ['Button'], id: 'example-button', text: 'Knopvarianten; busy staat verderop.' },
  { names: ['Dialog'], id: 'example-dialog', text: 'Open de dialoog. De mobiele sheet zit in het hoofdmenu.' },
  {
    names: ['DropdownMenu'],
    id: 'example-dropdown',
    text: 'Open het menu; busy-items staan in het aparte busy-voorbeeld.',
  },
  {
    names: ['NavLink', 'Sidebar', 'Topbar', 'AppShell', 'ThemeToggle'],
    id: 'example-layout',
    text: 'Bekijk de echte navigatie en topbalk rondom deze pagina; open op mobiel het hoofdmenu.',
  },
  {
    names: ['ToastProvider', 'ToastCard', 'Toaster'],
    id: 'example-toast',
    text: 'Toon een toast. Provider en interne ToastCard werken via deze compositie.',
  },
  {
    names: ['ErrorTextsProvider', 'RouteError', 'NotFound'],
    id: 'example-errors',
    text: 'De foutpreview gebruikt de globale fouttekstenprovider.',
  },
  {
    names: ['AsyncView'],
    id: 'example-async',
    text: 'Kies laden, fout, leeg of resultaat; na een fout werkt Opnieuw proberen.',
  },
  {
    names: ['Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardContent', 'CardFooter'],
    id: 'example-card',
    text: 'De onderdelen vormen samen deze kaart.',
  },
  {
    names: ['PageTitle', 'PageHeader', 'Notice'],
    id: 'example-header',
    text: 'Paginakop met titel en actie, gevolgd door beide meldingen.',
  },
  { names: ['CenteredCard'], id: 'example-centered', text: 'Preview zonder extra main of paginatitel.' },
  {
    names: ['Checkbox', 'RadioGroup', 'Textarea'],
    id: 'example-controls',
    text: 'Interactief formulier; disabled en invalid volgen eronder.',
  },
  { names: ['ConfirmDialog'], id: 'example-confirm', text: 'Open de bevestiging en bevestig om busy te bekijken.' },
  { names: ['EmptyState'], id: 'example-empty', text: 'Lege inhoud met en zonder beschrijving en actie.' },
  {
    names: ['Field', 'Form', 'FormField', 'Input', 'Select', 'FormCheckboxField', 'FormRadioGroupField'],
    id: 'example-form-states',
    text: 'Validatie, disabled velden, serverfouten, veldfouten en bestuurbare pending-submit.',
  },
  { names: ['ListToolbar'], id: 'example-toolbar', text: 'Zoek, filter of sorteer; daarna verschijnt Filters wissen.' },
  { names: ['QrCode'], id: 'example-qr', text: 'QR-code met voorbeelddata.' },
  {
    names: ['Table', 'TableHeader', 'TableBody', 'TableRow', 'TableHead', 'TableCell'],
    id: 'example-table',
    text: 'Alle tabelonderdelen in één voorbeeld.',
  },
  { names: ['StatusBadge'], id: 'example-badges', text: 'Alle drie toonvarianten naast elkaar.' },
  { names: ['Section'], id: 'example-layout', text: 'De benoemde voorbeeldblokken gebruiken Section.' },
];

export function exampleTarget(name: string) {
  return groups.find((group) => group.names.includes(name));
}

export function showExample(id: string) {
  const target = document.getElementById(id);
  target?.focus();
  target?.scrollIntoView({ block: 'start' });
}
