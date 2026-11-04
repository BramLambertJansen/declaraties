// Foutklassen van de uitgaande client (spec uitgaande-client): gewone Errors, in een route dus INTERNAL_ERROR. Een melding
// noemt nooit een parameterwaarde, query of header.

// Bij opstart: de configuratie van createOutboundClient klopt niet.
export class OutboundConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundConfigError';
  }
}

// Een verkeerde aanroep van client.call; er gaat niets het net op.
export class OutboundUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundUsageError';
  }
}

// Een aanroep onder de markering (in withUser of afterCommit); er gaat niets het net op.
export class OutboundForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboundForbiddenError';
  }
}
