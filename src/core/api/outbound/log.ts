import type { OutboundLog, OutboundLogEntry } from './types.ts';

// Standaardschrijver, zoals src/core/api/obs/request-log.ts: één JSON-regel per poging op stdout.
export const writeOutboundLine: OutboundLog = (entry) => {
  console.log(JSON.stringify(entry));
};

// Een gooiende logschrijver stopt de aanroep niet (spec uitgaande-client, Log).
export function safeLog(log: OutboundLog, entry: OutboundLogEntry): void {
  try {
    log(entry);
  } catch {
    // Bewust genegeerd: de log mag de koppeling nooit breken.
  }
}
