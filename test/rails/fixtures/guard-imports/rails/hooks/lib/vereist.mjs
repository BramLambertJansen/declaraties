// De route van #432: een npm-pakket via createRequire. Bereikbaar vanuit .claude/hooks/stub.mjs.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const vereist = require('typescript');
