import { describe, expect, test } from 'vitest';
import { authErrorCode } from './auth.ts';

// Spec eigen-account: fouten van /change-password → foutcodes uit het register.
describe('authErrorCode bij wachtwoord wijzigen', () => {
  test.each([
    [{ status: 400, code: 'INVALID_PASSWORD' }, 'WRONG_PASSWORD'],
    [{ status: 400, code: 'PASSWORD_TOO_SHORT' }, 'VALIDATION'],
    [{ status: 400, code: 'PASSWORD_TOO_LONG' }, 'VALIDATION'],
    [{ status: 400, code: 'VALIDATION' }, 'VALIDATION'],
    [{ status: 403, code: 'MFA_REQUIRED' }, 'MFA_REQUIRED'],
    [{ status: 401, code: 'UNAUTHORIZED' }, 'UNAUTHENTICATED'],
    [{ status: 429 }, 'RATE_LIMITED'],
    [{ status: 403, code: 'CSRF_REJECTED' }, 'CSRF_REJECTED'],
    [{ status: 400, code: 'CREDENTIAL_ACCOUNT_NOT_FOUND' }, 'INTERNAL_ERROR'],
    [{ status: 500 }, 'INTERNAL_ERROR'],
  ])('%o → %s', (failure, code) => {
    expect(authErrorCode('changePassword', failure)).toBe(code);
  });
});
