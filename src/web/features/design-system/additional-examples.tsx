import { useState } from 'react';
import { ForbiddenError } from '#core/web/lib/guard.ts';
import { AsyncStatesExample } from './async-states-example.tsx';
import { CenteredCard, NotFound, RouteError, Section } from '#web/ui/index.ts';

function ErrorExamples() {
  const [retried, setRetried] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <RouteError
        preview
        error={new Error('Voorbeeld')}
        reset={() => {
          setRetried(true);
        }}
      />
      {retried ? <p role="status">Opnieuw geprobeerd (voorbeeld).</p> : null}
      <RouteError preview error={new ForbiddenError()} reset={() => undefined} />
      <NotFound preview />
    </div>
  );
}

export function AdditionalExamples() {
  return (
    <>
      <Section id="example-centered" title="CenteredCard">
        <CenteredCard preview title="Inloggen" description="Een voorbeeld van een scherm zonder app-layout.">
          <p>De inhoud van de kaart.</p>
        </CenteredCard>
      </Section>
      <Section id="example-async" title="AsyncView">
        <AsyncStatesExample />
      </Section>
      <Section id="example-errors" title="RouteError en NotFound">
        <ErrorExamples />
      </Section>
    </>
  );
}
