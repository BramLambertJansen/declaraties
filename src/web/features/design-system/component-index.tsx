import {
  Button,
  Input,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Field,
} from '#web/ui/index.ts';
import { exampleTarget, showExample } from './example-targets.ts';
import { components } from '#web/ui/component-metadata.ts';

export function ComponentIndex({
  search,
  onSearchChange,
}: {
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
}) {
  const query = search.trim().toLocaleLowerCase('nl');
  const items = components.filter((item) =>
    `${item.naam} ${item.bron} ${item.importnamen.join(' ')} ${Object.entries(item.varianten)
      .flatMap(([name, values]) => [name, ...values])
      .join(' ')}`
      .toLocaleLowerCase('nl')
      .includes(query),
  );
  return (
    <Section title="Componentenindex">
      <p>
        Zoek eerst een bestaand element. Publieke componenten importeer je uit src/web/ui/index.ts; interne onderdelen
        gebruik je via hun oudercomponent.
      </p>
      <Field id="component-search" label="Component zoeken">
        <Input
          id="component-search"
          value={search}
          onChange={(event) => {
            onSearchChange(event.target.value);
          }}
        />
      </Field>
      <p role="status">
        {items.length} van {components.length} componenten
      </p>
      <Table label="Beschikbare UI-componenten">
        <TableHeader>
          <TableRow>
            <TableHead>Component</TableHead>
            <TableHead>Bron</TableHead>
            <TableHead>Hergebruik</TableHead>
            <TableHead>Varianten</TableHead>
            <TableHead>Voorbeeld</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={`${item.bron}:${item.naam}`}>
              <TableCell>{item.naam}</TableCell>
              <TableCell>
                <code>{item.bron}</code>
              </TableCell>
              <TableCell>{item.publiek ? `Publiek: ${item.importnamen.join(', ')}` : 'Intern'}</TableCell>
              <TableCell>
                {Object.entries(item.varianten)
                  .map(([name, values]) => `${name}: ${values.join(', ')}`)
                  .join('; ') || '—'}
              </TableCell>
              <TableCell>
                <ExampleLocation name={item.naam} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}

function ExampleLocation({ name }: { readonly name: string }) {
  const target = exampleTarget(name);
  if (target === undefined) return <p>Voorbeeldlocatie ontbreekt.</p>;
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        aria-controls={target.id}
        onClick={() => {
          showExample(target.id);
        }}
      >
        Toon {name}
      </Button>
      <p>{target.text}</p>
    </div>
  );
}
