import { useState } from 'react';
import { changeEmailInput } from '#shared/schemas/auth.ts';
import { copy } from '#web/copy/ui.ts';
import { Card, CardContent, Form, FormField, Input, Notice, Section, useZodForm } from '#web/ui/index.ts';
import { useChangeEmail } from './queries.ts';

const empty = { email: '' };

// Spec eigen-account, AC-8 t/m AC-10: stap 1 vraagt de wijziging aan (mail naar het huidige adres); het adres verandert pas
// nadat beide links bevestigd zijn. Voor een vrij en een bezet adres is het antwoord hetzelfde (geen enumeratie).
export function EmailSection({ email }: { readonly email: string }) {
  const change = useChangeEmail();
  const [requested, setRequested] = useState(false);
  const form = useZodForm(changeEmailInput, empty);
  const texts = copy.account.email;
  const submit = async (values: { email: string }) => {
    setRequested(false);
    if (values.email.trim().toLowerCase() === email.toLowerCase()) {
      form.setError('email', { type: 'validate', message: texts.same }, { shouldFocus: true });
      return;
    }
    await change.mutateAsync(values.email);
    form.reset(empty);
    setRequested(true);
  };
  return (
    <Section title={texts.title}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p>{texts.current(email)}</p>
          {requested ? <Notice>{texts.requested(email)}</Notice> : null}
          <Form form={form} onSubmit={submit} submitLabel={texts.submit}>
            <FormField form={form} name="email" label={texts.label}>
              {(field) => <Input {...field} type="email" autoComplete="email" />}
            </FormField>
          </Form>
        </CardContent>
      </Card>
    </Section>
  );
}
