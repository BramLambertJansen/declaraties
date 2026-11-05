import { useState } from 'react';
import { renameInput } from '#shared/contracts/me.ts';
import { copy } from '#web/copy/ui.ts';
import { Card, CardContent, Form, FormField, Input, Notice, Section, useZodForm } from '#web/ui/index.ts';
import { useRename } from './queries.ts';

// Spec eigen-account, AC-2: de eigen naam; daarna tonen het profielmenu en /api/me de nieuwe naam.
export function NameSection({ naam }: { readonly naam: string }) {
  const rename = useRename();
  const [saved, setSaved] = useState(false);
  const form = useZodForm(renameInput, { naam });
  const submit = async (values: { naam: string }) => {
    setSaved(false);
    await rename.mutateAsync(values.naam);
    setSaved(true);
  };
  return (
    <Section title={copy.account.name.title}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {saved ? <Notice>{copy.account.name.saved}</Notice> : null}
          <Form form={form} onSubmit={submit} submitLabel={copy.account.name.submit}>
            <FormField form={form} name="naam" label={copy.account.name.label}>
              {(field) => <Input {...field} autoComplete="name" />}
            </FormField>
          </Form>
        </CardContent>
      </Card>
    </Section>
  );
}
