// Hook "effect" (ADR 0066, spec rolhek-effect): `node rails/hooks/effect.mjs <pre|post|post-failure|edit-post|subagent-start|subagent-stop|stop>`.
// Faalt dicht waar dat kan blokkeren (AC-7): na een Bash-commando, bij SubagentStop en Stop een `decision: block`, vóór een
// Bash-commando van een subagent exit 2. Voor de hoofdsessie vóór een commando en bij het vastleggen van vensters faalt hij open:
// daar is de hoofdsessie geen dader (buiten scope, OV-1).
import { readFileSync } from 'node:fs';
import { actorVan, handle } from './lib/effect-hooks.mjs';
import { gitIn } from './lib/effect-snapshot.mjs';
import { rolhekContext } from './lib/rolhek-context.mjs';
import { payloadCwd, projectRoot } from './lib/root.mjs';

const event = process.argv[2] ?? '';
/** @type {unknown} */
let payload = null;
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
  const cwd = payloadCwd(payload);
  const root = projectRoot(cwd);
  const repo = { root, git: gitIn(root), ctx: rolhekContext(root, cwd), now: () => Date.now() };
  const uitslag = handle(event, payload, repo);
  if (uitslag.stdout !== undefined) process.stdout.write(uitslag.stdout);
  if (uitslag.stderr !== undefined) process.stderr.write(`${uitslag.stderr}\n`);
  process.exit(uitslag.exit ?? 0);
} catch (error) {
  const message = `rolhek-effect ${event}: interne fout, de toets valt dicht: ${error instanceof Error ? error.message : String(error)}`;
  const subagent = actorVan(payload).agentType !== '';
  if (['post', 'subagent-stop', 'stop'].includes(event) && (subagent || event === 'stop')) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: message }));
    process.exit(0);
  }
  process.stderr.write(`${message}\n`);
  process.exit(event === 'pre' && subagent ? 2 : 0);
}
