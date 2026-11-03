import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Section } from './section.tsx';

afterEach(cleanup);

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

// Spec designsystem-toolbox: description en framed zijn optioneel; zonder beide blijft de sectie zoals ze was.
test('zonder description en framed staat de kop direct in de sectie en de inhoud zonder vlak', () => {
  render(
    <Section title="Gewoon" id="gewoon">
      <p>Inhoud</p>
    </Section>,
  );
  const region = screen.getByRole('region', { name: 'Gewoon' });
  expect(region.firstElementChild?.tagName).toBe('H2');
  expect(screen.getByText('Inhoud').parentElement).toBe(region);
});

test('description staat onder de titel en framed zet de inhoud in een eigen vlak', () => {
  render(
    <Section title="Voorbeeld" description="Waarvoor je dit gebruikt." framed>
      <p>Inhoud</p>
    </Section>,
  );
  const region = screen.getByRole('region', { name: 'Voorbeeld' });
  const heading = screen.getByRole('heading', { level: 2, name: 'Voorbeeld' });
  const description = screen.getByText('Waarvoor je dit gebruikt.');
  expect(heading.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const frame = screen.getByText('Inhoud').parentElement;
  expect(frame).not.toBe(region);
  expect(frame?.parentElement).toBe(region);
});
