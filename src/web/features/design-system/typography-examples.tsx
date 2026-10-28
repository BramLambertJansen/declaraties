import { Card, CardContent, Heading, Inline, Section, Stack, StatusBadge, Text } from '#web/ui/index.ts';

function Items() {
  return (
    <>
      <Text as="span">Eerste</Text>
      <Text as="span">Tweede</Text>
      <Text as="span">Derde</Text>
    </>
  );
}

function TextExamples() {
  return (
    <Stack gap="sm">
      <Text size="base" tone="default" weight="normal">
        Standaardtekst in de basisgrootte.
      </Text>
      <Text size="sm">Kleine tekst.</Text>
      <Text tone="muted">Gedempte toelichting.</Text>
      <Text weight="medium">Nadruk met medium gewicht.</Text>
      <Text as="span">Tekst in een span.</Text>
      <Text as="div">Tekst in een div.</Text>
      <Card>
        <CardContent>
          <Text tone="muted">Gedempte toelichting op een kaart.</Text>
        </CardContent>
      </Card>
    </Stack>
  );
}

function StackExamples() {
  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text size="sm" tone="muted">
          Afstand xs
        </Text>
        <Items />
      </Stack>
      <Stack gap="sm">
        <Text size="sm" tone="muted">
          Afstand sm
        </Text>
        <Items />
      </Stack>
      <Stack gap="md">
        <Text size="sm" tone="muted">
          Afstand md
        </Text>
        <Items />
      </Stack>
      <Stack gap="lg">
        <Text size="sm" tone="muted">
          Afstand lg
        </Text>
        <Items />
      </Stack>
      <Stack gap="xl">
        <Text size="sm" tone="muted">
          Afstand xl
        </Text>
        <Items />
      </Stack>
      <Stack as="ul" gap="xs">
        <li>Eerste</li>
        <li>Tweede</li>
        <li>Derde</li>
      </Stack>
      <Stack as="ol" gap="xs">
        <li>Eerste</li>
        <li>Tweede</li>
        <li>Derde</li>
      </Stack>
      <Stack as="section" aria-label="Voorbeeldsectie">
        <Items />
      </Stack>
    </Stack>
  );
}

function InlineExamples() {
  return (
    <Stack gap="lg">
      <Inline gap="xs">
        <Text size="sm" tone="muted">
          Afstand xs
        </Text>
        <Items />
      </Inline>
      <Inline gap="sm">
        <Text size="sm" tone="muted">
          Afstand sm
        </Text>
        <Items />
      </Inline>
      <Inline gap="md">
        <Text size="sm" tone="muted">
          Afstand md
        </Text>
        <Items />
      </Inline>
      <Inline gap="lg">
        <Text size="sm" tone="muted">
          Afstand lg
        </Text>
        <Items />
      </Inline>
      <Inline gap="xl">
        <Text size="sm" tone="muted">
          Afstand xl
        </Text>
        <Items />
      </Inline>
      <Inline align="start">
        <Text size="sm" tone="muted">
          Uitlijning start
        </Text>
        <StatusBadge>Concept</StatusBadge>
        <Text as="span">Eerste</Text>
      </Inline>
      <Inline align="center">
        <Text size="sm" tone="muted">
          Uitlijning center
        </Text>
        <StatusBadge>Concept</StatusBadge>
        <Text as="span">Eerste</Text>
      </Inline>
      <Inline align="baseline">
        <Text size="sm" tone="muted">
          Uitlijning baseline
        </Text>
        <StatusBadge>Concept</StatusBadge>
        <Text as="span">Eerste</Text>
      </Inline>
      <Inline justify="start">
        <Text size="sm" tone="muted">
          Verdeling start
        </Text>
        <Items />
      </Inline>
      <Inline justify="between">
        <Text size="sm" tone="muted">
          Verdeling between
        </Text>
        <Items />
      </Inline>
      <Inline justify="end">
        <Text size="sm" tone="muted">
          Verdeling end
        </Text>
        <Items />
      </Inline>
    </Stack>
  );
}

export function TypographyExamples() {
  return (
    <Section id="example-typografie" title="Text, Heading, Stack en Inline">
      <TextExamples />
      <Stack gap="sm">
        <Heading level={2}>Kop van niveau 2</Heading>
        <Heading level={3}>Kop van niveau 3</Heading>
        <Heading level={4}>Kop van niveau 4</Heading>
      </Stack>
      <StackExamples />
      <InlineExamples />
    </Section>
  );
}
