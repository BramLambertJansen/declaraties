import { DescriptionList, Heading, Section, Stack, Text, TokenSwatch, TypeSample } from '#web/ui/index.ts';

// Spec semantische-tokens (3c): de tokens zichtbaar op /design-system. Elke kleur en elke typografievariant staat er
// letterlijk (check:catalogus en test/ui/tokens-catalogus.test.ts); de lijst per token met bron staat in
// `node scripts/kit/feiten.mjs tokens`.

function ColorTokens() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <TokenSwatch color="background" />
      <TokenSwatch color="foreground" />
      <TokenSwatch color="card" />
      <TokenSwatch color="card-foreground" />
      <TokenSwatch color="popover" />
      <TokenSwatch color="popover-foreground" />
      <TokenSwatch color="primary" />
      <TokenSwatch color="primary-foreground" />
      <TokenSwatch color="secondary" />
      <TokenSwatch color="secondary-foreground" />
      <TokenSwatch color="muted" />
      <TokenSwatch color="muted-foreground" />
      <TokenSwatch color="accent" />
      <TokenSwatch color="accent-foreground" />
      <TokenSwatch color="destructive" />
      <TokenSwatch color="destructive-foreground" />
      <TokenSwatch color="success" />
      <TokenSwatch color="success-foreground" />
      <TokenSwatch color="warning" />
      <TokenSwatch color="warning-foreground" />
      <TokenSwatch color="border" />
      <TokenSwatch color="input" />
      <TokenSwatch color="ring" />
      <TokenSwatch color="sidebar" />
      <TokenSwatch color="sidebar-foreground" />
      <TokenSwatch color="sidebar-accent" />
      <TokenSwatch color="sidebar-accent-foreground" />
    </div>
  );
}

function TypeTokens() {
  return (
    <Stack gap="sm">
      <TypeSample size="sm" weight="normal" family="sans" />
      <TypeSample size="base" weight="normal" />
      <TypeSample size="lg" weight="normal" />
      <TypeSample size="xl" weight="normal" />
      <TypeSample size="2xl" weight="normal" />
      <TypeSample size="base" weight="medium" />
      <TypeSample size="base" weight="semibold" />
      <TypeSample size="sm" family="mono" />
    </Stack>
  );
}

const DENSITY = [
  { id: 'control', term: 'min-h-control', value: '--density-control · standaard 2.75rem (nooit onder 44 px)' },
];

const LAYERS = [
  { id: 'sticky', term: 'z-sticky', value: '--layer-sticky · standaard 10' },
  { id: 'dropdown', term: 'z-dropdown', value: '--layer-dropdown · standaard 20' },
  { id: 'overlay', term: 'z-overlay', value: '--layer-overlay · standaard 30' },
  { id: 'modal', term: 'z-modal', value: '--layer-modal · standaard 40' },
  { id: 'toast', term: 'z-toast', value: '--layer-toast · standaard 50' },
];

const MOTION = [
  { id: 'fast', term: 'duration-fast', value: '--motion-fast · standaard 150ms' },
  { id: 'normal', term: 'duration-normal', value: '--motion-normal · standaard 200ms' },
  { id: 'standard', term: 'ease-standard', value: '--motion-ease-standard · standaard cubic-bezier(0.4, 0, 0.2, 1)' },
  { id: 'out', term: 'ease-out', value: '--motion-ease-out · standaard cubic-bezier(0, 0, 0.2, 1)' },
];

export function TokensExamples() {
  return (
    <Section id="example-tokens" title="Tokens">
      <Text tone="muted">
        Kleur, typografie, dichtheid, lagen en beweging uit de tokens; een app past ze aan in src/web/styles/theme.css.
      </Text>
      <Heading level={3}>Kleur</Heading>
      <ColorTokens />
      <Heading level={3}>Typografie</Heading>
      <TypeTokens />
      <Heading level={3}>Dichtheid</Heading>
      <DescriptionList items={DENSITY} />
      <Heading level={3}>Lagen</Heading>
      <DescriptionList items={LAYERS} />
      <Heading level={3}>Beweging</Heading>
      <DescriptionList items={MOTION} />
    </Section>
  );
}
