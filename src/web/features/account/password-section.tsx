import { useState } from 'react';
import { changePasswordInput } from '#shared/schemas/auth.ts';
import { copy } from '#web/copy/ui.ts';
import { Card, CardContent, Form, FormField, Input, Notice, Section, useZodForm } from '#web/ui/index.ts';
import { useChangePassword } from './queries.ts';

const empty = { huidig: '', nieuw: '', herhaal: '' };

// Spec eigen-account, AC-3 t/m AC-5: het huidige wachtwoord is nodig; de andere sessies worden altijd beëindigd.
export function PasswordSection() {
  const change = useChangePassword();
  const [changed, setChanged] = useState(false);
  const form = useZodForm(changePasswordInput, empty);
  const submit = async (values: { huidig: string; nieuw: string }) => {
    setChanged(false);
    await change.mutateAsync(values);
    form.reset(empty);
    setChanged(true);
  };
  const texts = copy.account.password;
  return (
    <Section title={texts.title}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {changed ? <Notice>{texts.changed}</Notice> : null}
          <Form form={form} onSubmit={submit} submitLabel={texts.submit}>
            <FormField form={form} name="huidig" label={texts.current}>
              {(field) => <Input {...field} type="password" autoComplete="current-password" />}
            </FormField>
            <FormField form={form} name="nieuw" label={texts.new} description={texts.help}>
              {(field) => <Input {...field} type="password" autoComplete="new-password" />}
            </FormField>
            <FormField form={form} name="herhaal" label={texts.repeat}>
              {(field) => <Input {...field} type="password" autoComplete="new-password" />}
            </FormField>
          </Form>
        </CardContent>
      </Card>
    </Section>
  );
}
