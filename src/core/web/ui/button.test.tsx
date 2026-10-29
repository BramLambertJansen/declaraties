import { cleanup, render, screen } from '@testing-library/react';
import { cva } from 'class-variance-authority';
import { afterEach, describe, expect, test } from 'vitest';
import { Button, buttonBase, buttonVariantMap } from './button.tsx';

afterEach(cleanup);

describe('Button', () => {
  test('standaard: type="button", 44 px en focusring uit de basis', () => {
    render(<Button>Opslaan</Button>);
    const button = screen.getByRole('button', { name: 'Opslaan' });

    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toContain('min-h-control');
    expect(button.className).toContain('focus-visible:ring-2');
    expect(button.className).toContain('bg-primary');
  });

  test('asChild: het kind krijgt de stijl van een knop, zonder type-attribuut', () => {
    render(
      <Button asChild variant="outline">
        <a href="/accounts">Accounts</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Accounts' });

    expect(link.getAttribute('type')).toBeNull();
    expect(link.className).toContain('border-input');
  });

  test('een app leidt een variant af uit basis en variantkaart, zonder core te wijzigen (ADR 0040)', () => {
    // Zoals in src/web/ui: de basis (44 px, focusring) blijft, de variantkaart krijgt er een bij.
    const appButton = cva(buttonBase, {
      variants: { ...buttonVariantMap, variant: { ...buttonVariantMap.variant, link: 'text-primary underline' } },
      defaultVariants: { variant: 'primary', size: 'md' },
    });
    const classes = appButton({ variant: 'link' });

    expect(classes).toContain('min-h-control');
    expect(classes).toContain('focus-visible:ring-2');
    expect(classes).toContain('text-primary underline');
  });
});
