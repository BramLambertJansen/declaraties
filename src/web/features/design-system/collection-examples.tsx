import { Bell } from 'lucide-react';
import { useState } from 'react';
import { Accordion, Button, DescriptionList, Field, Input, List, ListItem, Section } from '#web/ui/index.ts';

const items = [
  {
    id: 'general',
    title: 'Algemeen',
    content: (
      <Field id="accordion-name" label="Naam">
        <Input id="accordion-name" />
      </Field>
    ),
  },
  { id: 'notifications', title: 'Meldingen', content: 'Voorbeeldinhoud.' },
  { id: 'disabled', title: 'Uitgeschakeld', content: 'Voorbeeldinhoud.', disabled: true },
];
const metadata = [
  { id: 'name', term: 'Naam', value: 'Anna de Vries' },
  { id: 'role', term: 'Rol', value: 'Beheerder' },
];

export function CollectionExamples() {
  const [open, setOpen] = useState<readonly string[]>(['notifications']);
  const [done, setDone] = useState(false);
  return (
    <>
      <Section id="example-accordion" title="Accordion">
        <p>Single: één sectie tegelijk; de eerste staat open. Gesloten inhoud blijft bewaard.</p>
        <Accordion mode="single" defaultValue={['general']} items={items} />
        <p>Multiple: de ouder beheert de open secties. Annuleren sluit ze allemaal.</p>
        <Accordion
          mode="multiple"
          value={open}
          onValueChange={setOpen}
          items={[
            { id: 'general', title: 'Algemeen', content: 'Voorbeeldinhoud.' },
            { id: 'notifications', title: 'Meldingen', content: 'Voorbeeldinhoud.' },
            { id: 'disabled', title: 'Uitgeschakeld', content: 'Voorbeeldinhoud.', disabled: true },
          ]}
        />
        <Button
          variant="outline"
          onClick={() => {
            setOpen([]);
          }}
        >
          Annuleren
        </Button>
      </Section>
      <Section id="example-list" title="List">
        <List aria-label="Gebruikers">
          <ListItem
            title="Anna de Vries"
            description="Gebruiker"
            leading={<Bell />}
            actions={
              <Button
                variant="outline"
                aria-label="Bekijken Anna de Vries"
                onClick={() => {
                  setDone(true);
                }}
              >
                Bekijken
              </Button>
            }
          />
          <ListItem title="Bert Jansen" description="Gebruiker" />
          <ListItem title={'Anna de Vries '.repeat(12)} description={'Gebruiker'.repeat(20)} />
        </List>
        <p>Een lege lijst laat de keuze voor een lege melding aan het scherm.</p>
        <List aria-label="Lege lijst">{null}</List>
        {done ? <p role="status">Anna de Vries</p> : null}
      </Section>
      <Section id="example-description-list" title="DescriptionList">
        <DescriptionList items={metadata} />
        <DescriptionList items={[{ id: 'long', term: 'Naam'.repeat(20), value: 'Anna de Vries '.repeat(15) }]} />
        <DescriptionList items={[]} />
      </Section>
    </>
  );
}
