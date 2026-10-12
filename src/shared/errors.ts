import { defineErrorCodes, type ErrorCodeOf } from '#core/shared/errors.ts';

// Foutcodes van de app (spec accountbeheer, eigen-account). Teksten: src/web/copy/errors.ts (stuk 3b).
export const errors = defineErrorCodes([
  'INVALID_CREDENTIALS',
  'INVALID_TOTP',
  'INVITATION_INVALID',
  'ALREADY_ACTIVE',
  'LAST_ADMIN',
  // Spec eigen-account.
  'WRONG_PASSWORD',
  'SESSION_NOT_FRESH',
  'EMAIL_LINK_INVALID',
]);

export type ErrorCode = ErrorCodeOf<typeof errors>;
