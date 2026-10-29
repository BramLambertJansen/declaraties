import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ApiError } from '#core/web/lib/api-client.ts';
import {
  Button,
  Field,
  Form,
  FormCheckboxField,
  FormField,
  FormRadioGroupField,
  Input,
  Section,
  Select,
  useZodForm,
} from '#web/ui/index.ts';

const roles = [
  { value: 'user', label: 'Gebruiker' },
  { value: 'admin', label: 'Beheerder' },
];
const schema = z
  .object({
    name: z.string().min(1, 'Vul een naam in.'),
    role: z.string().min(1, 'Kies een rol.'),
    notifications: z.boolean().refine((value) => value, 'Schakel meldingen in voor dit voorbeeld.'),
    preference: z.string().min(1, 'Kies een voorkeur.'),
  })
  .strict();

export function FormStateExamples() {
  return (
    <>
      <Section id="example-form-states" title="Formulier: toestanden">
        <p>
          Verstuur het lege formulier voor veldvalidatie. Vul alle velden in om de gekozen uitkomst te bekijken. In de
          pending-toestand blijft het formulier bezig tot je Afronden kiest. Alle uitkomsten zijn lokaal.
        </p>
        <FormSubmissionExample />
      </Section>
      <Section title="Input en Select: disabled en invalid">
        <InputStatesExample />
      </Section>
    </>
  );
}

function FormSubmissionExample() {
  const form = useZodForm(schema, { name: '', role: '', notifications: false, preference: '' });
  const [mode, setMode] = useState('success');
  const [disabled, setDisabled] = useState(false);
  const [done, setDone] = useState(false);
  const release = useRef<(() => void) | null>(null);
  useEffect(() => () => release.current?.(), []);
  const submit = () => {
    setDone(false);
    if (mode === 'server') return Promise.reject(new Error('Voorbeeldfout'));
    if (mode === 'field') return Promise.reject(new ApiError('ALREADY_EXISTS', 409));
    if (mode === 'pending')
      return new Promise<void>((resolve) => {
        release.current = resolve;
      });
    setDone(true);
    return Promise.resolve();
  };
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Field id="form-example-mode" label="Uitkomst versturen">
        <Select
          id="form-example-mode"
          value={mode}
          disabled={form.formState.isSubmitting}
          options={[
            { value: 'success', label: 'Succes' },
            { value: 'server', label: 'Serverfout' },
            { value: 'field', label: 'Serverfout bij Naam' },
            { value: 'pending', label: 'Blijft bezig tot Afronden' },
          ]}
          onChange={(event) => {
            setMode(event.currentTarget.value);
            form.clearErrors();
            setDone(false);
          }}
        />
      </Field>
      <Button
        variant="outline"
        disabled={form.formState.isSubmitting}
        onClick={() => {
          setDisabled(!disabled);
        }}
      >
        {disabled ? 'Velden inschakelen' : 'Velden uitschakelen'}
      </Button>
      <Form
        key={mode}
        form={form}
        onSubmit={submit}
        submitLabel="Voorbeeld versturen"
        fieldForCode={{ ALREADY_EXISTS: 'name' }}
      >
        <FormField form={form} name="name" label="Naam" description="Vereist voor dit voorbeeld.">
          {(field) => <Input {...field} disabled={disabled} />}
        </FormField>
        <FormField form={form} name="role" label="Rol">
          {(field) => (
            <Select {...field} disabled={disabled} options={[{ value: '', label: 'Kies een rol' }, ...roles]} />
          )}
        </FormField>
        <FormCheckboxField
          form={form}
          name="notifications"
          label="Meldingen"
          disabled={disabled}
          description="Schakel in om te versturen."
        />
        <FormRadioGroupField
          form={form}
          name="preference"
          label="Voorkeur"
          options={roles}
          disabled={disabled}
          description="Maak een keuze."
        />
      </Form>
      <Button
        variant="outline"
        disabled={!form.formState.isSubmitting}
        onClick={() => {
          release.current?.();
          release.current = null;
          setDone(true);
        }}
      >
        Afronden
      </Button>
      {done ? <p role="status">Voorbeeld verstuurd.</p> : null}
    </div>
  );
}

function InputStatesExample() {
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Field id="example-input-disabled" label="Naam: disabled">
        <Input id="example-input-disabled" defaultValue="Ada" disabled />
      </Field>
      <Field id="example-select-disabled" label="Rol: disabled">
        <Select id="example-select-disabled" options={roles} disabled />
      </Field>
      <Field id="example-input-invalid" label="Naam: invalid" error="Vul een naam in.">
        <Input id="example-input-invalid" aria-invalid aria-describedby="example-input-invalid-fout" />
      </Field>
      <Field id="example-select-invalid" label="Rol: invalid" error="Kies een rol.">
        <Select
          id="example-select-invalid"
          aria-invalid
          aria-describedby="example-select-invalid-fout"
          options={[{ value: '', label: 'Kies een rol' }, ...roles]}
        />
      </Field>
    </div>
  );
}
