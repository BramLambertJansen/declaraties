import { Bell } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { copy } from '#web/copy/ui.ts';
import {
  Button,
  buttonVariantMap,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  DropdownMenu,
  Form,
  FormField,
  Input,
  ListToolbar,
  Notice,
  PageHeader,
  QrCode,
  Section,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
  useZodForm,
} from '#web/ui/index.ts';

// Catalogus van de basiskit (framework §7, spec design-system), ook in productie achter guard('design-system:read'). Elke
// component met elke variant; de e2e-test draait axe op 375 en 1280 px, in licht en donker. De teksten zijn voorbeelden, geen
// app-teksten. Alleen voorbeelddata en geen API-aanroepen: de chunk is statisch en voor iedereen te downloaden (AC-10).
// AppShell, CenteredCard en ThemeToggle staan er niet los in: de eerste twee zijn een heel scherm met een eigen main, de
// themaschakelaar staat al in de topbalk (uitzonderingen in scripts/kit/catalogus.mjs).

function isVariant(value: string): value is keyof typeof buttonVariantMap.variant {
  return value in buttonVariantMap.variant;
}

const voorbeeld = z.object({
  naam: z.string().min(1, 'Vul een naam in.'),
  email: z.email('Vul een geldig e-mailadres in.'),
  rol: z.enum(['user', 'admin']),
});

function FormExample() {
  const form = useZodForm(voorbeeld, { naam: '', email: '', rol: 'user' });
  return (
    <Form form={form} onSubmit={() => Promise.resolve()} submitLabel="Versturen">
      <FormField form={form} name="naam" label="Naam">
        {(field) => <Input {...field} autoComplete="name" />}
      </FormField>
      <FormField form={form} name="email" label="E-mailadres" description="We sturen hier een uitnodiging heen.">
        {(field) => <Input {...field} type="email" autoComplete="email" />}
      </FormField>
      <FormField form={form} name="rol" label="Rol">
        {(field) => (
          <Select
            {...field}
            options={[
              { value: 'user', label: 'Gebruiker' },
              { value: 'admin', label: 'Beheerder' },
            ]}
          />
        )}
      </FormField>
    </Form>
  );
}

// Voorbeeld met een actie die even duurt (zoals een mutatie): tijdens "Bezig…" sluit de dialoog niet, daarna een status.
const EXAMPLE_ACTION_MS = 1500;

function ConfirmDialogExample() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button
        variant="destructive"
        onClick={() => {
          setDone(false);
          setOpen(true);
        }}
      >
        Account blokkeren
      </Button>
      {done ? <p role="status">Geblokkeerd (voorbeeld)</p> : null}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Account blokkeren?"
        description="Een voorbeeld: de focus staat op Annuleren, de actie is rood."
        confirmLabel="Blokkeren"
        busy={busy}
        onConfirm={() => {
          setBusy(true);
          setTimeout(() => {
            setBusy(false);
            setOpen(false);
            setDone(true);
          }, EXAMPLE_ACTION_MS);
        }}
      />
    </div>
  );
}

const EXAMPLE_ROLES = [
  { value: '', label: 'Alle rollen' },
  { value: 'user', label: 'Gebruiker' },
  { value: 'admin', label: 'Beheerder' },
];
const EXAMPLE_SORTS = [
  { value: 'nieuwste', label: 'Nieuwste eerst' },
  { value: 'oudste', label: 'Oudste eerst' },
  { value: 'naam-az', label: 'Naam A–Z' },
  { value: 'naam-za', label: 'Naam Z–A' },
];

