// Spec koppelingsvorm: de contracttestfabriek gebruikt vitest, de nep-partner, guardWithUser, readSwitch, het register en
// readEnv; zelf schendt hij geen regel.
import { describe, test } from 'vitest';
import { readEnv } from '../env.ts';
import { guardWithUser } from '../outbound/index.ts';
import { startFakePartner } from '../outbound/testing.ts';
import { readSwitch, registerIntegrations } from './index.ts';
export const testing = [describe, test, readEnv, guardWithUser, startFakePartner, readSwitch, registerIntegrations];
