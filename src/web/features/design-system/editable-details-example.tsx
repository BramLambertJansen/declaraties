import { useState } from 'react';
import { z } from 'zod';
import {
  Button,
  ConfirmDialog,
  DescriptionList,
  EditableSection,
  Form,
  FormChanges,
  FormField,
  Input,
  NavLink,
  Notice,
  Section,
  UnsavedChangesGuard,
  useZodForm,
} from '#web/ui/index.ts';

const schema = z
  .object({
    name: z.string().min(1, 'Vul een naam in.'),
    email: z.email('Vul een geldig e-mailadres in.'),
  })
  .strict();
const initial = { name: 'Anna de Vries', email: 'anna@example.test' };
const summary = {
  title: 'Controleer de invoer',
  fields: [
    { name: 'name', label: 'Naam' },
    { name: 'email', label: 'E-mailadres' },
  ],
} as const;

export function EditableDetailsExample() {
  const [saved, setSaved] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const form = useZodForm(schema, saved);
  const close = () => {
    form.reset(saved);
    setEditing(false);
    setConfirm(false);
  };
  return (
    <Section id="example-editable-details" title="Detail bekijken en bewerken">
      <p>
        Dit voorbeeld bewaart lokaal. Bewerk gegevens, controleer fouten of probeer de pagina met gewijzigde invoer te
        verlaten.
      </p>
      <Notice>{done ? 'Wijziging opgeslagen.' : 'Voorbeeldgegevens; wijzigingen verlaten de browser niet.'}</Notice>
      <EditableSection
        title="Contactgegevens"
        editing={editing}
        editLabel="Contactgegevens bewerken"
        onEdit={() => {
          setEditing(true);
          setDone(false);
        }}
        summary={
          <DescriptionList
            items={[
              { id: 'name', term: 'Naam', value: saved.name },
              { id: 'email', term: 'E-mailadres', value: saved.email },
            ]}
          />
        }
      >
        <Form
          form={form}
          submitLabel="Contactgegevens opslaan"
          errorSummary={summary}
          onSubmit={(values) => {
            setSaved(values);
            form.reset(values);
            setEditing(false);
            setDone(true);
            return Promise.resolve();
          }}
          secondaryAction={
            <Button
              variant="outline"
              onClick={() => {
                if (form.formState.isDirty) setConfirm(true);
                else close();
              }}
            >
              Annuleren
            </Button>
          }
        >
          <FormField form={form} name="name" label="Naam">
            {(field) => <Input {...field} autoComplete="name" />}
          </FormField>
          <FormField form={form} name="email" label="E-mailadres">
            {(field) => <Input {...field} autoComplete="email" />}
          </FormField>
          <FormChanges
            form={form}
            message="Onopgeslagen wijzigingen"
            discardLabel="Wijzigingen wissen"
            focusOnDiscard="name"
          />
        </Form>
      </EditableSection>
      <NavLink href="/admin/accounts">Terug naar accounts</NavLink>
      <UnsavedChangesGuard
        when={editing && form.formState.isDirty}
        busy={form.formState.isSubmitting}
        title="Pagina verlaten?"
        description="Je hebt onopgeslagen wijzigingen. Bij verlaten gaan deze verloren."
        discardLabel="Wijzigingen verwerpen en verlaten"
      />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Wijzigingen verwerpen?"
        description="De opgeslagen gegevens blijven behouden."
        confirmLabel="Wijzigingen verwerpen"
        onConfirm={close}
      />
    </Section>
  );
}
