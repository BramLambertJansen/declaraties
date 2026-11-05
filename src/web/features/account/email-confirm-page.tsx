import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { errorTexts } from '#web/copy/errors.ts';
import { copy } from '#web/copy/ui.ts';
import { Button, CenteredCard, Notice, useErrorText } from '#web/ui/index.ts';
import { useConfirmEmail } from './queries.ts';

type Outcome =
  { readonly kind: 'done'; readonly step: 'oud' | 'nieuw' } | { readonly kind: 'error'; readonly text: string };

// Spec eigen-account, AC-8 en AC-11: de link uit de mail opent dit scherm; bevestigen is een POST op een klik (framework §6:
// een GET-link bevestigt niets). Stap 1 (oud adres) stuurt de link naar het nieuwe adres, stap 2 wijzigt het adres.
export function EmailConfirmPage({ token }: { readonly token: string | undefined }) {
  const confirm = useConfirmEmail();
  const errorText = useErrorText();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const texts = copy.account.confirmEmail;

  if (token === undefined) {
    return (
      <CenteredCard title={texts.title}>
        <Notice tone="error">{errorTexts.EMAIL_LINK_INVALID}</Notice>
      </CenteredCard>
    );
  }
  const submit = () => {
    confirm.mutateAsync(token).then(
      ({ stap }) => {
        setOutcome({ kind: 'done', step: stap });
      },
      (error: unknown) => {
        setOutcome({ kind: 'error', text: errorText(error) });
      },
    );
  };
  const finished = outcome?.kind === 'done' ? outcome.step : null;
  return (
    <CenteredCard title={texts.title}>
      <div className="flex flex-col gap-4">
        {outcome?.kind === 'error' ? <Notice tone="error">{outcome.text}</Notice> : null}
        {finished === 'oud' ? <Notice>{texts.oldDone}</Notice> : null}
        {finished === 'nieuw' ? (
          <>
            <Notice>{texts.newDone}</Notice>
            <Link to="/account">{texts.toAccount}</Link>
          </>
        ) : null}
        {finished === null ? (
          <Button disabled={confirm.isPending} onClick={submit}>
            {texts.submit}
          </Button>
        ) : null}
      </div>
    </CenteredCard>
  );
}
