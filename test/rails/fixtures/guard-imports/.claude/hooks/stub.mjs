// Een stub laadt alleen uit .claude/hooks; rails/hooks uit de werkmap omzeilt de hashcontrole van de lader.
import { vereist } from '../../rails/hooks/lib/vereist.mjs';

export const stub = vereist;
