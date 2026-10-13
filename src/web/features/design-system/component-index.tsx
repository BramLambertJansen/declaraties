import {
  Input,
  Section,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Field,
  components,
} from '#web/ui/index.ts';

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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}