// Lokale state in plaats van search params: de catalogus heeft geen lijst en geen API. Op een echte pagina staat dit in useListSearch.
function ListToolbarExample() {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [sort, setSort] = useState('nieuwste');
  const roleLabel = role === '' ? 'alle' : (EXAMPLE_ROLES.find((option) => option.value === role)?.label ?? role);
  const sortLabel = EXAMPLE_SORTS.find((option) => option.value === sort)?.label ?? sort;
  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        searchLabel="Zoeken"
        searchHint="Zoek op naam of e-mailadres."
        query={query}
        onQueryChange={setQuery}
        filters={[{ id: 'rol', label: 'Rol', value: role, options: EXAMPLE_ROLES, onChange: setRole }]}
        sortLabel="Sorteren"
        sort={sort}
        sortOptions={EXAMPLE_SORTS}
        onSortChange={setSort}
        onClear={() => {
          setQuery('');
          setRole('');
        }}
      />
      <p role="status">{`Zoeken: ${query === '' ? 'geen' : query}; rol: ${roleLabel}; sortering: ${sortLabel}`}</p>
    </div>
  );
}

function DialogExample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        Dialoog openen
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Account uitnodigen"
        description="Een voorbeeld van een dialoog met knoppen."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
              }}
            >
              Annuleren
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
              }}
            >
              Bevestigen
            </Button>
          </>
        }
      >
        <p>De inhoud van de dialoog.</p>
      </Dialog>
    </>
  );
}

function ToastExample() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="outline"
        onClick={() => {
          toast.success('Wijziging opgeslagen.');
        }}
      >
        Toon succes-toast
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          toast.error('Opslaan mislukt. Probeer het later opnieuw.');
        }}
      >
        Toon fout-toast
      </Button>
    </div>
  );
}

export function DesignSystemPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader title={copy.designSystem.title} />

      <Section title="Button">
        <div className="flex flex-wrap gap-3">
          {Object.keys(buttonVariantMap.variant)
            .filter(isVariant)
            .map((variant) => (
              <Button key={variant} variant={variant}>
                {variant}
              </Button>
            ))}
          <Button disabled>Uitgeschakeld</Button>
          <Button size="icon" variant="outline" aria-label="Meldingen">
            <Bell aria-hidden="true" />
          </Button>
        </div>
      </Section>

      <Section title="Form, Field en Input">
        <div className="max-w-sm">
          <FormExample />
        </div>
      </Section>

      <Section title="PageHeader en Notice">
        <PageHeader title="Accounts" documentTitle={false} actions={<Button>Account uitnodigen</Button>} />
        <Notice>Uitnodiging verstuurd naar anna@example.test.</Notice>
        <Notice tone="error">Er ging iets mis. Probeer het later opnieuw.</Notice>
      </Section>

      <Section title="Toast">
        <ToastExample />
      </Section>

      <Section title="Table">
        <Table label="Voorbeeldtabel">
          <TableHeader>
            <TableRow>
              <TableHead>Naam</TableHead>
              <TableHead>E-mailadres</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Anna de Vries</TableCell>
              <TableCell>anna@example.test</TableCell>
              <TableCell>Beheerder</TableCell>
              <TableCell>Actief</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Bert Jansen</TableCell>
              <TableCell>bert@example.test</TableCell>
              <TableCell>Gebruiker</TableCell>
              <TableCell>Uitgenodigd</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section title="QrCode">
        <QrCode value="otpauth://totp/voorbeeld?secret=JBSWY3DPEHPK3PXP" label="Voorbeeld-QR-code" />
      </Section>

      <Section title="Card">
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Kaarttitel</CardTitle>
            <CardDescription>Een korte beschrijving.</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Inhoud van de kaart.</p>
          </CardContent>
          <CardFooter>
            <Button variant="secondary">Actie</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Dialog">
        <DialogExample />
      </Section>

      <Section title="ConfirmDialog">
        <ConfirmDialogExample />
      </Section>

      <Section title="ListToolbar">
        <ListToolbarExample />
      </Section>

      <Section title="DropdownMenu">
        <DropdownMenu
          align="start"
          trigger={<Button variant="outline">Menu openen</Button>}
          items={[
            { label: 'Profiel', onSelect: () => undefined },
            { label: 'Uitloggen', onSelect: () => undefined },
          ]}
        />
      </Section>
    </div>
  );
}
