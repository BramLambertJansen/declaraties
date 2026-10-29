import type { App } from './create-app.ts';

// createApp geeft alleen { fetch } terug (ADR 0040); tests sturen er een Request naartoe.
export function request(app: App, path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`http://localhost${path}`, init));
}
