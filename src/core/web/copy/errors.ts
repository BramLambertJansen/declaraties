import type { CoreErrorCode } from '../../shared/errors.ts';

// Teksten bij de basisfoutcodes (framework §5). Een app zet ze samen met de eigen codes in src/web/copy/errors.ts;
// TypeScript eist daar een tekst per code.
export const coreErrorTexts = {
  INTERNAL_ERROR: 'Er ging iets mis. Probeer het later opnieuw.',
  NOT_FOUND: 'Deze pagina of dit item bestaat niet (meer).',
  CSRF_REJECTED: 'Je verzoek is geweigerd. Vernieuw de pagina en probeer het opnieuw.',
  PAYLOAD_TOO_LARGE: 'Dit is te groot om te versturen.',
  VALIDATION: 'Controleer de ingevulde gegevens.',
  UNAUTHENTICATED: 'Je sessie is verlopen. Log opnieuw in.',
  FORBIDDEN: 'Je hebt geen toegang tot deze pagina.',
  MFA_REQUIRED: 'Bevestig eerst je verificatiecode.',
  ALREADY_EXISTS: 'Dit bestaat al.',
  RATE_LIMITED: 'Te veel pogingen. Probeer het over een paar minuten opnieuw.',
  NOT_IMPLEMENTED: 'Dit onderdeel is nog niet beschikbaar.',
} as const satisfies Record<CoreErrorCode, string>;
