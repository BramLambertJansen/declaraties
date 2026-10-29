import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { uiTexts } from '../copy/ui.ts';
import { useDocumentTitle } from '../lib/document-title.ts';
import { ForbiddenError } from '../lib/guard.ts';
import { Button } from './button.tsx';
import { PageTitle } from './page-title.tsx';
import { useErrorText } from './error-texts.tsx';

// ErrorBoundary van elke route (framework §5, via defaultErrorComponent van de router). Toont alleen een tekst bij de
// foutcode, nooit de fout zelf. Geen rechten: de vaste tekst uit de spec, zonder "opnieuw proberen".
export function RouteError({ error, reset, preview = false }: ErrorComponentProps & { readonly preview?: boolean }) {
  const errorText = useErrorText();
  const router = useRouter();
  const forbidden = error instanceof ForbiddenError;
  // Zonder h1 (vaste spectekst), maar wel een eigen paginatitel: anders blijft die van het vorige scherm staan.
  useDocumentTitle(forbidden && !preview ? uiTexts.forbiddenTitle : null);
  const Container = preview ? 'div' : 'main';
  if (forbidden) {
    return (
      <Container className="p-6">
        <p role="alert" className="text-foreground">
          {errorText({ code: 'FORBIDDEN' })}
        </p>
      </Container>
    );
  }
  return (
    <Container className="flex flex-col items-start gap-3 p-6">
      <PageTitle title={uiTexts.errorTitle} preview={preview} className="text-2xl font-semibold" />
      <p role="alert" className="text-destructive">
        {errorText(error)}
      </p>
      {/* invalidate laadt de loaders opnieuw en wist de fout; reset() alleen zou de oude fout weer tonen. */}
      <Button
        variant="outline"
        onClick={() => {
          if (preview) reset();
          else void router.invalidate();
        }}
      >
        {uiTexts.retry}
      </Button>
    </Container>
  );
}

export function NotFound({ preview = false }: { readonly preview?: boolean; readonly isNotFound?: boolean }) {
  const Container = preview ? 'div' : 'main';
  return (
    <Container className="p-6">
      <PageTitle title={uiTexts.notFoundTitle} preview={preview} className="text-2xl font-semibold" />
    </Container>
  );
}
