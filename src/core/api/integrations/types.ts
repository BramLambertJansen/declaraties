import type { z } from 'zod';
import type { OutboundConfig, OutboundRequest, OutboundResult } from '../outbound/types.ts';

// Publieke types van het koppelingsregister (spec koppelingsregister, ADR 0077 punt 1 en 2); index.ts exporteert ze.

export interface IntegrationTraits {
  readonly auth: 'none' | 'app-key' | 'app-oauth2' | 'on-behalf-of-user';
  readonly direction: readonly ('read' | 'write' | 'callback')[];
  readonly cadence: readonly ('on-demand' | 'periodic' | 'push')[];
  readonly sensitivity: 'normal' | 'personal-data' | 'money';
  readonly cost: 'free' | 'per-app' | 'per-user' | 'paid';
  readonly source: 'partner' | 'app' | 'shared';
}

// Eén koppeling: naam en hosts staan alleen hier (één bron), de client krijgt ze uit het register.
export interface IntegrationDef {
  readonly name: string;
  readonly hosts: readonly string[];
  readonly traits: IntegrationTraits;
}

// Wat de app per client zelf kiest; naam en hosts komen uit het register.
export type IntegrationClientConfig = Omit<OutboundConfig, 'name' | 'hosts'>;

// Een lezing van de schakelaar, gemaakt door readSwitch binnen withUser. Alleen een lezing die core maakte geldt.
export interface SwitchReading {
  readonly name: string;
  readonly enabled: boolean;
  // performance.now() bij het lezen; een lezing geldt INTEGRATION_SWITCH_MAX_AGE_MS.
  readonly readAt: number;
}

export interface IntegrationClient {
  readonly name: string;
  readonly call: <S extends z.ZodType, const E extends number = never>(
    reading: SwitchReading,
    request: OutboundRequest<S, E>,
  ) => Promise<OutboundResult<S, E>>;
}

export interface Integrations {
  // De geregistreerde namen, in de volgorde van het register (voor het script en straks het beheer, M7).
  readonly names: readonly string[];
  readonly has: (name: string) => boolean;
  // Gooit IntegrationConfigError bij een onbekende naam, OutboundConfigError bij een configuratie die niet klopt.
  readonly client: (name: string, config: IntegrationClientConfig) => IntegrationClient;
}
