// Mag: Node-builtins (met en zonder `node:`) en relatieve imports, ook naar rails/hooks/lib.
import fs from 'node:fs';
import path from 'path';
import { hulp } from './hulp.mjs';
import { gedeeld } from '../../rails/hooks/lib/gedeeld.mjs';

export const schoon = [fs, path, hulp, gedeeld];
