import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRootRoute, createRouter, createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { AdditionalExamples } from './additional-examples.tsx';
import { afterEach, expect, test } from 'vitest';
import { AsyncStatesExample } from './async-states-example.tsx';
import { FormStateExamples } from './form-state-examples.tsx';

afterEach(cleanup);

test('AsyncView laat laden staan en herstelt een lokale fout met retry; leeg gebruikt de standaardtekst', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AsyncStatesExample />
    </QueryClientProvider>,
  );
  await screen.findByText('Voorbeeld geladen.');
  const choice = screen.getByLabelText('AsyncView-toestand');
  fireEvent.change(choice, { target: { value: 'loading' } });
  expect(screen.getByRole('status').textContent).toBe('Laden…');
  fireEvent.change(choice, { target: { value: 'error' } });
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));
  await screen.findByText('Voorbeeld geladen.');
  fireEvent.change(choice, { target: { value: 'empty' } });
  await screen.findByText('Er is nog niets om te tonen.');
  fireEvent.change(choice, { target: { value: 'error' } });
  await screen.findByRole('alert');
});

test('Form toont adapterfouten, schakelt alle velden uit en demonstreert server-, veldfout en pending-submit', async () => {
  render(<FormStateExamples />);
  const section = within(screen.getByRole('region', { name: 'Formulier: toestanden' }));
  const submit = section.getByRole('button', { name: 'Voorbeeld versturen' });
  fireEvent.click(submit);
  await section.findByText('Schakel meldingen in voor dit voorbeeld.');
  await section.findByText('Kies een voorkeur.');
  expect(section.getByLabelText('Meldingen').getAttribute('aria-invalid')).toBe('true');
  expect(section.getByRole('radio', { name: 'Gebruiker' }).getAttribute('aria-describedby')).toBeTruthy();
  fireEvent.click(section.getByRole('button', { name: 'Velden uitschakelen' }));
  expect(section.getByLabelText('Naam').hasAttribute('disabled')).toBe(true);
  expect(section.getByLabelText('Meldingen').hasAttribute('disabled')).toBe(true);
  fireEvent.click(section.getByRole('button', { name: 'Velden inschakelen' }));
  fireEvent.change(section.getByLabelText('Naam'), { target: { value: 'Ada' } });
  fireEvent.change(section.getByLabelText('Rol'), { target: { value: 'user' } });
  fireEvent.click(section.getByLabelText('Meldingen'));
  fireEvent.click(section.getByRole('radio', { name: 'Gebruiker' }));
  fireEvent.change(section.getByLabelText('Uitkomst versturen'), { target: { value: 'server' } });
  fireEvent.click(section.getByRole('button', { name: 'Voorbeeld versturen' }));
  await section.findByRole('alert');
  fireEvent.change(section.getByLabelText('Uitkomst versturen'), { target: { value: 'field' } });
  fireEvent.click(section.getByRole('button', { name: 'Voorbeeld versturen' }));
  await section.findByText('Dit bestaat al.');
  expect(document.activeElement).toBe(section.getByLabelText('Naam'));
  fireEvent.change(section.getByLabelText('Uitkomst versturen'), { target: { value: 'pending' } });
  fireEvent.click(section.getByRole('button', { name: 'Voorbeeld versturen' }));
  expect((await section.findByRole('button', { name: 'Bezig…' })).hasAttribute('disabled')).toBe(true);
  fireEvent.click(section.getByRole('button', { name: 'Afronden' }));
  await section.findByText('Voorbeeld verstuurd.');
});

test('Forbidden-preview toont de verbodstekst zonder retry, extra main of wijziging van de documenttitel', async () => {
  const previousTitle = document.title;
  document.title = 'Catalogus';
  const route = createRootRoute({ component: AdditionalExamples });
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/'] }) });
  try {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    const message = await screen.findByText('Je hebt geen toegang tot deze pagina.');
    expect(message.closest('main')).toBeNull();
    const preview = message.parentElement;
    expect(preview?.tagName).toBe('DIV');
    if (preview === null) throw new Error('Forbidden-preview ontbreekt');
    expect(within(preview).queryByRole('button', { name: 'Opnieuw proberen' })).toBeNull();
    expect(document.title).toBe('Catalogus');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  } finally {
    document.title = previousTitle;
  }
});
