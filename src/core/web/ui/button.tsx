import { Slot } from '@radix-ui/react-slot';
import type { VariantProps } from 'class-variance-authority';
import { cloneElement, isValidElement, type AriaAttributes, type ComponentProps, type DOMAttributes } from 'react';
import { buttonVariants } from './button-recipe.ts';
import { cn } from './cn.ts';

export { buttonBase, buttonVariantMap, buttonVariants } from './button-recipe.ts';

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    // Rendert het kind (bijv. een link) met de stijl van een knop.
    readonly asChild?: boolean;
    readonly busy?: boolean;
    readonly busyLabel?: string;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  busy = false,
  busyLabel,
  children,
  onClickCapture,
  onKeyDownCapture,
  onAuxClickCapture,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  const blocked = busy || props.disabled === true;
  const content =
    blocked && asChild && isValidElement<DOMAttributes<HTMLElement> & AriaAttributes>(children)
      ? cloneElement(
          children,
          {
            onClickCapture: undefined,
            onKeyDownCapture: undefined,
            onAuxClickCapture: undefined,
            'aria-disabled': true,
            'aria-busy': busy ? true : (children.props['aria-busy'] ?? props['aria-busy']),
            'aria-label':
              busy && busyLabel !== undefined ? busyLabel : (children.props['aria-label'] ?? props['aria-label']),
          },
          busy ? (busyLabel ?? children.props.children) : children.props.children,
        )
      : busy && busyLabel !== undefined
        ? busyLabel
        : children;
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), 'aria-busy:cursor-wait', className)}
      {...(asChild ? {} : { type })}
      {...props}
      aria-busy={busy ? true : props['aria-busy']}
      aria-disabled={blocked ? true : props['aria-disabled']}
      aria-label={busy && busyLabel !== undefined ? busyLabel : props['aria-label']}
      onClickCapture={(event) => {
        if (blocked) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClickCapture?.(event);
      }}
      onKeyDownCapture={(event) => {
        if (blocked && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onKeyDownCapture?.(event);
      }}
      onAuxClickCapture={(event) => {
        if (blocked) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onAuxClickCapture?.(event);
      }}
    >
      {content}
    </Component>
  );
}
