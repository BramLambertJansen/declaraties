import { INTEGRATION_SWITCH_MAX_AGE_MS } from '../../shared/limits.ts';
import { readIntegrationSwitch } from '../db/integration-switch.ts';
import type { Tx } from '../db/types.ts';
import { OutboundUsageError } from '../outbound/errors.ts';
import { outboundForbidden } from '../outbound/marker.ts';
import type { SwitchReading } from './types.ts';

// De lezing van de schakelaar (spec koppelingsregister, Lezen). Alleen een object uit readSwitch staat in deze WeakSet:
// een kopie of een nagemaakt object (ook via unsafeCast) geldt niet.
const issued = new WeakSet<SwitchReading>();

// Leest de stand in de transactie van withUser; alleen onder de markering (route of guardWithUser), anders
// OutboundUsageError zonder lezing.
export async function readSwitch(tx: Tx, name: string): Promise<SwitchReading> {
  if (!outboundForbidden()) {
    throw new OutboundUsageError('readSwitch: alleen binnen withUser (route of guardWithUser)');
  }
  const enabled = await readIntegrationSwitch(tx, name);
  const reading: SwitchReading = Object.freeze({ name, enabled, readAt: performance.now() });
  issued.add(reading);
  return reading;
}

// Controle 2 van IntegrationClient.call: de lezing komt van readSwitch, hoort bij deze koppeling en is niet te oud.
export function assertReading(reading: SwitchReading, name: string): void {
  if (!issued.has(reading)) throw new OutboundUsageError('client.call: de lezing komt niet van readSwitch');
  if (reading.name !== name) throw new OutboundUsageError(`client.call: de lezing hoort niet bij koppeling '${name}'`);
  if (performance.now() - reading.readAt > INTEGRATION_SWITCH_MAX_AGE_MS) {
    throw new OutboundUsageError('client.call: de lezing is ouder dan INTEGRATION_SWITCH_MAX_AGE_MS');
  }
}
