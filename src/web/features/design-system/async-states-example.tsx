import { useState } from 'react';
import { AsyncView, Field, Select } from '#web/ui/index.ts';
import { useStateExampleQuery } from './queries.ts';

export function AsyncStatesExample() {
  const [choice, setChoice] = useState({ mode: 'data', run: 0 });
  const query = useStateExampleQuery(choice.mode, choice.run);
  return (
    <div className="flex flex-col gap-4">
      <p>Kies een toestand. Laden blijft zichtbaar; Opnieuw proberen herstelt de voorbeeldfout zonder API-aanroep.</p>
      <Field id="async-example-mode" label="AsyncView-toestand">
        <Select
          id="async-example-mode"
          value={choice.mode}
          options={[
            { value: 'data', label: 'Resultaat' },
            { value: 'loading', label: 'Laden' },
            { value: 'error', label: 'Fout met opnieuw proberen' },
            { value: 'empty', label: 'Leeg: standaardtekst' },
          ]}
          onChange={(event) => {
            setChoice({ mode: event.currentTarget.value, run: choice.run + 1 });
          }}
        />
      </Field>
      <AsyncView query={query} isEmpty={(items) => items.length === 0}>
        {(items) => <p>{items.join(' ')}</p>}
      </AsyncView>
    </div>
  );
}
