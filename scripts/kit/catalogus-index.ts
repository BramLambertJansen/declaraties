import path from 'node:path';
import type { Plugin } from 'vite';
import { componenten } from './catalogus.mjs';
import { isUiFile, relativeFile } from './catalogus-source.ts';

// Buildtijd: de browser krijgt uitsluitend de compacte index, nooit TypeScript of scripts/ meegebundeld.
export function catalogusIndex(root: string): Plugin {
  const source = path.join(root, 'src/web/ui/component-metadata.ts');
  return {
    name: 'ui-catalogue',
    transform(_code, id) {
      return path.resolve(id.split('?')[0] ?? id) === source
        ? `export const components = ${JSON.stringify(componenten(root))};`
        : null;
    },
    configureServer(server) {
      server.watcher.add([path.join(root, 'src/core/web/ui'), path.join(root, 'src/web/ui')]);
      server.watcher.on('all', (_event, file) => {
        if (!isUiFile(relativeFile(root, file)) || file.includes('.test.')) return;
        const modules = server.moduleGraph.getModulesByFile(source);
        if (modules !== undefined) for (const module of modules) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
