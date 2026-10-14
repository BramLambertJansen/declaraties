import { useState } from 'react';
import { z } from 'zod';
import { uiTexts } from '#core/web/copy/ui.ts';
import {
  Button,
  DropdownMenu,
  AsyncView,
  EmptyState,
  StatusBadge,
  Checkbox,
  Form,
  FormCheckboxField,
  FormField,
  FormRadioGroupField,
  RadioGroup,
  Section,
  Textarea,
  useZodForm,
} from '#web/ui/index.ts';
import { useEmptyExampleQuery } from './queries.ts';

const schema = z
  .object({ name: z.string().min(1, 'Vul een naam in.'), notifications: z.boolean(), role: z.enum(['user', 'admin']) })
  .strict();
const roles = [
  { value: 'user', label: 'Gebruiker' },
  { value: 'admin', label: 'Beheerder' },
];

function FormControlsExample() {
  const form = useZodForm(schema, { name: '', notifications: false, role: 'user' });
  const [sent, setSent] = useState<z.output<typeof schema> | null>(null);
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Form
        form={form}
        submitLabel="Versturen"
        onSubmit={(values) => {
          setSent(values);
          return Promise.resolve();
        }}
        secondaryAction={
          <Button
            variant="outline"
            onClick={() => {
              form.reset();
              setSent(null);
            }}
          >
            Annuleren
          </Button>
        }
      >
        <FormField form={form} name="name" label="Naam" description="Naam">
          {(field) => <Textarea {...field} />}
        </FormField>
        <FormCheckboxField form={form} name="notifications" label="Meldingen" description="Meldingen" />
        <FormRadioGroupField form={form} name="role" label="Rol" options={roles} description="Rol" />
      </Form>
      {sent === null ? null : <output>{JSON.stringify(sent)}</output>}
    </div>
  );
}

function DisabledControlsExample() {
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Textarea aria-label="Naam" value="Naam" disabled />
      <Checkbox label="Meldingen" defaultChecked disabled />
      <RadioGroup label="Rol" value="admin" options={roles} disabled onValueChange={() => undefined} />
    </div>
  );
}

function InvalidControlsExample() {
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Textarea aria-label="Naam" aria-invalid aria-describedby="textarea-example-error" defaultValue="" />
      <p id="textarea-example-error">Vul een naam in.</p>
      <Checkbox label="Meldingen" aria-invalid aria-describedby="checkbox-example-error" />
      <p id="checkbox-example-error">Vul een naam in.</p>
      <RadioGroup label="Rol" value="" options={roles} error="Vul een naam in." onValueChange={() => undefined} />
    </div>
  );
}

export function UiBasicsExamples() {
  return (
    <>
      <Section id="example-controls" title="Textarea, Checkbox en RadioGroup">
        <FormControlsExample />
      </Section>
      <Section title="Invoervelden: disabled">
        <DisabledControlsExample />
      </Section>
      <Section title="Invoervelden: invalid">
        <InvalidControlsExample />
      </Section>
      <Section id="example-badges" title="StatusBadge">
        <div className="flex flex-wrap gap-3">
          <StatusBadge tone="neutral">Uitgenodigd</StatusBadge>
          <StatusBadge tone="accent">Actief</StatusBadge>
          <StatusBadge tone="destructive">Geblokkeerd</StatusBadge>
        </div>
      </Section>
      <Section id="example-empty" title="EmptyState en AsyncView">
        <EmptyExample />
      </Section>
      <Section title="Button: busy">
        <BusyButtonExample />
      </Section>
      <Section title="DropdownMenu: busy">
        <BusyMenuExample />
      </Section>
    </>
  );
}

function BusyButtonExample() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        busy={busy}
        busyLabel={uiTexts.busy}
        onClick={() => {
          setBusy(true);
        }}
      >
        Versturen
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          setBusy(false);
        }}
      >
        Annuleren
      </Button>
      <Button busy busyLabel={uiTexts.busy}>
        Versturen
      </Button>
    </div>
  );
}

function BusyMenuExample() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap gap-3">
      <DropdownMenu
        align="start"
        trigger={<Button variant="outline">Meldingen</Button>}
        items={[
          {
            label: 'Versturen',
            busy,
            busyLabel: uiTexts.busy,
            onSelect: () => {
              setBusy(true);
            },
          },
          {
            label: 'Annuleren',
            onSelect: () => {
              setBusy(false);
            },
          },
          { label: 'Geblokkeerd', disabled: true, onSelect: () => undefined },
          { label: 'Bezig…', busy: true, onSelect: () => undefined },
        ]}
      />
      {busy ? <p role="status">{uiTexts.busy}</p> : null}
    </div>
  );
}

function EmptyExample() {
  const query = useEmptyExampleQuery();
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <EmptyState title={uiTexts.empty} />
      <AsyncView
        query={query}
        isEmpty={(items) => items.length === 0}
        emptyContent={
          <EmptyState
            title={uiTexts.empty}
            description={uiTexts.empty}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setDone(true);
                }}
              >
                Versturen
              </Button>
            }
          />
        }
      >
        {(items) => <p>{items.join(' ')}</p>}
      </AsyncView>
      {done ? <p role="status">Actief</p> : null}
    </div>
  );
}
