import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../lib/api-client.ts';
import { coreErrorTexts } from '../copy/errors.ts';
import { Form, FormField, useZodForm } from './form.tsx';
import { Input } from './input.tsx';

afterEach(cleanup);

const schema = z.object({ name: z.string() }).strict();

function Example({ code, fieldError }: { readonly code: string; readonly fieldError: () => void }) {
  const form = useZodForm(schema, { name: 'Ada' });
  // Een foute veldkeuze observeren zonder de interne padparser van RHF te laten crashen.
  const observedForm = { ...form, setError: fieldError };
  return (
    <Form
      form={observedForm}
      onSubmit={() => Promise.reject(new ApiError(code, 400))}
      submitLabel="Opslaan"
      fieldForCode={{ VALIDATION: 'name' }}
    >
      <FormField form={form} name="name" label="Naam">
        {(field) => <Input {...field} />}
      </FormField>
    </Form>
  );
}

test.each(['constructor', 'toString', '__proto__', 'onbekend'])(
  'niet-geregistreerde foutcode %s wordt een formuliermelding',
  async (code) => {
    const fieldError = vi.fn();
    render(<Example code={code} fieldError={fieldError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(coreErrorTexts.INTERNAL_ERROR);
    expect(fieldError).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
  },
);

test('een geregistreerde foutcode blijft naar het juiste veld gaan', async () => {
  const fieldError = vi.fn();
  render(<Example code="VALIDATION" fieldError={fieldError} />);
  fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));

  await waitFor(() => {
    expect(fieldError).toHaveBeenCalledWith(
      'name',
      { type: 'server', message: coreErrorTexts.VALIDATION },
      { shouldFocus: true },
    );
  });
  expect(screen.queryByRole('alert')).toBeNull();
});
