// Hook "effect" (ADR 0066, spec rolhek-effect): `node rails/hooks/effect.mjs <pre|post|post-failure|edit-post|subagent-start|subagent-stop|stop>`.
// Faalt dicht waar dat kan blokkeren (AC-7): na een Bash-commando, bij SubagentStop en Stop een `decision: block`, vóór een
// Bash-commando van een subagent exit 2. Voor de hoofdsessie faalt hij open (vóór een commando, het venster, de schaduwmodus),
// behalve na haar commando met `rolhekEffectHoofdsessie: "aan"` (spec rolhek-vooraf-krimp AC-4).
import { readFileSync } from 'node:fs';
import { actorVan, handle } from './lib/effect-hooks.mjs';
import { gitIn } from './lib/effect-snapshot.mjs';
import { rolhekContext } from './lib/rolhek-context.mjs';
import { payloadCwd, projectRoot } from './lib/root.mjs';

const event = process.argv[2] ?? '';

/**
 * Met `rolhekEffectHoofdsessie: "aan"` is de hoofdsessie dader (spec rolhek-vooraf-krimp AC-4): na haar commando valt de toets
 * dan ook dicht. Is de vlag niet te lezen, dan ook (het rolhek weigert dan zelf al elk commando).
 * @param {unknown} invoer
 */
function hoofdsessieDader(invoer) {
  try {
    const cwd = payloadCwd(invoer);
    return rolhekContext(projectRoot(cwd), cwd).config.rolhekEffectHoofdsessie === 'aan';
  } catch {
    return true;
  }
}

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
  const subagent = actorVan(payload).agentType !== '';
  const dicht = ['post', 'subagent-stop', 'stop'].includes(event) && (subagent || event === 'stop' || hoofdsessieDader(payload));
  const stand = dicht || (event === 'pre' && subagent) ? 'de toets valt dicht' : 'de toets valt open (hoofdsessie)';
  const message = `rolhek-effect ${event}: interne fout, ${stand}: ${error instanceof Error ? error.message : String(error)}`;
  if (dicht) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: message }));
    process.exit(0);
  }
  process.stderr.write(`${message}\n`);
  process.exit(event === 'pre' && subagent ? 2 : 0);
}
