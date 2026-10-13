import { useState } from 'react';
import { AsyncView, CenteredCard, NotFound, RouteError, Section } from '#web/ui/index.ts';
import { useExampleQuery } from './queries.ts';

export function AsyncExample() {
  const query = useExampleQuery();
  return <AsyncView query={query}>{(items) => <p>{items.join(' ')}</p>}</AsyncView>;
}

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
      <NotFound preview />
    </div>
  );
}

export function AdditionalExamples() {
  return (
    <>
      <Section title="CenteredCard">
        <CenteredCard preview title="Inloggen" description="Een voorbeeld van een scherm zonder app-layout.">
          <p>De inhoud van de kaart.</p>
        </CenteredCard>
      </Section>
      <Section title="AsyncView">
        <AsyncExample />
      </Section>
      <Section title="RouteError en NotFound">
        <ErrorExamples />
      </Section>
    </>
  );
}
