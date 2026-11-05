import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { Section } from './section.tsx';

afterEach(cleanup);

// typografie-en-layout/AC-7: Section rendert zijn titel via Heading level 2; het zichtbare gedrag blijft gelijk.
// De bron-eis (Section gebruikt Heading) staat in test/ui/typografie-en-layout.test.ts.
test('typografie-en-layout/AC-7: h2 met text-xl font-semibold, region op naam en aria-labelledby naar de h2', () => {
  render(
    <Section title="Dialog">
      <p>Inhoud</p>
    </Section>,
  );
  const heading = screen.getByRole('heading', { level: 2, name: 'Dialog' });
  expect(heading.tagName).toBe('H2');
  expect([...heading.classList]).toEqual(expect.arrayContaining(['text-xl', 'font-semibold']));
  const region = screen.getByRole('region', { name: 'Dialog' });
  expect(heading.id).not.toBe('');
  expect(region.getAttribute('aria-labelledby')).toBe(heading.id);
});

// typografie-en-layout/AC-7
test('typografie-en-layout/AC-7: met landmark={false} ontbreekt aria-labelledby en blijft de h2', () => {
  const view = render(
    <Section title="Dialog" landmark={false}>
      <p>Inhoud</p>
    </Section>,
  );
  expect(screen.queryByRole('region')).toBeNull();
  expect(view.container.querySelector('section')?.hasAttribute('aria-labelledby')).toBe(false);
  expect(screen.getByRole('heading', { level: 2, name: 'Dialog' }).tagName).toBe('H2');
});
