// Bij opstart: het register of een aanroep van integrations.client klopt niet (spec koppelingsregister, Opstart). De melding
// noemt de naam van de koppeling en de regel.
export class IntegrationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationConfigError';
  }
}
