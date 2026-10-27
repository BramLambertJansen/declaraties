import { useState } from 'react';
import { z } from 'zod';
import {
  Breadcrumbs,
  Button,
  CopyButton,
  DateInput,
  Field,
  Form,
  FormField,
  PasswordInput,
  Section,
  useZodForm,
} from '#web/ui/index.ts';

const schema = z
  .object({ password: z.string().min(1, 'Vul een wachtwoord in.'), date: z.iso.date('Vul een geldige datum in.') })
  .strict();

function InputUtilitiesForm() {
  const form = useZodForm(schema, { password: '', date: '' });
  const [sent, setSent] = useState(false);
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Form
        form={form}
        submitLabel="Voorbeeld versturen"
        onSubmit={() => {
          setSent(true);
          return Promise.resolve();
        }}
        secondaryAction={
          <Button
            variant="outline"
            onClick={() => {
              form.reset();
              setSent(false);
            }}
          >
            Wissen
          </Button>
        }
      >
        <FormField form={form} name="password" label="Voorbeeldwachtwoord">
          {(field) => <PasswordInput {...field} autoComplete="new-password" />}
        </FormField>
        <FormField form={form} name="date" label="Voorbeelddatum" description="Kies een kalenderdatum.">
          {(field) => <DateInput {...field} />}
        </FormField>
      </Form>
      {sent ? <p role="status">Voorbeeld verstuurd.</p> : null}
      <Field id="disabled-password" label="Uitgeschakeld wachtwoord">
        <PasswordInput id="disabled-password" defaultValue="voorbeeld" disabled />
      </Field>
      <Field id="disabled-date" label="Uitgeschakelde datum">
        <DateInput id="disabled-date" defaultValue="2026-10-20" disabled />
      </Field>
      <Field id="bounded-date" label="Datum binnen oktober" description="Van 1 tot en met 31 oktober 2026.">
        <DateInput
          id="bounded-date"
          min="2026-10-01"
          max="2026-10-31"
          defaultValue="2026-10-20"
          aria-describedby="bounded-date-hulp"
        />
      </Field>
    </div>
  );
}

export function InputUtilitiesExamples() {
  return (
    <>
      <Section id="example-input-utilities" title="PasswordInput en DateInput">
        <InputUtilitiesForm />
      </Section>
      <Section id="example-breadcrumbs" title="Breadcrumbs">
        <Breadcrumbs
          label="Voorbeeldkruimelpad"
          items={[
            { id: 'home', label: 'Start', href: '/' },
            { id: 'accounts', label: 'Accounts', href: '/admin/accounts' },
          ]}
          currentPage="Accountgegevens met een lange beschrijving"
        />
        <Breadcrumbs label="Kruimelpad zonder bovenliggende pagina" items={[]} currentPage="Design system" />
      </Section>
      <Section id="example-copy-button" title="CopyButton">
        <p>anna@example.test</p>
        <CopyButton value="anna@example.test" label="E-mailadres kopiëren" />
        <CopyButton value="anna@example.test" label="Kopiëren uitgeschakeld" disabled />
      </Section>
    </>
  );
}
