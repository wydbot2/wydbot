import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

/**
 * Configura o Monaco Editor para uso local — sem CDN.
 *
 * Por padrão, `@monaco-editor/react` carrega o Monaco de jsdelivr via AMD
 * loader. Em Electron isso costuma falhar (Web Workers de origin externa,
 * AMD vs ESM, ou network). Forçamos uso do Monaco bundled localmente via
 * `loader.config({ monaco })`.
 *
 * Por que importar `monaco-editor` (full bundle) em vez de `editor.api`
 * + contribuições seletivas: o entry default (`editor.main.js`) faz os
 * imports de language contributions internamente em um único módulo, que
 * garante todas as linguagens se registram no mesmo monaco singleton. A
 * abordagem com imports seletivos é mais leve mas frágil ao Vite tree-
 * shaking e pode causar `monaco.languages.typescript` ficar undefined,
 * quebrando o `addExtraLib` do nosso DTS.
 *
 * Custo: ~1.5 MB extra de bundle (~30 idiomas que não usamos). Pra um app
 * Electron com ~120 MB de runtime, isso é ruído.
 *
 * Workers carregados via Vite `?worker` suffix:
 * - `editor.worker` — base, todos os modos
 * - `ts.worker` — language service de JS/TS (autocomplete via worker)
 *
 * Também precisa de `optimizeDeps.exclude: ['monaco-editor']` no
 * `electron.vite.config.ts`.
 *
 * Este arquivo deve ser importado UMA VEZ, no `main.tsx`, antes de
 * qualquer `<ScriptEditor>` renderizar.
 */

self.MonacoEnvironment = {
  getWorker(_moduleId: unknown, label: string): Worker {
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

loader.config({ monaco });
