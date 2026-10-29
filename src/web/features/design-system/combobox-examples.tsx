import { useState } from 'react';
import { z } from 'zod';
import { ApiError } from '#core/web/lib/api-client.ts';
import {
  Button,
  Combobox,
  Dialog,
  Field,
  Form,
  FormComboboxField,
  Section,
  Select,
  useZodForm,
} from '#web/ui/index.ts';

const options = [
  { value: 'user', label: 'Gebruiker' },
  { value: 'admin', label: 'Beheerder' },
  { value: 'disabled', label: 'Uitgeschakeld', disabled: true },
];
const texts = { placeholder: 'Kies een optie', emptyText: 'Geen resultaten.' };
const schema = z
  .object({ role: z.string().min(1, 'Kies een rol.'), preference: z.string().min(1, 'Kies een voorkeur.') })
  .strict();

export function ComboboxExamples() {
  return (
    <>
      <Section id="example-combobox" title="Combobox">
        <p>
          Zoek op een label. Kies met Enter of een klik; Escape of Tab behoudt je vorige keuze. Wissen maakt de keuze
          leeg.
        </p>
        <StandaloneComboboxes />
        <ComboboxDialogExample />
      </Section>
      <Section id="example-form-combobox" title="FormComboboxField">
        <p>Verstuur leeg voor validatie, of kies een serverveldfout. Annuleren herstelt ook een lopende zoekactie.</p>
        <ComboboxFormExample />
      </Section>
    </>
  );
}

function StandaloneComboboxes() {
  const [value, setValue] = useState('user');
  const [empty, setEmpty] = useState('');
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Field id="combobox-role" label="Rol">
        <Combobox
          id="combobox-role"
          value={value}
          onValueChange={setValue}
          options={options}
          {...texts}
          clearable
          clearLabel="Keuze wissen"
        />
      </Field>
      <Field id="combobox-preference" label="Voorkeur">
        <Combobox id="combobox-preference" value={empty} onValueChange={setEmpty} options={options} {...texts} />
      </Field>
      <Field id="combobox-disabled" label="Uitgeschakeld">
        <Combobox
          id="combobox-disabled"
          value="user"
          onValueChange={() => undefined}
          options={options}
          {...texts}
          disabled
          clearable
          clearLabel="Keuze wissen"
        />
      </Field>
      <Field id="combobox-invalid" label="Rol: invalid" description="Kies een optie" error="Kies een rol.">
        <Combobox
          id="combobox-invalid"
          value=""
          onValueChange={() => undefined}
          options={[]}
          {...texts}
          aria-invalid
          aria-describedby="combobox-invalid-hulp combobox-invalid-fout"
        />
      </Field>
      <output aria-label="Rolwaarde">{value}</output>
    </div>
  );
}

function ComboboxDialogExample() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        Combobox in dialoog
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Combobox in dialoog" description="Kies een rol.">
        <div className="flex flex-col gap-4 pb-4">
          <Field id="combobox-dialog-role" label="Rol">
            <Combobox
              id="combobox-dialog-role"
              value={value}
              onValueChange={setValue}
              options={options}
              {...texts}
              clearable
              clearLabel="Keuze wissen"
            />
          </Field>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
            }}
          >
            Annuleren
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function ComboboxFormExample() {
  const form = useZodForm(schema, { role: '', preference: 'user' });
  const [mode, setMode] = useState('success');
  const [disabled, setDisabled] = useState(false);
  const [sent, setSent] = useState<z.output<typeof schema> | null>(null);
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Field id="combobox-submit-mode" label="Uitkomst versturen">
        <Select
          id="combobox-submit-mode"
          value={mode}
          options={[
            { value: 'success', label: 'Succes' },
            { value: 'field', label: 'Serverveldfout' },
          ]}
          onChange={(event) => {
            setMode(event.currentTarget.value);
            form.clearErrors();
          }}
        />
      </Field>
      <Button
        variant="outline"
        onClick={() => {
          setDisabled(!disabled);
        }}
      >
        {disabled ? 'Velden inschakelen' : 'Velden uitschakelen'}
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          form.reset();
          setSent(null);
        }}
      >
        Annuleren
      </Button>
      <Form
        form={form}
        submitLabel="Versturen"
        fieldForCode={{ ALREADY_EXISTS: 'role' }}
        onSubmit={(values) => {
          setSent(null);
          if (mode === 'field') return Promise.reject(new ApiError('ALREADY_EXISTS', 409));
          setSent(values);
          return Promise.resolve();
        }}
      >
        <FormComboboxField
          form={form}
          name="role"
          label="Rol"
          options={options}
          disabled={disabled}
          {...texts}
          description="Kies een rol."
          clearable
          clearLabel="Keuze wissen"
        />
        <FormComboboxField
          form={form}
          name="preference"
          disabled={disabled}
          label="Voorkeur"
          options={options}
          {...texts}
          clearable
          clearLabel="Keuze wissen"
        />
      </Form>
      {sent === null ? null : <output>{JSON.stringify(sent)}</output>}
    </div>
  );
}
