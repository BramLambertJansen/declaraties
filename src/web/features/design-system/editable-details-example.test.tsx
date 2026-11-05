import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { EditableDetailsExample } from './editable-details-example.tsx';

afterEach(cleanup);

test.each([true, false])('later gemount formulier toont foutoverzicht; blurvalidatie afgerond: %s', async (settled) => {
  const route = createRootRoute({ component: EditableDetailsExample });
  const router = createRouter({ routeTree: route, history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    await router.load();
  });
  render(<RouterProvider router={router} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Contactgegevens bewerken' }));
  const detail = within(screen.getByRole('region', { name: 'Contactgegevens' }));
  const name = detail.getByRole('textbox', { name: 'Naam' });
  const email = detail.getByRole('textbox', { name: 'E-mailadres' });
  fireEvent.change(name, { target: { value: '' } });
  fireEvent.blur(name);
  if (settled) await detail.findByText('Vul een naam in.');
  fireEvent.change(email, { target: { value: 'ongeldig' } });
  fireEvent.blur(email);
  if (settled) await detail.findByText('Vul een geldig e-mailadres in.');
  const submit = detail.getByRole('button', { name: 'Contactgegevens opslaan' });
  let submitted = 0;
  submit.closest('form')?.addEventListener('submit', () => {
    submitted += 1;
  });
  expect(fireEvent.pointerDown(submit, { button: 0, cancelable: true })).toBe(false);
  expect(submitted).toBe(0);
  fireEvent.click(submit);
  expect(submitted).toBe(1);
  const summary = await detail.findByRole('heading', { name: 'Controleer de invoer' });
  await waitFor(() => {
    expect(document.activeElement).toBe(summary.parentElement);
  });
});
