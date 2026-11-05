import { useState } from 'react';
import {
  Accordion,
  Button,
  Field,
  Input,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#web/ui/index.ts';
import { exampleTarget, type ExampleTarget } from './example-targets.ts';
import { vakLabel } from './vakken.ts';
import { components, type ComponentMetadata } from '#web/ui/component-metadata.ts';

const LIST_ID = 'alle-componenten';

// Zoekt op wat de lijst toont, naam en varianten; bronpad en importnaam staan niet op de pagina (designsystem-toolbox/AC-9).
function matches(item: ComponentMetadata, query: string): boolean {
  return `${item.naam} ${Object.entries(item.varianten)
    .flatMap(([name, values]) => [name, ...values])
    .join(' ')}`
    .toLocaleLowerCase('nl')
    .includes(query);
}

// Zoeken in de bronindex (ADR 0048). De lijst staat standaard dicht en gaat open zodra er een zoekopdracht is
// (spec designsystem-toolbox/AC-4); Toon opent het tabblad van het voorbeeld en zet daar de focus (AC-3).
export function ComponentIndex({
  search,
  onSearchChange,
  onShow,
}: {
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly onShow: (target: ExampleTarget) => void;
}) {
  const [open, setOpen] = useState(search.trim() !== '');
  const query = search.trim().toLocaleLowerCase('nl');
  const items = components.filter((item) => matches(item, query));
  return (
    <Section title="Componentenindex">
      <p>Zoek een onderdeel op naam of variant. Toon opent het juiste tabblad en springt naar het voorbeeld.</p>
      <Field id="component-search" label="Component zoeken">
        <Input
          id="component-search"
          value={search}
          onChange={(event) => {
            if (event.target.value.trim() !== '') setOpen(true);
            onSearchChange(event.target.value);
          }}
        />
      </Field>
      <p role="status">
        {items.length} van {components.length} componenten
      </p>
      <Accordion
        mode="multiple"
        headingLevel={3}
        value={open ? [LIST_ID] : []}
        onValueChange={(value) => {
          setOpen(value.includes(LIST_ID));
        }}
        items={[
          { id: LIST_ID, title: 'Lijst met alle componenten', content: <IndexTable items={items} onShow={onShow} /> },
        ]}
      />
    </Section>
  );
}

function IndexTable({
  items,
  onShow,
}: {
  readonly items: readonly ComponentMetadata[];
  readonly onShow: (target: ExampleTarget) => void;
}) {
  return (
    <Table label="Beschikbare UI-componenten">
      <TableHeader>
        <TableRow>
          <TableHead>Component</TableHead>
          <TableHead>Tabblad</TableHead>
          <TableHead>Varianten</TableHead>
          <TableHead>Voorbeeld</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const target = exampleTarget(item.naam);
          return (
            <TableRow key={`${item.bron}:${item.naam}`}>
              <TableCell>{item.naam}</TableCell>
              <TableCell>{target === undefined ? '—' : vakLabel(target.vak)}</TableCell>
              <TableCell>
                {Object.entries(item.varianten)
                  .map(([name, values]) => `${name}: ${values.join(', ')}`)
                  .join('; ') || '—'}
              </TableCell>
              <TableCell>
                <ExampleLocation name={item.naam} target={target} onShow={onShow} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ExampleLocation({
  name,
  target,
  onShow,
}: {
  readonly name: string;
  readonly target: ExampleTarget | undefined;
  readonly onShow: (target: ExampleTarget) => void;
}) {
  if (target === undefined) return <p>Voorbeeldlocatie ontbreekt.</p>;
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        aria-controls={target.id}
        onClick={() => {
          onShow(target);
        }}
      >
        Toon {name}
      </Button>
      <p>{target.text}</p>
    </div>
  );
}
