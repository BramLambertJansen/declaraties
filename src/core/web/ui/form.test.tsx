import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../lib/api-client.ts';
import { ErrorTextsProvider } from './error-texts.tsx';
import { Form, FormField, useZodForm } from './form.tsx';
import { Input } from './input.tsx';

afterEach(cleanup);

const schema = z.object({ email: z.email('Vul een geldig e-mailadres in.') }).strict();

function Invite({ onSubmit }: { onSubmit: (values: z.output<typeof schema>) => Promise<unknown> }) {
  const form = useZodForm(schema, { email: '' });
  return (
    <Form
      form={form}
      onSubmit={onSubmit}
      submitLabel="Uitnodiging versturen"
      fieldForCode={{ ALREADY_EXISTS: 'email' }}
    >
      <FormField form={form} name="email" label="E-mailadres" description="Het adres krijgt een uitnodiging.">
        {(field) => <Input {...field} />}
      </FormField>
    </Form>
  );
}

function show(onSubmit: (values: { email: string }) => Promise<unknown>) {
  render(
    <ErrorTextsProvider
      texts={{ ALREADY_EXISTS: 'Er bestaat al een account met dit e-mailadres.', INTERNAL_ERROR: 'Er ging iets mis.' }}
    >
      <Invite onSubmit={onSubmit} />
    </ErrorTextsProvider>,
  );
  return { input: screen.getByLabelText('E-mailadres'), button: screen.getByRole('button') };
}

describe('Form en FormField', () => {
  test('label boven het veld; fout pas na verlaten, gekoppeld via aria-describedby', async () => {
    const { input } = show(() => Promise.resolve());

    fireEvent.change(input, { target: { value: 'geen-adres' } });
    expect(screen.queryByText('Vul een geldig e-mailadres in.')).toBeNull();
    fireEvent.blur(input);

    const error = await screen.findByText('Vul een geldig e-mailadres in.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
  });

  test('verzendknop uit tijdens het versturen; het schema levert de waarden', async () => {
    let finish: () => void = () => undefined;
    const sent: unknown[] = [];
    const { input, button } = show(async (values) => {
      sent.push(values);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });

    fireEvent.change(input, { target: { value: 'anna@example.test' } });
    fireEvent.click(button);
    await waitFor(() => {
      expect(button.hasAttribute('disabled')).toBe(true);
    });
    act(() => {
      finish();
    });
    await waitFor(() => {
      expect(button.hasAttribute('disabled')).toBe(false);
    });
    expect(sent).toStrictEqual([{ email: 'anna@example.test' }]);
  });

  test('een serverfout die bij een veld hoort, staat onder dat veld', async () => {
    const { input, button } = show(() => Promise.reject(new ApiError('ALREADY_EXISTS', 409)));

    fireEvent.change(input, { target: { value: 'anna@example.test' } });
    fireEvent.click(button);

    expect(await screen.findByText('Er bestaat al een account met dit e-mailadres.')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('een andere serverfout komt boven het formulier en krijgt de focus', async () => {
    const { input, button } = show(() => Promise.reject(new ApiError('INTERNAL_ERROR', 500)));

    fireEvent.change(input, { target: { value: 'anna@example.test' } });
    fireEvent.click(button);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Er ging iets mis.');
    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
  });
});
