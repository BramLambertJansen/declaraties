import { readIntegrationSwitch } from '../db/integration-switch.ts';
import { createOutboundClient } from '../outbound/create.ts';
export const register = [createOutboundClient, readIntegrationSwitch];
