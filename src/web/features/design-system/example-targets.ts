import type { VakId } from './vakken.ts';

// Eén vindplaats per bestaand kitonderdeel, met het tabblad waar die staat; de bronindex blijft de inventaris bepalen.
export interface ExampleTarget {
  readonly names: readonly string[];
  readonly id: string;
  readonly vak: VakId;
  readonly text: string;
}

const groups: readonly ExampleTarget[] = [
  {
    names: ['PasswordInput', 'DateInput'],
    id: 'example-input-utilities',
    vak: 'formulieren',
    text: 'Toon en verberg een wachtwoord, vul een native datumveld in en probeer validatie en reset.',
  },
  {
    names: ['Breadcrumbs'],
    id: 'example-breadcrumbs',
    vak: 'layout',
    text: 'Navigeer naar een bovenliggende pagina; de huidige pagina is tekst.',
  },
  {
    names: ['CopyButton'],
    id: 'example-copy-button',
    vak: 'acties',
    text: 'Kopieer het zichtbare voorbeeldadres naar het klembord.',
  },
  {
    names: ['FormErrorSummary', 'FormChanges', 'UnsavedChangesGuard', 'EditableSection'],
    id: 'example-editable-details',
    vak: 'patronen',
    text: 'Bewerk contactgegevens, verstuur ongeldige invoer, wis wijzigingen of probeer de pagina te verlaten.',
  },
  {
    names: ['BulkActions'],
    id: 'example-bulk-actions',
    vak: 'patronen',
    text: 'Selecteer rijen, verwerk ze en kies Afronden; mislukte rijen blijven geselecteerd.',
  },
  {
    names: ['DataTable', 'DataTableHeading'],
    id: 'example-data-table',
    vak: 'gegevens',
    text: 'Zoek, filter, sorteer, selecteer en laad lokale rijen.',
  },
  {
    names: ['Tabs'],
    id: 'example-tabs',
    vak: 'gegevens',
    text: 'Pijltjes verplaatsen focus; Enter activeert. Invoer blijft bewaard.',
  },
  {
    names: ['Gallery', 'GalleryImage'],
    id: 'example-gallery',
    vak: 'gegevens',
    text: 'Open de preview en bekijk lege en ontbrekende afbeeldingen.',
  },
  {
    names: ['Combobox', 'ComboboxPopup'],
    id: 'example-combobox',
    vak: 'formulieren',
    text: 'Zoek en kies een optie; bekijk ook disabled, invalid en de dialoog.',
  },
  {
    names: ['FormComboboxField'],
    id: 'example-form-combobox',
    vak: 'formulieren',
    text: 'Echte formulierbinding met validatie, serverveldfout en reset.',
  },
  {
    names: ['Accordion', 'AccordionItem'],
    id: 'example-accordion',
    vak: 'gegevens',
    text: 'Open en sluit single of multiple; de tweede instantie wordt door de ouder beheerd.',
  },
  {
    names: ['List', 'ListItem'],
    id: 'example-list',
    vak: 'gegevens',
    text: 'Lijst met zelfstandige acties, lange inhoud en een lege lijst.',
  },
  {
    names: ['DescriptionList'],
    id: 'example-description-list',
    vak: 'gegevens',
    text: 'Termen en waarden, lange inhoud en een leeg metadataoverzicht.',
  },
  { names: ['Button'], id: 'example-button', vak: 'acties', text: 'Knopvarianten; busy staat eronder.' },
  {
    names: ['Dialog'],
    id: 'example-dialog',
    vak: 'acties',
    text: 'Open de dialoog. De mobiele sheet zit in het hoofdmenu.',
  },
  {
    names: ['DropdownMenu'],
    id: 'example-dropdown',
    vak: 'acties',
    text: 'Open het menu; busy-items staan in het aparte busy-voorbeeld.',
  },
  {
    names: ['NavLink', 'Sidebar', 'Topbar', 'AppShell', 'ThemeToggle'],
    id: 'example-layout',
    vak: 'layout',
    text: 'Bekijk de echte navigatie en topbalk rondom deze pagina; open op mobiel het hoofdmenu.',
  },
  {
    names: ['ToastProvider', 'ToastCard', 'Toaster'],
    id: 'example-toast',
    vak: 'meldingen',
    text: 'Toon een toast. Provider en interne ToastCard werken via deze compositie.',
  },
  {
    names: ['ErrorTextsProvider', 'RouteError', 'NotFound'],
    id: 'example-errors',
    vak: 'meldingen',
    text: 'De foutpreview gebruikt de globale fouttekstenprovider.',
  },
  {
    names: ['AsyncView'],
    id: 'example-async',
    vak: 'meldingen',
    text: 'Kies laden, fout, leeg of resultaat; na een fout werkt Opnieuw proberen.',
  },
  {
    names: ['Card', 'CardHeader', 'CardTitle', 'CardDescription', 'CardContent', 'CardFooter'],
    id: 'example-card',
    vak: 'gegevens',
    text: 'De onderdelen vormen samen deze kaart.',
  },
  {
    names: ['PageTitle', 'PageHeader'],
    id: 'example-header',
    vak: 'layout',
    text: 'Paginakop met titel en actie.',
  },
  { names: ['Notice'], id: 'example-notice', vak: 'meldingen', text: 'Elke meldingstoon onder elkaar.' },
  { names: ['CenteredCard'], id: 'example-centered', vak: 'layout', text: 'Preview zonder extra main of paginatitel.' },
  {
    names: ['Checkbox', 'RadioGroup', 'Textarea'],
    id: 'example-controls',
    vak: 'formulieren',
    text: 'Interactief formulier; disabled en invalid volgen eronder.',
  },
  {
    names: ['ConfirmDialog'],
    id: 'example-confirm',
    vak: 'acties',
    text: 'Open de bevestiging en bevestig om busy te bekijken.',
  },
  {
    names: ['EmptyState'],
    id: 'example-empty',
    vak: 'meldingen',
    text: 'Lege inhoud met en zonder beschrijving en actie.',
  },
  {
    names: ['Field', 'Form', 'FormField', 'Input', 'Select', 'FormCheckboxField', 'FormRadioGroupField'],
    id: 'example-form-states',
    vak: 'formulieren',
    text: 'Validatie, disabled velden, serverfouten, veldfouten en bestuurbare pending-submit.',
  },
  {
    names: ['ListToolbar'],
    id: 'example-toolbar',
    vak: 'patronen',
    text: 'Zoek, filter of sorteer; daarna verschijnt Filters wissen.',
  },
  { names: ['QrCode'], id: 'example-qr', vak: 'gegevens', text: 'QR-code met voorbeelddata.' },
  {
    names: ['Table', 'TableHeader', 'TableBody', 'TableRow', 'TableHead', 'TableCell'],
    id: 'example-table',
    vak: 'gegevens',
    text: 'Alle tabelonderdelen in één voorbeeld.',
  },
  { names: ['StatusBadge'], id: 'example-badges', vak: 'meldingen', text: 'Alle vijf toonvarianten naast elkaar.' },
  {
    names: ['Text', 'Heading', 'Stack', 'Inline'],
    id: 'example-typografie',
    vak: 'layout',
    text: 'Typografie en afstand uit componenten: tekstgrootte, toon en gewicht, koppen per niveau en verticale of horizontale stapels.',
  },
  {
    names: ['TokenSwatch', 'TypeSample'],
    id: 'example-tokens',
    vak: 'basis',
    text: 'Elke kleur, tekstmaat, gewicht en het monolettertype; dichtheid, lagen en beweging als klasse en token.',
  },
  { names: ['Section'], id: 'example-layout', vak: 'layout', text: 'De benoemde voorbeeldblokken gebruiken Section.' },
];

export function exampleTarget(name: string): ExampleTarget | undefined {
  return groups.find((group) => group.names.includes(name));
}

export function showExample(id: string) {
  const target = document.getElementById(id);
  target?.focus();
  target?.scrollIntoView({ block: 'start' });
}
