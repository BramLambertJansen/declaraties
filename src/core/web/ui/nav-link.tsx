import { useRouter, useRouterState } from '@tanstack/react-router';
import type { ComponentProps, MouseEvent } from 'react';
import { cn } from './cn.ts';

// Link binnen de app via de router (geen volledige herlaad). Met href: core kent de getypte routes van de app niet.
// aria-current="page" op de actieve link (ook voor een subpagina daarvan).
export function NavLink({ href, className, onClick, ...props }: ComponentProps<'a'> & { readonly href: string }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));

  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
    const target = event.currentTarget.target;
    const native = (target !== '' && target.toLowerCase() !== '_self') || event.currentTarget.hasAttribute('download');
    if (event.defaultPrevented || modified || native) return;
    event.preventDefault();
    void router.navigate({ href });
  };

  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={follow}
      className={cn(
        'flex min-h-control items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-ring aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}
