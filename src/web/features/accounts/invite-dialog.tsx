import type { Role } from '#core/shared/can.ts';
import { inviteInput, ROLLEN } from '#shared/contracts/accounts.ts';
import { errorTexts } from '#web/copy/errors.ts';
import { copy } from '#web/copy/ui.ts';
import { Button, Dialog, ErrorTextsProvider, Form, FormField, Input, Select, useZodForm } from '#web/ui/index.ts';
import { useInvite } from './queries.ts';

const roleOptions = ROLLEN.map((role) => ({ value: role, label: copy.accounts.roles[role] }));

// In dit formulier betekent ALREADY_EXISTS: dit e-mailadres heeft al een account (spec accountbeheer).
const inviteErrorTexts = { ...errorTexts, ALREADY_EXISTS: copy.inviteDialog.exists };

interface InviteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onInvited: (email: string) => void;
}

function InviteForm({ onDone, onInvited }: { onDone: () => void; onInvited: (email: string) => void }) {
  const invite = useInvite();
  const form = useZodForm(inviteInput, { naam: '', email: '', rol: 'user' });
  const submit = async (values: { naam: string; email: string; rol: Role }) => {
    await invite.mutateAsync(values);
    onInvited(values.email);
    onDone();
  };
  return (
    <ErrorTextsProvider texts={inviteErrorTexts}>
      <Form
        form={form}
        onSubmit={submit}
        submitLabel={copy.inviteDialog.submit}
        fieldForCode={{ ALREADY_EXISTS: 'email' }}
        secondaryAction={
          <Button variant="outline" onClick={onDone}>
            {copy.inviteDialog.cancel}
          </Button>
        }
      >
        <FormField form={form} name="naam" label={copy.inviteDialog.name}>
          {(field) => <Input {...field} autoComplete="off" />}
        </FormField>
        <FormField form={form} name="email" label={copy.inviteDialog.email}>
          {(field) => <Input {...field} type="email" autoComplete="off" />}
        </FormField>
        <FormField form={form} name="rol" label={copy.inviteDialog.role}>
          {(field) => <Select {...field} options={roleOptions} />}
        </FormField>
      </Form>
    </ErrorTextsProvider>
  );
}

// Uitnodigen (spec accounts/AC-5): dialoog vangt de focus, Esc annuleert; bij openen een leeg formulier.
export function InviteDialog({ open, onOpenChange, onInvited }: InviteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={copy.inviteDialog.title}>
      <InviteForm
        onInvited={onInvited}
        onDone={() => {
          onOpenChange(false);
        }}
      />
    </Dialog>
  );
}
