// Entry voor de meldhook (Notification, framework §8): de beslissing staat in lib/melding.mjs (getest in
// test/hooks/melding.test.ts). Start de melding losgekoppeld, schrijft nooit naar stdout en eindigt altijd met exit 0:
// melden mag het werk nooit hinderen (fail-open, zoals de meethook).
import { spawn } from 'node:child_process';
import { accessSync, constants, readFileSync } from 'node:fs';
import path from 'node:path';

/** @param {string} programma */
function opPad(programma) {
  return (process.env['PATH'] ?? '').split(path.delimiter).some((map) => {
    if (map === '') return false;
    try {
      accessSync(path.join(map, programma), constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function leesPayload() {
  try {
    /** @type {unknown} */
    const payload = JSON.parse(readFileSync(0, 'utf8'));
    return payload;
  } catch {
    return {};
  }
}

try {
  const { meldingOpdracht } = await import('./lib/melding.mjs');
  const opdracht = meldingOpdracht(leesPayload(), { env: process.env, heeft: opPad });
  if (opdracht !== null) {
    const kind = spawn(opdracht.command, opdracht.args, {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, ...opdracht.env },
    });
    kind.on('error', () => {});
    kind.unref();
  }
} catch {
  // Fail-open: een melding die niet lukt, hindert niets.
}
process.exitCode = 0;
