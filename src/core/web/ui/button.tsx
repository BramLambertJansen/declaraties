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
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  const content =
    busy && asChild && isValidElement<DOMAttributes<HTMLElement> & AriaAttributes>(children)
      ? cloneElement(
          children,
          {
            onClickCapture: undefined,
            onKeyDownCapture: undefined,
            'aria-disabled': true,
            'aria-busy': true,
            'aria-label': busyLabel ?? children.props['aria-label'],
          },
          busyLabel ?? children.props.children,
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
      aria-disabled={busy ? true : props['aria-disabled']}
      aria-label={busy && busyLabel !== undefined ? busyLabel : props['aria-label']}
      onClickCapture={(event) => {
        if (busy) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClickCapture?.(event);
      }}
      onKeyDownCapture={(event) => {
        if (busy && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onKeyDownCapture?.(event);
      }}
    >
      {content}
    </Component>
  );
}
