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

export function CenteredCardSection() {
  return (
    <Section
      id="example-centered"
      title="CenteredCard"
      description="Een scherm zonder app-layout, zoals inloggen."
      framed
    >
      <CenteredCard preview title="Inloggen" description="Een voorbeeld van een scherm zonder app-layout.">
        <p>De inhoud van de kaart.</p>
      </CenteredCard>
    </Section>
  );
}

export function AsyncAndErrorSections() {
  return (
    <>
      <Section
        id="example-async"
        title="AsyncView"
        description="Laden, fout, leeg en resultaat op één manier tonen."
        framed
      >
        <AsyncStatesExample />
      </Section>
      <Section
        id="example-errors"
        title="RouteError en NotFound"
        description="Foutschermen: iets ging mis, geen toegang, niet gevonden."
        framed
      >
        <ErrorExamples />
      </Section>
    </>
  );
}
