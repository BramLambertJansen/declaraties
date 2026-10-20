import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { Button } from './button.tsx';
import { DateInput } from './date-input.tsx';
import { ErrorTextsProvider } from './error-texts.tsx';
import { Form, FormField, useZodForm } from './form.tsx';
import { PasswordInput } from './password-input.tsx';

afterEach(cleanup);
const schema = z
  .object({ password: z.string().min(1, 'Vul een wachtwoord in.'), date: z.iso.date('Vul een datum in.') })
  .strict();

function Example({ submit }: { submit: (values: z.output<typeof schema>) => Promise<unknown> }) {
  const form = useZodForm(schema, { password: '', date: '' });
  return (
    <Form
      form={form}
      submitLabel="Versturen"
      onSubmit={submit}
      secondaryAction={
        <Button
          onClick={() => {
            form.reset();
          }}
        >
          Wissen
        </Button>
      }
    >
      <FormField form={form} name="password" label="Wachtwoord">
        {(field) => <PasswordInput {...field} />}
      </FormField>
      <FormField form={form} name="date" label="Datum">
        {(field) => <DateInput {...field} />}
      </FormField>
    </Form>
  );
}

test('RHF behoudt validatie, foutfocus, stringpayload en reset voor beide velden', async () => {
  const enteredValue = 'voorbeeld';
  const submit = vi.fn(() => Promise.resolve());
  render(
    <ErrorTextsProvider texts={{}}>
      <Example submit={submit} />
    </ErrorTextsProvider>,
  );
  const password = screen.getByLabelText('Wachtwoord');
  const date = screen.getByLabelText('Datum');
  fireEvent.click(screen.getByRole('button', { name: 'Versturen' }));
  await screen.findByText('Vul een wachtwoord in.');
  await waitFor(() => {
    expect(document.activeElement).toBe(password);
  });
  expect(password.getAttribute('aria-invalid')).toBe('true');
  expect(date.getAttribute('aria-invalid')).toBe('true');
  fireEvent.change(password, { target: { value: enteredValue } });
  fireEvent.blur(password);
  fireEvent.change(date, { target: { value: '2026-10-20' } });
  fireEvent.blur(date);
  fireEvent.click(screen.getByRole('button', { name: 'Wachtwoord tonen' }));
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Versturen' }));
  await waitFor(() => {
    expect(submit).toHaveBeenCalledWith({ password: enteredValue, date: '2026-10-20' });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Wissen' }));
  await waitFor(() => {
    expect(password.getAttribute('aria-invalid')).toBe('false');
  });
  expect(new FormData(password.closest('form') ?? undefined).get('password')).toBe('');
  expect(new FormData(date.closest('form') ?? undefined).get('date')).toBe('');
});
