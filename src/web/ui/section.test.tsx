import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Section } from './section.tsx';

// Elke sectie van de catalogus heet naar haar titel, ook met spaties en komma's in de titel.
test('een sectie krijgt haar titel als toegankelijke naam', () => {
  render(
    <>
      <Section title="Form, Field en Input">
        <p>Inhoud</p>
      </Section>
      <Section title="Dialog">
        <p>Inhoud</p>
      </Section>
    </>,
  );

  expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-labelledby') !== null)).toStrictEqual([
    true,
    true,
  ]);
  expect(screen.getByRole('region', { name: 'Form, Field en Input' })).toBeDefined();
  expect(screen.getByRole('region', { name: 'Dialog' })).toBeDefined();
});
