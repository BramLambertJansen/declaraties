import { cn } from '#core/web/ui/cn.ts';

// Kleurtokens voor de catalogus (spec semantische-tokens, 3c): elke --color-*-naam uit @theme in index.css, behalve
// transparent en current. Een nieuw kleurtoken komt hier en als voorbeeld op /design-system (test/ui/tokens-catalogus.test.ts).
export type TokenColor =
  | 'background'
  | 'foreground'
  | 'card'
  | 'card-foreground'
  | 'popover'
  | 'popover-foreground'
  | 'primary'
  | 'primary-foreground'
  | 'secondary'
  | 'secondary-foreground'
  | 'muted'
  | 'muted-foreground'
  | 'accent'
  | 'accent-foreground'
  | 'destructive'
  | 'destructive-foreground'
  | 'success'
  | 'success-foreground'
  | 'warning'
  | 'warning-foreground'
  | 'border'
  | 'input'
  | 'ring'
  | 'sidebar'
  | 'sidebar-foreground'
  | 'sidebar-accent'
  | 'sidebar-accent-foreground';

// Letterlijke klassen, zodat Tailwind ze in de bron vindt.
const SURFACE: Record<TokenColor, string> = {
  background: 'bg-background',
  foreground: 'bg-foreground',
  card: 'bg-card',
  'card-foreground': 'bg-card-foreground',
  popover: 'bg-popover',
  'popover-foreground': 'bg-popover-foreground',
  primary: 'bg-primary',
  'primary-foreground': 'bg-primary-foreground',
  secondary: 'bg-secondary',
  'secondary-foreground': 'bg-secondary-foreground',
  muted: 'bg-muted',
  'muted-foreground': 'bg-muted-foreground',
  accent: 'bg-accent',
  'accent-foreground': 'bg-accent-foreground',
  destructive: 'bg-destructive',
  'destructive-foreground': 'bg-destructive-foreground',
  success: 'bg-success',
  'success-foreground': 'bg-success-foreground',
  warning: 'bg-warning',
  'warning-foreground': 'bg-warning-foreground',
  border: 'bg-border',
  input: 'bg-input',
  ring: 'bg-ring',
  sidebar: 'bg-sidebar',
  'sidebar-foreground': 'bg-sidebar-foreground',
  'sidebar-accent': 'bg-sidebar-accent',
  'sidebar-accent-foreground': 'bg-sidebar-accent-foreground',
};

export interface TokenSwatchProps {
  readonly color: TokenColor;
}

// Een kleurvlak (decoratief, aria-hidden) met de tokennaam als zichtbare tekst; alleen voor de catalogus.
export function TokenSwatch({ color }: TokenSwatchProps) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className={cn('size-10 shrink-0 rounded-md border border-border', SURFACE[color])} />
      <span className="min-w-0 font-mono text-sm break-words text-foreground">{color}</span>
    </div>
  );
}
