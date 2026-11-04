import { expect, test } from 'vitest';
import * as core from '#core/shared/limits.ts';
import { MAX_EMAIL_LENGTH } from './limits.ts';
import { changeEmailInput } from './schemas/auth.ts';

// Spec e-maillengte/AC-5: één grens (RFC 5321) in core; de app geeft die door en het formulier legt dezelfde grens.
test('e-maillengte/AC-5: MAX_EMAIL_LENGTH is een harde grens van 254 in core en de app geeft die waarde door', () => {
  expect(core.MAX_EMAIL_LENGTH).toBe(254);
  expect(MAX_EMAIL_LENGTH).toBe(core.MAX_EMAIL_LENGTH);
});

test('e-maillengte/AC-5: het formulier laat 254 tekens door en weigert 255', () => {
  const at = (length: number) => {
    const prefix = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.`;
    return `${prefix}${'d'.repeat(length - prefix.length - '.test'.length)}.test`;
  };
  expect(changeEmailInput.safeParse({ email: at(core.MAX_EMAIL_LENGTH) }).success).toBe(true);
  expect(changeEmailInput.safeParse({ email: at(core.MAX_EMAIL_LENGTH + 1) }).success).toBe(false);
});
